/* ============================================================
   admin/dashboard.js — school attendance overview and chart states
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const viewGuest = $("#view-guest"); const viewDashboard = $("#view-dashboard"); const publicView = $("#public-view"); const appShell = $("#app-shell");
  const State = { admin: null, students: new Map(), teachers: new Map(), otherAdmins: new Map(), sections: new Set(), attendance: new Map(), settings: { school_start_time: "08:00", late_grace_period: 5 }, last14Days: [], charts: { bars: null, mood: null }, unsubscribeConcerns: null, unsubscribeReferrals: null, initialized: false };

  function initialsOf(user) { return [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "A"; }
  function showGuest(message = "") { publicView?.classList.remove("hidden"); appShell?.classList.add("hidden"); viewGuest?.classList.remove("hidden"); viewDashboard?.classList.add("hidden"); if (message) Toast.error(message); }
  function showDashboard(user) { publicView?.classList.add("hidden"); appShell?.classList.remove("hidden"); viewGuest?.classList.add("hidden"); viewDashboard?.classList.remove("hidden"); State.admin = user; $("#user-chip")?.classList.remove("hidden"); $("#user-name")?.replaceChildren(document.createTextNode(`${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Admin")); const avatar = $("#user-avatar"); if (avatar) avatar.textContent = initialsOf(user); initDashboard(user); }
  function authMessage(error) { const code = String(error?.code || ""); if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Incorrect admin email or password."; if (code.includes("operation-not-allowed")) return "Email/password sign-in is disabled in Firebase."; if (code.includes("unauthorized-domain")) return "Add localhost to Firebase Authorized domains."; if (code.includes("invalid-api-key")) return "Firebase configuration is invalid. Check js/config.js."; return error?.message || "Admin sign-in failed."; }

  $("#form-login")?.addEventListener("submit", async event => { event.preventDefault(); const values = new FormData(event.target); const email = String(values.get("email") || "").trim(); const password = String(values.get("password") || ""); if (!Utils.isEmail(email) || password.length < 6) return Toast.error("Check your email and password."); const button = $("#btn-login"); Utils.setLoading(button, true); try { const services = ClassCare.getFirebase(); if (!services?.auth) throw Object.assign(new Error("Firebase is unavailable."), { code: "service-unavailable" }); await services.auth.signInWithEmailAndPassword(email, password); } catch (error) { console.error("[admin-auth] failed:", error); Toast.error(authMessage(error)); } finally { Utils.setLoading(button, false); } });
  $("#admin-forgot-pwd")?.addEventListener("click", async () => {
    const inputVal = String($("#admin-email")?.value || "").trim();
    let email = Utils.isEmail(inputVal) ? inputVal : "";
    if (!email) {
      email = prompt("Enter your administrator email to receive password reset instructions:", "");
      if (email === null) return;
      email = String(email).trim().toLowerCase();
    }
    if (!email || !Utils.isEmail(email)) {
      return Toast.warn("Please enter a valid administrator email address.");
    }
    try {
      const auth = ClassCare.getFirebase()?.auth;
      if (!auth) throw new Error("Authentication service is unavailable.");
      await auth.sendPasswordResetEmail(email);
      Toast.success("Password reset instructions sent! Check your inbox.");
    } catch (error) {
      console.error("[admin-forgot-pwd] error:", error);
      Toast.error(error?.message || "Could not send reset email.");
    }
  });
  $("#btn-logout")?.addEventListener("click", async () => {
    try {
      State.unsubscribeConcerns?.(); State.unsubscribeConcerns = null;
      State.unsubscribeReferrals?.(); State.unsubscribeReferrals = null;
      await ClassCare.getFirebase()?.auth?.signOut();
      Toast.info("Signed out.");
    } catch (_) { Toast.error("Could not sign out."); }
  });

  ClassCare.onCurrentUser(async user => {
    if (!user || user.__profileError || user.role !== 'admin') {
      ['_unsubUsers','_unsubAttendance','_unsubTickets','_unsubDaily','unsubscribeConcerns','unsubscribeReferrals'].forEach(key => { State[key]?.(); State[key] = null; });
      State.initialized = false; State.students.clear(); State.attendance.clear(); State._dailyDate = null;
    }
    if (!user) return showGuest();
    if (user.__profileError === "profile-not-found" && user.uid && user.email) {
      try {
        // SECURITY FIX: Only allow bootstrap if NO admins exist in the system yet
        const existingAdmins = await ClassCare.DB.users.where("role", "==", "admin").limit(1).get();
        if (existingAdmins.empty) {
          const adminProfile = {
            uid: user.uid, email: user.email,
            first_name: "IT", last_name: "Admin",
            role: "admin",
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            auto_provisioned: true
          };
          await ClassCare.DB.users.doc(user.uid).set(adminProfile);
          Toast.success("Initial admin profile created. Loading dashboard…");
          return;
        } else {
          return showGuest("No administrator profile found for this account. Contact IT administration to assign access.");
        }
      } catch (bootstrapError) {
        console.error("[admin-bootstrap] verification failed:", bootstrapError);
        return showGuest("Administrator verification failed. Check permissions or ask IT administration.");
      }
    }
    if (user.__profileError) return showGuest("Your ClassCare profile could not be read. Check your connection or ask IT administration to verify access.");
    if (user.role !== "admin") { Toast.warn("This workspace is for IT administration."); setTimeout(() => location.replace("../index.html"), 700); return; }
    showDashboard(user);
  });

  async function initDashboard(admin) {
    if (State.initialized && State.admin?.uid === admin.uid) return;
    State.initialized = true; State.last14Days = lastNDays(14); bindTabs();
    try { State.settings = await ClassCare.DB.getSettings(); } catch (error) { console.warn("[admin] settings unavailable:", error); }
    await loadUsers(); await loadAttendance(); renderTopStats(); renderHeatmap(); await renderBarsChart(); await renderMoodChart(); await renderActivityFeed();
    listenUsers(); listenAttendance(); listenGlobalConcerns();
    State._unsubTickets?.();
    State._unsubTickets = ClassCare.DB.helpdesk_tickets.where('status', '==', 'Open').onSnapshot(snap => {
      $('#stat-tickets')?.replaceChildren(document.createTextNode(String(snap.size)));
    }, () => $('#stat-tickets')?.replaceChildren(document.createTextNode('Unavailable')));
    initDailyAttendanceLog();
    if (window.AdminShared?.initFilters) window.AdminShared.initFilters(State);
    const sectionSelect = $("#overview-section"); sectionSelect?.addEventListener("change", renderBarsChart, { once: true });
  }
  function normalizeRole(value) { return String(value || "").trim().toLowerCase(); }
  function normalizeSection(value) { return String(value || "").trim().replace(/[\s_]+/g, " ").replace(/[-–—]+/g, " ").replace(/\s+/g, " "); }

  async function loadUsers() {
    State.students.clear(); State.teachers.clear(); State.otherAdmins.clear(); State.sections.clear();
    try {
      const snapshot = await ClassCare.DB.users.get();
      applyUsersSnapshot(snapshot);
    } catch (error) {
      console.error("[admin] people load failed:", error);
      showOverviewState("People data unavailable", error?.code === "permission-denied" ? "You do not have permission to view people." : "Check your connection and retry.");
    }
  }
  function applyUsersSnapshot(snapshot) {
    snapshot.forEach(doc => {
      const raw = doc.data() || {};
      const user = {
        ...raw,
        uid: doc.id,
        role: normalizeRole(raw.role),
        section: normalizeSection(raw.section)
      };
      if (user.role === "student") State.students.set(user.uid, user);
      else if (user.role === "teacher") State.teachers.set(user.uid, user);
      else if (user.role === "admin" && user.uid !== State.admin?.uid) State.otherAdmins.set(user.uid, user);
      if (user.section) State.sections.add(user.section);
      if (Array.isArray(user.assigned_sections)) {
        user.assigned_sections.forEach(s => s && State.sections.add(normalizeSection(s)));
      }
    });
    if (State.settings?.master_sections && Array.isArray(State.settings.master_sections)) {
      State.settings.master_sections.forEach(s => s && State.sections.add(normalizeSection(s)));
    }
    updatePendingAccountsUI();
  }
  function isPendingStudent(user) {
    return user?.role === "student" && (user.pending_approval === true || user.status === "pending" || user.enrollment_status === "pending");
  }
  function updatePendingAccountsUI() {
    const pendingTeachers = Array.from(State.teachers.values()).filter(t => t.pending_approval);
    const pendingStudents = Array.from(State.students.values()).filter(isPendingStudent);
    const count = pendingTeachers.length + pendingStudents.length;
    const badge = $("#admin-pending-teachers-badge");
    const banner = $("#admin-pending-teachers-banner");
    const text = $("#admin-pending-teachers-count-text");

    if (badge) {
      badge.textContent = `${count} pending`;
      badge.classList.toggle("hidden", count === 0);
    }
    if (banner) {
      banner.classList.toggle("hidden", count === 0);
      banner.style.display = count > 0 ? "flex" : "none";
    }
    if (text) {
      const parts = [];
      if (pendingStudents.length) parts.push(`${pendingStudents.length} student ${pendingStudents.length === 1 ? "account request" : "account requests"}`);
      if (pendingTeachers.length) parts.push(`${pendingTeachers.length} teacher ${pendingTeachers.length === 1 ? "account" : "accounts"}`);
      text.textContent = count === 0
        ? "No student or teacher accounts are waiting for approval."
        : `${parts.join(" and ")} ${count === 1 ? "requires" : "require"} IT administration approval.`;
    }
  }
  function listenUsers() {
    if (State._unsubUsers) State._unsubUsers();
    try {
      State._unsubUsers = ClassCare.DB.users.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          const raw = change.doc.data() || {};
          const user = { ...raw, uid: change.doc.id, role: normalizeRole(raw.role), section: normalizeSection(raw.section) };
          if (change.type === "removed") {
            State.students.delete(user.uid); State.teachers.delete(user.uid); State.otherAdmins.delete(user.uid);
          } else {
            if (user.role === "student") { State.students.set(user.uid, user); State.teachers.delete(user.uid); State.otherAdmins.delete(user.uid); }
            else if (user.role === "teacher") { State.teachers.set(user.uid, user); State.students.delete(user.uid); State.otherAdmins.delete(user.uid); }
            else if (user.role === "admin" && user.uid !== State.admin?.uid) { State.otherAdmins.set(user.uid, user); State.students.delete(user.uid); State.teachers.delete(user.uid); }
            else { State.students.delete(user.uid); State.teachers.delete(user.uid); }
            if (user.section) State.sections.add(user.section);
            if (Array.isArray(user.assigned_sections)) {
              user.assigned_sections.forEach(s => s && State.sections.add(normalizeSection(s)));
            }
          }
        });
        if (State.settings?.master_sections && Array.isArray(State.settings.master_sections)) {
          State.settings.master_sections.forEach(s => s && State.sections.add(normalizeSection(s)));
        }
        updatePendingAccountsUI();
        renderTopStats(); renderHeatmap(); renderBarsChart();
        if (window.AdminShared?.initFilters) window.AdminShared.initFilters(State);
      }, error => { console.warn("[admin] users listener failed:", error); });
    } catch (error) { console.warn("[admin] realtime users unavailable:", error); }
  }
  async function loadAttendance() {
    State.attendance.clear();
    try {
      let snapshot;
      try {
        snapshot = await ClassCare.DB.attendance
          .where("date", ">=", State.last14Days[0])
          .where("date", "<=", State.last14Days[State.last14Days.length - 1])
          .get();
      } catch (rangeErr) {
        console.warn("[admin] range query fallback:", rangeErr);
        snapshot = await ClassCare.DB.attendance.get();
      }
      snapshot.forEach(doc => {
        const record = { id: doc.id, ...doc.data() };
        if (record.student_uid && record.date) State.attendance.set(`${record.student_uid}_${record.date}`, record);
      });
    } catch (error) {
      console.error("[admin] attendance load failed:", error);
      showOverviewState("Attendance data unavailable", error?.code === "permission-denied" ? "You do not have permission to view attendance." : "Check the connection and retry.");
    }
  }
  function listenAttendance() {
    if (State._unsubAttendance) State._unsubAttendance();
    const handleSnapshot = snapshot => {
      snapshot.docChanges().forEach(change => {
        const record = { id: change.doc.id, ...change.doc.data() };
        if (!record.student_uid || !record.date) return;
        const key = `${record.student_uid}_${record.date}`;
        if (change.type === "removed") State.attendance.delete(key);
        else State.attendance.set(key, record);
      });
      renderTopStats(); renderHeatmap(); renderBarsChart(); renderMoodChart();
      if (typeof renderDailyAttendanceLog === "function") renderDailyAttendanceLog();
    };
    try {
      State._unsubAttendance = ClassCare.DB.attendance
        .where("date", ">=", State.last14Days[0])
        .where("date", "<=", State.last14Days[State.last14Days.length - 1])
        .onSnapshot(handleSnapshot, error => {
          console.warn("[admin] attendance listener range failed; falling back:", error);
          try {
            State._unsubAttendance = ClassCare.DB.attendance.onSnapshot(handleSnapshot, () => {});
          } catch (_) {}
        });
    } catch (error) {
      try {
        State._unsubAttendance = ClassCare.DB.attendance.onSnapshot(handleSnapshot, () => {});
      } catch (_) {}
    }

    try {
      if (window.BroadcastChannel) {
        if (State._unsubBc) { State._unsubBc.close(); State._unsubBc = null; }
        State._unsubBc = new BroadcastChannel("classcare_attendance_sync");
        State._unsubBc.onmessage = event => {
          const msg = event.data;
          if (msg && (msg.type === "attendance_update" || msg.type === "deep_check_saved")) {
            renderTopStats(); renderHeatmap(); renderBarsChart(); renderMoodChart();
            if (typeof renderDailyAttendanceLog === "function") renderDailyAttendanceLog();
          }
        };
      }
    } catch (_) {}
  }
  function showOverviewState(title, message) { const target = $("#overview-bars-state"); if (!target) return; target.className = "state-panel state-error"; target.innerHTML = `<strong>${ClassCareUI.escapeHtml(title)}</strong><span>${ClassCareUI.escapeHtml(message)}</span>`; }
  function showChartState(id, type, title, message) { const target = $(id); if (!target) return; target.className = `state-panel state-${type}`; target.innerHTML = `<strong>${ClassCareUI.escapeHtml(title)}</strong><span>${ClassCareUI.escapeHtml(message)}</span>`; }
  function bindTabs() {
    if (bindTabs.bound) return; bindTabs.bound = true;
    $$(`[data-tab]`).forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
    $("#btn-review-pending-teachers")?.addEventListener("click", () => {
      showTab("users");
      const roleSel = $("#users-role");
      if (roleSel) {
        roleSel.value = "pending";
        roleSel.dispatchEvent(new Event("change"));
      }
    });
    window.AdminUI = { showTab };
    const hash = location.hash.replace(/^#tab-/, ""); if (hash) showTab(hash);
  }
  function showTab(tab) {
    const tabs = ["overview", "users", "grades", "helpdesk", "wellbeing", "settings"];
    if (!tabs.includes(tab)) tab = "overview";
    $$(`[data-tab-link]`).forEach(link => {
      const active = link.dataset.tabLink === tab;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    tabs.forEach(name => {
      const panel = $(`#tab-${name}`);
      if (panel) panel.classList.toggle("hidden", name !== tab);
    });

    const meta = {
      overview: { title: "School attendance", sub: "Find the section or record that needs attention." },
      users: { title: "People & Roster", sub: "Search people, roles, credentials, and assigned sections." },
      grades: { title: "School-Wide Grades", sub: "God Mode: Real-time academic performance and grade overrides." },
      helpdesk: { title: "Help requests", sub: "Reply to students and keep requests moving." },
      wellbeing: { title: "Student Wellbeing Intelligence", sub: "Guidance counselor view: Multi-day distress patterns, teacher escalation referrals, and confidential student submissions." },
      settings: { title: "Settings & System Controls", sub: "Master timing, section capacity, and enrollment settings." }
    };
    const cur = meta[tab] || meta.overview;
    const topTitle = $(".topbar-title");
    const topSub = $(".topbar-subtitle");
    const mobTitle = $(".mobile-topbar-title");
    if (topTitle) topTitle.textContent = cur.title;
    if (topSub) topSub.textContent = cur.sub;
    if (mobTitle) mobTitle.textContent = cur.title;

    if (tab === "wellbeing") loadCounselorPatterns();
  }
  function lastNDays(count) { const days = []; const today = new Date(); for (let index = count - 1; index >= 0; index -= 1) { const date = new Date(today); date.setDate(today.getDate() - index); days.push([date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")); } return days; }
  function renderTopStats() { const today = Utils.todayIso(); let scanned = 0; let late = 0; State.students.forEach(student => { const record = State.attendance.get(`${student.uid}_${today}`); if (record) { scanned += 1; if (record.status === "Late") late += 1; } }); $("#stat-students")?.replaceChildren(document.createTextNode(String(State.students.size))); $("#stat-today")?.replaceChildren(document.createTextNode(String(scanned))); $("#stat-today-pct")?.replaceChildren(document.createTextNode(State.students.size ? `${Math.round(scanned / State.students.size * 100)}% recorded` : "No students")); $("#stat-late")?.replaceChildren(document.createTextNode(String(late)));  }
  function heatColor(rate) { if (rate <= 0) return "#dcfce7"; if (rate < .25) return "#fef3c7"; if (rate < .5) return "#fed7aa"; if (rate < .75) return "#fca5a5"; return "#b91c1c"; }
  function renderHeatmap() {
    const header = $("#heatmap-header"); const body = $("#heatmap-body"); if (!header || !body) return;
    header.innerHTML = `<span></span>${State.last14Days.map(date => `<span>${ClassCareUI.escapeHtml(new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`)))}</span>`).join("")}`;
    const grouped = new Map(); State.students.forEach(student => { const section = student.section || "No section"; if (!grouped.has(section)) grouped.set(section, []); grouped.get(section).push(student.uid); });
    body.innerHTML = Array.from(grouped.keys()).sort().map(section => { const uids = grouped.get(section); const cells = State.last14Days.map(date => { const absent = uids.reduce((count, uid) => count + (State.attendance.get(`${uid}_${date}`)?.status === "Absent" ? 1 : 0), 0); const rate = uids.length ? absent / uids.length : 0; return `<button type="button" class="heat-cell" data-section="${ClassCareUI.escapeHtml(section).replace(/"/g, "&quot;")}" data-date="${date}" style="background:${heatColor(rate)}" aria-label="${ClassCareUI.escapeHtml(`${section}, ${date}: ${absent} of ${uids.length} absent`)}"></button>`; }).join(""); return `<div class="heatmap-row"><span class="heatmap-section" title="${ClassCareUI.escapeHtml(section)}">${ClassCareUI.escapeHtml(section)}</span>${cells}</div>`; }).join("");
    body.querySelectorAll(".heat-cell").forEach(cell => cell.addEventListener("click", () => { body.querySelectorAll(".heat-cell").forEach(item => item.classList.remove("is-selected")); cell.classList.add("is-selected"); const section = cell.dataset.section; const date = cell.dataset.date; const uids = grouped.get(section) || []; const absent = uids.reduce((count, uid) => count + (State.attendance.get(`${uid}_${date}`)?.status === "Absent" ? 1 : 0), 0); $("#heatmap-detail").textContent = `${section} · ${date}: ${absent} of ${uids.length} students explicitly marked Absent.`; }));
  }
  async function renderBarsChart() {
    const select = $("#overview-section"); const section = select?.value || ""; const students = Array.from(State.students.values()).filter(student => !section || student.section === section); const data = State.last14Days.map(date => { const values = { Present: 0, Late: 0, Absent: 0 }; students.forEach(student => { const status = State.attendance.get(`${student.uid}_${date}`)?.status; if (values[status] != null) values[status] += 1; }); return values; }); const sum = data.reduce((total, value) => ({ Present: total.Present + value.Present, Late: total.Late + value.Late, Absent: total.Absent + value.Absent }), { Present: 0, Late: 0, Absent: 0 }); $("#ov-present").textContent = `Present ${sum.Present}`; $("#ov-late").textContent = `Late ${sum.Late}`; $("#ov-absent").textContent = `Absent ${sum.Absent}`;
    if (!window.Chart) return showChartState("#overview-bars-state", "error", "Chart unavailable", "Use the summary and heatmap while the chart library is offline.");
    if (!students.length || !data.some(item => item.Present || item.Late || item.Absent)) return showChartState("#overview-bars-state", "empty", "No attendance records match this filter.", "Change the section or date range to review another record.");
    $("#overview-bars-state")?.classList.add("hidden"); $("#overview-bars-wrap")?.classList.remove("hidden"); const context = $("#overview-bars")?.getContext("2d"); if (!context) return;
    const config = { type: "bar", data: { labels: State.last14Days.map(date => date.slice(5)), datasets: [{ label: "Present", data: data.map(item => item.Present), backgroundColor: "#15803d", stack: "attendance" }, { label: "Late", data: data.map(item => item.Late), backgroundColor: "#a16207", stack: "attendance" }, { label: "Absent", data: data.map(item => item.Absent), backgroundColor: "#b91c1c", stack: "attendance" }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { stacked: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue("--text-muted") } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: getComputedStyle(document.documentElement).getPropertyValue("--text-muted") } } } } };
    if (State.charts.bars) {
      try { State.charts.bars.destroy(); } catch (_) {}
      State.charts.bars = null;
    }
    State.charts.bars = new Chart(context, config);
  }
  async function renderMoodChart() {
    if (!window.Chart) return showChartState("#mood-chart-state", "error", "Wellbeing chart unavailable", "Attendance records remain available above.");
    try {
      const counts = window.AnalyticsPrivacy.completedByDate(State.attendance.values(), State.last14Days);
      const hasData = Object.values(counts).some(Boolean);
      if (!hasData) return showChartState("#mood-chart-state", "empty", "No wellbeing check-ins yet.", "The chart will populate after students complete their daily check-in.");
      $("#mood-chart-state")?.classList.add("hidden"); $("#mood-chart-wrap")?.classList.remove("hidden");
      const moodCtx = $("#mood-chart")?.getContext("2d"); if (!moodCtx) return;
      const moodConfig = {
        type: "line",
        data: {
          labels: State.last14Days.map(date => date.slice(5)),
          datasets: [{
            label: "Completed check-ins",
            data: State.last14Days.map(date => counts[date]),
            borderColor: "#2d5f7c",
            backgroundColor: "rgba(45, 95, 124, 0.12)",
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: "#2d5f7c"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      };
      if (State.charts.mood) {
        try { State.charts.mood.destroy(); } catch (_) {}
        State.charts.mood = null;
      }
      State.charts.mood = new Chart(moodCtx, moodConfig);
    } catch (error) { console.warn("[admin] wellbeing chart unavailable:", error); showChartState("#mood-chart-state", "error", "Wellbeing data unavailable", "Attendance remains available."); }
  }
  let dailyCache = new Map();

  function initDailyAttendanceLog() {
    const dateInput = $("#overview-log-date");
    if (dateInput && !dateInput.value) {
      dateInput.value = Utils.todayIso();
    }
    populateOverviewSections();
    dateInput?.addEventListener("change", () => renderDailyAttendanceLog(true));
    $("#overview-log-section")?.addEventListener("change", () => renderDailyAttendanceLog(false));
    $("#overview-log-status")?.addEventListener("change", () => renderDailyAttendanceLog(false));
    $("#overview-log-refresh")?.addEventListener("click", () => renderDailyAttendanceLog(true));
    $("#btn-export-attendance-csv")?.addEventListener("click", exportAttendanceCsv);
    renderDailyAttendanceLog();
  }

  function populateOverviewSections() {
    const select = $("#overview-log-section");
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">All sections</option>' +
      Array.from(State.sections).sort().map(s => `<option value="${ClassCareUI.escapeHtml(s).replace(/"/g, "&quot;")}">${ClassCareUI.escapeHtml(s)}</option>`).join("");
    if (current && State.sections.has(current)) select.value = current;
  }

  async function renderDailyAttendanceLog(forceRefresh = false) {
    const tbody = $("#overview-attendance-tbody");
    if (!tbody) return;

    populateOverviewSections();
    const date = $("#overview-log-date")?.value || Utils.todayIso();
    const section = $("#overview-log-section")?.value || "";
    const statusFilter = $("#overview-log-status")?.value || "";

    if (State._dailyDate !== date) {
      State._unsubDaily?.(); State._dailyDate = date;
      State._unsubDaily = ClassCare.DB.attendance.where('date', '==', date).onSnapshot(snap => {
        const records = new Map();
        snap.forEach(doc => { const d = { ...doc.data(), id: doc.id }; if (d.student_uid) records.set(d.student_uid, d); });
        dailyCache.set(date, records); renderDailyAttendanceLog();
      }, error => { tbody.textContent = 'Attendance unavailable: ' + error.message; });
    }

    const dayRecords = dailyCache.get(date) || new Map();
    const students = Array.from(State.students.values()).filter(st => {
      if (section && String(st.section || "").toLowerCase() !== section.toLowerCase()) return false;
      return true;
    }).sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`));

    const rows = [];
    students.forEach(st => {
      const rec = dayRecords.get(st.uid) || State.attendance.get(`${st.uid}_${date}`) || null;
      const status = rec?.status || "Not recorded";
      if (statusFilter && status !== statusFilter) return;
      rows.push({ student: st, record: rec, status });
    });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="state-panel state-empty"><strong>No attendance records found.</strong><span>No students match the selected date and filters.</span></div></td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(item => {
      const st = item.student;
      const rec = item.record;
      const status = item.status;
      const name = `${st.first_name || ""} ${st.last_name || ""}`.trim() || st.email || "Student";
      const initials = [st.first_name?.[0], st.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "S";
      const timeIn = rec?.time_in || "—";
      const timeOut = rec?.time_out || "—";
      const minsLate = rec?.minutes_late > 0 ? `<span class="status-badge status-late" style="font-size:0.75rem;">+${rec.minutes_late}m</span>` : "—";

      const statusBadge = status === "Present"
        ? '<span class="status-badge status-present">Present</span>'
        : status === "Late"
          ? '<span class="status-badge status-late">Late</span>'
          : status === "Absent"
            ? '<span class="status-badge status-absent">Absent</span>'
            : '<span class="status-badge not-recorded">Not recorded</span>';

      let quotaLabel = "—";
      if (rec?.quota_source === "teacher_override") {
        quotaLabel = `<span style="font-size:0.8rem;color:var(--c-primary);" title="${ClassCareUI.escapeHtml(rec.subject || '')}">Teacher Override (${ClassCareUI.escapeHtml(rec.subject || 'Class')})</span>`;
      } else if (rec?.session) {
        quotaLabel = `<span style="font-size:0.8rem;color:var(--text-muted);">${rec.session === "morning" ? "🌅 Morning Master" : "☀️ Afternoon Master"}</span>`;
      } else if (rec) {
        quotaLabel = '<span style="font-size:0.8rem;color:var(--text-muted);">DepEd Schedule</span>';
      }

      return `<tr>
        <td>
          <div class="identity-cell">
            <span class="identity-avatar">${ClassCareUI.escapeHtml(initials)}</span>
            <span>
              <span class="identity-name">${ClassCareUI.escapeHtml(name)}</span>
              <span class="identity-meta tabular">${ClassCareUI.escapeHtml(st.student_id || "No ID")}</span>
            </span>
          </div>
        </td>
        <td><strong>${ClassCareUI.escapeHtml(st.section || "—")}</strong></td>
        <td class="tabular">${ClassCareUI.escapeHtml(timeIn)}</td>
        <td class="tabular" style="text-align:center;">${minsLate}</td>
        <td class="tabular">${ClassCareUI.escapeHtml(timeOut)}</td>
        <td>${statusBadge}</td>
        <td>${quotaLabel}</td>
        <td class="align-right">
          <button type="button" class="btn btn-ghost btn-sm" data-log-correct-uid="${ClassCareUI.escapeHtml(st.uid).replace(/"/g, "&quot;")}" data-log-correct-name="${ClassCareUI.escapeHtml(name).replace(/"/g, "&quot;")}">Correct</button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-log-correct-uid]").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.logCorrectUid;
        const name = btn.dataset.logCorrectName;
        if (window.AdminShared?.openOverrideWithDate) {
          window.AdminShared.openOverrideWithDate(State, uid, name, date);
        }
      });
    });
  }

  function exportAttendanceCsv() {
    const date = $("#overview-log-date")?.value || Utils.todayIso();
    const section = $("#overview-log-section")?.value || "";
    const dayRecords = dailyCache.get(date) || new Map();
    const students = Array.from(State.students.values()).filter(st => {
      if (section && String(st.section || "").toLowerCase() !== section.toLowerCase()) return false;
      return true;
    }).sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`));

    if (!students.length) return Toast.warn("No attendance records to export.");

    const headers = ["Date", "Student ID", "Student Name", "Section", "Time In", "Minutes Late", "Time Out", "Status", "Quota Applied", "Quota Source", "Subject"];
    const escapeCsv = val => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(escapeCsv).join(",")];

    students.forEach(st => {
      const rec = dayRecords.get(st.uid) || State.attendance.get(`${st.uid}_${date}`) || {};
      lines.push([
        escapeCsv(date),
        escapeCsv(st.student_id || ""),
        escapeCsv(`${st.first_name || ""} ${st.last_name || ""}`.trim() || st.email),
        escapeCsv(st.section || ""),
        escapeCsv(rec.time_in || ""),
        escapeCsv(rec.minutes_late || 0),
        escapeCsv(rec.time_out || ""),
        escapeCsv(rec.status || "Not recorded"),
        escapeCsv(rec.quota_applied ? "YES" : "NO"),
        escapeCsv(rec.quota_source || "master_schedule"),
        escapeCsv(rec.subject || "")
      ].join(","));
    });

    const csvBlob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ClassCare_Attendance_${date}${section ? '_' + section.replace(/\s+/g, '_') : ''}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Toast.success("Attendance exported to CSV.");
  }

  async function renderActivityFeed() { /* The overview intentionally stays exception-first; routine activity is handled in Help requests and audit records. */ }

  // ─── Guidance Counselor Early-Pattern Flag View ─────────────────────────────
  function updateCounselorSummaryStats() {
    const patternCount = parseInt($("#stat-wellbeing-patterns")?.textContent || "0", 10) || 0;
    const referralCount = parseInt($("#stat-wellbeing-escalations")?.textContent || "0", 10) || 0;
    const concernCount = parseInt($("#stat-wellbeing-concerns")?.textContent || "0", 10) || 0;
    const previewEl = $("#overview-counselor-preview");
    if (previewEl) {
      if (patternCount === 0 && referralCount === 0 && concernCount === 0) {
        previewEl.textContent = "All quiet: No active distress patterns or urgent concerns across school sections.";
      } else {
        previewEl.innerHTML = `<strong>${patternCount}</strong> persistent distress flags · <strong>${referralCount}</strong> active referrals · <strong>${concernCount}</strong> student inquiries`;
      }
    }
  }

  function renderCounselorReferrals(referralsSnap) {
    const referralTbody = $("#counselor-referrals-tbody");
    if (!referralTbody) return;
    const referrals = referralsSnap.docs ? referralsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : (Array.isArray(referralsSnap) ? referralsSnap : []);
    const openReferrals = referrals.filter(r => r.status !== "Resolved");
    $("#stat-wellbeing-escalations")?.replaceChildren(document.createTextNode(String(openReferrals.length)));
    $("#counselor-referral-badge")?.replaceChildren(document.createTextNode(`${openReferrals.length} Active`));
    updateCounselorSummaryStats();

    if (!referrals.length) {
      referralTbody.innerHTML = `<tr><td colspan="7"><div class="state-panel state-empty"><strong>No teacher escalations</strong><span>When teachers escalate intervention alerts, referrals appear here.</span></div></td></tr>`;
      return;
    }

    referralTbody.innerHTML = referrals.map(r => {
      const dateStr = r.referred_at?.toDate ? r.referred_at.toDate().toLocaleDateString() : (r.referred_at ? String(r.referred_at).slice(0, 10) : "—");
      const statusBadge = r.status === "Resolved"
        ? `<span class="status-badge status-present">Resolved</span>`
        : (r.status === "Contacted"
            ? `<span class="status-badge status-late">Contacted</span>`
            : `<span class="status-badge status-absent">Referred</span>`);
      const actions = r.status === "Resolved"
        ? `<span style="font-size:0.75rem;color:var(--text-muted);">Completed</span>`
        : `<div style="display:flex;gap:4px;justify-content:flex-end;">
            <button type="button" class="btn btn-ghost btn-sm" data-referral-contact="${ClassCareUI.escapeHtml(r.id)}">Contacted</button>
            <button type="button" class="btn btn-primary btn-sm" data-referral-resolve="${ClassCareUI.escapeHtml(r.id)}">Resolve</button>
          </div>`;
      return `<tr>
        <td>
          <div style="font-weight:600;">${ClassCareUI.escapeHtml(r.student_name || "Student")}</div>
          <div class="tabular" style="font-size:0.75rem;color:var(--text-muted);">${ClassCareUI.escapeHtml(r.student_id || "")}</div>
        </td>
        <td>${ClassCareUI.escapeHtml(r.section || "—")}</td>
        <td>
          <div style="font-size:0.85rem;font-weight:600;">${ClassCareUI.escapeHtml(r.emotion_label || r.emotion || "Distressed")} ${r.average_grade ? `· Grade ${r.average_grade}` : ""}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);">${ClassCareUI.escapeHtml(r.reason || "Teacher escalated")}</div>
        </td>
        <td style="font-size:0.82rem;">${ClassCareUI.escapeHtml(r.referred_by_name || "Teacher")}</td>
        <td class="tabular" style="font-size:0.82rem;">${ClassCareUI.escapeHtml(dateStr)}</td>
        <td>${statusBadge}</td>
        <td class="align-right">${actions}</td>
      </tr>`;
    }).join("");

    referralTbody.querySelectorAll("[data-referral-contact]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await ClassCare.DB.concern_referrals.doc(btn.dataset.referralContact).set({
            status: "Contacted",
            contacted_at: firebase.firestore.FieldValue.serverTimestamp(),
            contacted_by: State.admin?.uid || ""
          }, { merge: true });
          Toast.success("Referral status updated to Contacted.");
        } catch (err) { Toast.error("Could not update referral."); }
      });
    });

    referralTbody.querySelectorAll("[data-referral-resolve]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await ClassCare.DB.concern_referrals.doc(btn.dataset.referralResolve).set({
            status: "Resolved",
            resolved_at: firebase.firestore.FieldValue.serverTimestamp(),
            resolved_by: State.admin?.uid || ""
          }, { merge: true });
          Toast.success("Referral marked resolved.");
        } catch (err) { Toast.error("Could not resolve referral."); }
      });
    });
  }

  function renderCounselorConcerns(concernsSnap) {
    const concernTbody = $("#counselor-concerns-tbody");
    if (!concernTbody) return;
    const concerns = concernsSnap.docs ? concernsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : (Array.isArray(concernsSnap) ? concernsSnap : []);
    const openConcerns = concerns.filter(c => c.status !== "Resolved");
    $("#stat-wellbeing-concerns")?.replaceChildren(document.createTextNode(String(openConcerns.length)));
    $("#counselor-concern-badge")?.replaceChildren(document.createTextNode(`${openConcerns.length} Active`));
    updateCounselorSummaryStats();

    if (!concerns.length) {
      concernTbody.innerHTML = `<tr><td colspan="6"><div class="state-panel state-empty"><strong>No student submissions</strong><span>Submissions from the student &quot;Talk to Someone&quot; channel will appear here confidentially.</span></div></td></tr>`;
      return;
    }

    concernTbody.innerHTML = concerns.map(c => {
      const dateStr = c.submitted_at?.toDate
        ? c.submitted_at.toDate().toLocaleDateString()
        : (c.timestamp?.toDate
            ? c.timestamp.toDate().toLocaleDateString()
            : (c.submitted_at || c.submitted_date || "—"));
      const anonBadge = c.is_anonymous ? `<span class="status-badge status-late" style="font-size:0.7rem;">Anonymous</span>` : "";
      const catMap = {
        bullying: "🛡️ Bullying",
        mental_health: "💙 Mental Health",
        family: "🏠 Family / Home",
        academic: "📚 Academic",
        other: "💬 Other"
      };
      const catLabel = catMap[c.concern_type] || c.concern_type || "General";
      const normStatus = (c.status === "Resolved" || c.status === "Solved") ? "Solved" : c.status === "In Progress" ? "In Progress" : "Not Solved";
      const statusBadge = normStatus === "Solved"
        ? `<span class="status-badge status-present">Solved</span>`
        : (normStatus === "In Progress"
            ? `<span class="status-badge status-late">In Progress</span>`
            : `<span class="status-badge status-absent">Not Solved</span>`);
      const msgPreview = (c.message || "—").slice(0, 80) + ((c.message || "").length > 80 ? "…" : "");
      return `<tr data-admin-concern-row="${ClassCareUI.escapeHtml(c.id)}" style="cursor:pointer;" title="Click to view details">
        <td>
          <div style="font-weight:600;">${ClassCareUI.escapeHtml(c.student_name || "Student")} ${anonBadge}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${ClassCareUI.escapeHtml(c.section || "—")}</div>
        </td>
        <td style="font-size:0.85rem;font-weight:600;">${ClassCareUI.escapeHtml(catLabel)}</td>
        <td style="font-size:0.82rem;color:var(--text-secondary);max-width:280px;">${ClassCareUI.escapeHtml(msgPreview)}</td>
        <td class="tabular" style="font-size:0.82rem;">${ClassCareUI.escapeHtml(dateStr)}</td>
        <td>${statusBadge}</td>
        <td class="align-right">
          <button type="button" class="btn btn-ghost btn-sm" data-view-concern="${ClassCareUI.escapeHtml(c.id)}">View Details</button>
        </td>
      </tr>`;
    }).join("");

    concernTbody.querySelectorAll("tr[data-admin-concern-row]").forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        const item = concerns.find(c => c.id === tr.dataset.adminConcernRow);
        if (item) openConcernDetailModal(item);
      });
    });

    concernTbody.querySelectorAll("[data-view-concern]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const item = concerns.find(c => c.id === btn.dataset.viewConcern);
        if (item) openConcernDetailModal(item);
      });
    });
  }

  async function loadCounselorPatterns() {
    const patternTbody = $("#counselor-patterns-tbody");
    const referralTbody = $("#counselor-referrals-tbody");
    const concernTbody = $("#counselor-concerns-tbody");
    if (!patternTbody) return;

    patternTbody.innerHTML = `<tr><td colspan="6"><div class="state-panel state-loading"><strong>Analyzing student check-ins…</strong></div></td></tr>`;
    if (referralTbody && !State.unsubscribeReferrals) {
      referralTbody.innerHTML = `<tr><td colspan="7"><div class="state-panel state-loading"><strong>Loading teacher referrals…</strong></div></td></tr>`;
    }
    if (concernTbody && !State.unsubscribeConcerns) {
      concernTbody.innerHTML = `<tr><td colspan="6"><div class="state-panel state-loading"><strong>Loading student concerns…</strong></div></td></tr>`;
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const cutoffDate = fourteenDaysAgo.toISOString().slice(0, 10);

    try {
      // 1. Check-ins for pattern detection (optimized query with fallback)
      let checkinsSnap;
      try {
        checkinsSnap = await ClassCare.DB.emotional_checkins
          .where("is_negative", "==", true)
          .where("date", ">=", cutoffDate)
          
          .get();
      } catch (idxErr) {
        console.warn("[counselor] composite index query fallback:", idxErr);
        checkinsSnap = await ClassCare.DB.emotional_checkins
          .where("date", ">=", cutoffDate)
          
          .get();
      }

      const studentNegativeMap = new Map();
      checkinsSnap.forEach(doc => {
        const data = doc.data() || {};
        if (!data.student_uid || !data.is_negative) return;

        if (!studentNegativeMap.has(data.student_uid)) {
          const profile = State.students.get(data.student_uid) || {};
          studentNegativeMap.set(data.student_uid, {
            uid: data.student_uid,
            name: `${profile.first_name || data.student_name || ""} ${profile.last_name || ""}`.trim() || "Student",
            student_id: profile.student_id || data.student_id || "—",
            section: profile.section || data.section || "—",
            parent_email: profile.parent_email || "",
            count: 0,
            emotions: {},
            lastDate: "",
            lastNote: ""
          });
        }
        const item = studentNegativeMap.get(data.student_uid);
        item.count += 1;
        const emoLabel = data.emotion_label || data.emotion || "Distressed";
        item.emotions[emoLabel] = (item.emotions[emoLabel] || 0) + 1;
        if (!item.lastDate || data.date > item.lastDate) {
          item.lastDate = data.date || "";
          if (data.note) item.lastNote = data.note;
        }
      });

      const flagged = Array.from(studentNegativeMap.values())
        .filter(s => s.count >= 3)
        .sort((a, b) => b.count - a.count);

      $("#stat-wellbeing-patterns")?.replaceChildren(document.createTextNode(String(flagged.length)));
      $("#counselor-pattern-badge")?.replaceChildren(document.createTextNode(`${flagged.length} Flagged`));
      updateCounselorSummaryStats();

      if (!flagged.length) {
        patternTbody.innerHTML = `<tr><td colspan="6"><div class="state-panel state-empty"><strong>No persistent distress patterns detected 🎉</strong><span>No students have recorded 3 or more negative check-ins in the past 14 days.</span></div></td></tr>`;
      } else {
        patternTbody.innerHTML = flagged.map(s => {
          const topEmotions = Object.entries(s.emotions).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} (${n})`).join(", ");
          const priorityBadge = s.count >= 5
            ? `<span class="status-badge status-absent">High Priority (${s.count}d)</span>`
            : `<span class="status-badge status-late">Moderate (${s.count}d)</span>`;
          return `<tr>
            <td>
              <div style="font-weight:600;">${ClassCareUI.escapeHtml(s.name)}</div>
              <div class="tabular" style="font-size:0.75rem;color:var(--text-muted);">${ClassCareUI.escapeHtml(s.student_id)}</div>
            </td>
            <td>${ClassCareUI.escapeHtml(s.section)}</td>
            <td style="text-align:center;">${priorityBadge}</td>
            <td style="font-size:0.85rem;">${ClassCareUI.escapeHtml(topEmotions)}</td>
            <td style="font-size:0.82rem;max-width:240px;color:var(--text-muted);">${ClassCareUI.escapeHtml(s.lastNote || "No note entered")}</td>
            <td class="align-right">
              <button type="button" class="btn btn-ghost btn-sm" data-reach-out="${ClassCareUI.escapeHtml(s.uid)}">Log Outreach</button>
            </td>
          </tr>`;
        }).join("");

        patternTbody.querySelectorAll("[data-reach-out]").forEach(btn => {
          btn.addEventListener("click", () => {
            const uid = btn.dataset.reachOut;
            const student = studentNegativeMap.get(uid);
            const note = prompt(`Log counselor outreach for ${student?.name || "Student"}:\nEnter counseling action or support provided:`);
            if (note && note.trim()) {
              ClassCare.DB.logAudit(State.admin?.uid || "", "counselor_outreach", {
                student_uid: uid,
                student_name: student?.name || "",
                section: student?.section || "",
                counselor_note: note.trim(),
                logged_at: new Date().toISOString()
              });
              Toast.success("Counselor outreach logged to audit trail.");
            }
          });
        });
      }

      // 2. Attach live listener for Teacher Referrals if not already active
      if (referralTbody && !State.unsubscribeReferrals) {
        State.unsubscribeReferrals = ClassCare.DB.concern_referrals
          .orderBy("referred_at", "desc")
          .limit(50)
          .onSnapshot(referralsSnap => {
            renderCounselorReferrals(referralsSnap);
          }, err => {
            console.warn("[counselor] referral listener error:", err);
            ClassCare.DB.concern_referrals.limit(50).get().then(renderCounselorReferrals).catch(() => {});
          });
      }

      // 3. Attach live listener for Student Concerns ("Talk to Someone") with helpdesk_tickets fallback
      if (concernTbody && !State.unsubscribeConcerns) {
        const concernsMap = new Map();
        function syncAndRenderAll() {
          const all = Array.from(concernsMap.values()).sort((a, b) => {
            const ta = a.submitted_at?.toDate?.()?.getTime?.() || a.submitted_at?.toMillis?.() || a.timestamp?.toDate?.()?.getTime?.() || a.timestamp?.toMillis?.() || 0;
            const tb = b.submitted_at?.toDate?.()?.getTime?.() || b.submitted_at?.toMillis?.() || b.timestamp?.toDate?.()?.getTime?.() || b.timestamp?.toMillis?.() || 0;
            return tb - ta;
          });
          renderCounselorConcerns(all);
        }

        // 1. Live listener for talkToSomeone collection
        try {
          ClassCare.DB.talkToSomeone.limit(100).onSnapshot(snap => {
            snap.docs.forEach(d => concernsMap.set(d.id, { id: d.id, ...d.data() }));
            syncAndRenderAll();
          }, () => {
            ClassCare.DB.talkToSomeone.limit(50).get().then(snap => {
              snap.docs.forEach(d => concernsMap.set(d.id, { id: d.id, ...d.data() }));
              syncAndRenderAll();
            }).catch(() => {});
          });
        } catch (_) {}

        // 2. Live listener for helpdesk_tickets (fallback channel)
        try {
          ClassCare.DB.helpdesk_tickets.where("is_concern", "==", true).limit(50).onSnapshot(hdSnap => {
            hdSnap.docs.forEach(d => concernsMap.set(d.id, { id: d.id, ...d.data() }));
            syncAndRenderAll();
          }, () => {});
        } catch (_) {}

        // 3. Live listener for concern_submissions
        try {
          State.unsubscribeConcerns = ClassCare.DB.concern_submissions
            .limit(100)
            .onSnapshot(concernsSnap => {
              concernsSnap.docs.forEach(d => concernsMap.set(d.id, { id: d.id, ...d.data() }));
              syncAndRenderAll();
            }, err => {
              console.warn("[counselor] concern listener fallback:", err);
              ClassCare.DB.concern_submissions.limit(50).get().then(snap => {
                snap.docs.forEach(d => concernsMap.set(d.id, { id: d.id, ...d.data() }));
                syncAndRenderAll();
              }).catch(() => {});
            });
        } catch (_) {}
      }
    } catch (err) {
      console.error("[counselor] load patterns failed:", err);
      patternTbody.innerHTML = `<tr><td colspan="6"><div class="state-panel state-error"><strong>Could not load wellbeing intelligence</strong><span>${err?.code === "permission-denied" ? "Permission denied. Admin role required." : "A network error occurred."}</span></div></td></tr>`;
    }
  }

  function openConcernDetailModal(item) {
    const modal = $("#counselor-concern-modal");
    const body = $("#concern-modal-body");
    if (!modal || !body) return;

    const dateStr = item.submitted_at?.toDate ? item.submitted_at.toDate().toLocaleString() : "—";
    let currentStatus = (item.status === "Resolved" || item.status === "Solved") ? "Solved" : item.status === "In Progress" ? "In Progress" : "Not Solved";

    const getStatusBadge = s => s === "Solved"
      ? `<span class="status-badge status-present">Solved</span>`
      : (s === "In Progress"
          ? `<span class="status-badge status-late">In Progress</span>`
          : `<span class="status-badge status-absent">Not Solved</span>`);

    body.innerHTML = `
      <div style="background:var(--bg-muted);padding:14px;border-radius:8px;border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:1rem;font-weight:700;">${ClassCareUI.escapeHtml(item.student_name || "Student")}</div>
          <div style="display:flex;gap:6px;align-items:center;" id="admin-concern-status-badge-wrap">
            <span class="status-badge ${item.is_anonymous ? "status-late" : "status-present"}">${item.is_anonymous ? "Anonymous" : "Named Submission"}</span>
            ${getStatusBadge(currentStatus)}
          </div>
        </div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">Section: ${ClassCareUI.escapeHtml(item.section || "—")} · Submitted: ${ClassCareUI.escapeHtml(dateStr)}</div>
        <div style="margin-top:8px;font-size:0.85rem;">Category: <strong>${ClassCareUI.escapeHtml(item.concern_type_label || item.concern_type || "General")}</strong></div>
      </div>

      <div style="margin-top:12px;">
        <label class="field-label">Confidential Message</label>
        <div style="background:var(--bg-card);padding:12px;border:1px solid var(--border-subtle);border-radius:6px;font-size:0.88rem;white-space:pre-wrap;line-height:1.5;">${ClassCareUI.escapeHtml(item.message || "")}</div>
      </div>

      <div style="margin-top:14px;padding:12px;border-radius:8px;background:var(--panel-muted);border:1px solid var(--border);">
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          <span>⚡ Admin God Mode: Status & Counselor Override</span>
        </div>
        
        <label class="field-label" style="margin-bottom:4px;">Override Status</label>
        <div style="display:flex;gap:8px;margin-bottom:12px;" id="admin-concern-status-btns">
          <button type="button" class="btn btn-sm ${currentStatus === 'Not Solved' ? 'btn-danger' : 'btn-secondary'}" data-admin-status="Not Solved">Not Solved</button>
          <button type="button" class="btn btn-sm ${currentStatus === 'In Progress' ? 'btn-secondary' : 'btn-ghost'}" data-admin-status="In Progress" style="${currentStatus === 'In Progress' ? 'font-weight:800;border:2px solid var(--c-late);' : ''}">In Progress</button>
          <button type="button" class="btn btn-sm ${currentStatus === 'Solved' ? 'btn-primary' : 'btn-secondary'}" data-admin-status="Solved">Solved</button>
        </div>

        <label class="field-label" for="admin-concern-notes">Administrative / Counselor Notes</label>
        <textarea id="admin-concern-notes" class="input" style="min-height:75px;font-size:0.85rem;resize:vertical;" placeholder="Add intervention instructions, counselor notes, or administrative override context...">${ClassCareUI.escapeHtml(item.counselor_notes || item.admin_notes || "")}</textarea>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:16px;">
        <button type="button" class="btn btn-secondary" data-close-concern-modal>Close</button>
        <button type="button" class="btn btn-primary" id="btn-admin-save-concern-override">
          Save Admin Override
        </button>
      </div>
    `;

    const statusBtns = body.querySelectorAll("[data-admin-status]");
    statusBtns.forEach(btn => {
      btn.onclick = () => {
        currentStatus = btn.getAttribute("data-admin-status");
        statusBtns.forEach(b => {
          const s = b.getAttribute("data-admin-status");
          const active = s === currentStatus;
          b.className = `btn btn-sm ${active ? (s === "Solved" ? "btn-primary" : s === "In Progress" ? "btn-secondary" : "btn-danger") : "btn-secondary"}`;
          b.style.fontWeight = active ? "800" : "500";
        });
        const badgeWrap = $("#admin-concern-status-badge-wrap");
        if (badgeWrap) {
          badgeWrap.innerHTML = `
            <span class="status-badge ${item.is_anonymous ? "status-late" : "status-present"}">${item.is_anonymous ? "Anonymous" : "Named Submission"}</span>
            ${getStatusBadge(currentStatus)}
          `;
        }
      };
    });

    const saveBtn = body.querySelector("#btn-admin-save-concern-override");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const notes = (body.querySelector("#admin-concern-notes")?.value || "").trim();
        Utils.setLoading(saveBtn, true);
        try {
          const payload = {
            status: currentStatus,
            counselor_notes: notes,
            admin_notes: notes,
            admin_override_by: State?.admin?.uid || "admin",
            admin_override_at: firebase.firestore.FieldValue.serverTimestamp()
          };
          try { await ClassCare.DB.concern_submissions.doc(item.id).set(payload, { merge: true }); } catch (_) {}
          try { await ClassCare.DB.talkToSomeone.doc(item.id).set(payload, { merge: true }); } catch (_) {}
          item.status = currentStatus;
          item.counselor_notes = notes;
          item.admin_notes = notes;
          Toast.success(`Concern updated to "${currentStatus}" with counselor notes.`);
          modal.classList.add("hidden");
          modal.classList.remove("flex", "is-open");
          modal.style.display = "none";
          renderCounselorConcerns(State.counselorConcerns || []);
        } catch (err) {
          console.error("[admin-override] save error:", err);
          Toast.error("Failed to save override. Check connection.");
        } finally {
          Utils.setLoading(saveBtn, false);
        }
      };
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex", "is-open");
    modal.style.display = "flex";

    body.querySelectorAll("[data-close-concern-modal]").forEach(btn => {
      btn.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex", "is-open");
        modal.style.display = "none";
      });
    });
  }

  // ─── Real-time Global Talk to Someone Concern Notifications ──────────────
  let _lastNotifiedConcernId = null;
  let _adminConcernsInitial = true;
  function listenGlobalConcerns() {
    if (State.unsubscribeConcernsGlobal) return;
    try {
      _adminConcernsInitial = true;
      State.unsubscribeConcernsGlobal = ClassCare.DB.concern_submissions
        .orderBy("submitted_at", "desc")
        .limit(50)
        .onSnapshot(snap => {
          let openCount = 0;
          snap.forEach(doc => {
            const data = doc.data() || {};
            const statusNorm = String(data.status || "").toLowerCase();
            if (statusNorm !== "resolved" && statusNorm !== "solved") openCount++;
          });

          // Check for newly arrived unread concern
          if (!_adminConcernsInitial) {
            snap.docChanges().forEach(change => {
              if (change.type === "added") {
                const d = change.doc.data() || {};
                const docId = change.doc.id;
                const statusNorm = String(d.status || "").toLowerCase();
                if (statusNorm !== "resolved" && statusNorm !== "solved" && docId !== _lastNotifiedConcernId) {
                  _lastNotifiedConcernId = docId;
                  SoundFeedback.play("tap");
                  Toast.warn(`⚠️ Care Alert (Global): New confidential student submission: "${d.concern_type_label || d.concern_type || "Student Inquiry"}"!`, { duration: 8000 });
                }
              }
            });
          }
          _adminConcernsInitial = false;

          const badge = $("#admin-wellbeing-badge");
          const topbarBadge = $("#admin-topbar-alerts-count");
          const preview = $("#overview-counselor-preview");

          if (badge) {
            badge.textContent = String(openCount);
            badge.classList.toggle("hidden", openCount === 0);
          }
          if (topbarBadge) {
            topbarBadge.textContent = String(openCount);
            topbarBadge.classList.toggle("hidden", openCount === 0);
          }
          if (preview && openCount > 0) {
            preview.innerHTML = `<strong style="color:var(--c-primary);">${openCount} open confidential concern${openCount > 1 ? "s" : ""}</strong> requiring counselor review.`;
          }
        }, err => {
          console.warn("[admin] global concern listener fallback:", err);
          ClassCare.DB.concern_submissions.limit(50).get().then(snap => {
            const openCount = snap.docs.filter(d => (d.data() || {}).status !== "Resolved").length;
            const badge = $("#admin-wellbeing-badge");
            const topbarBadge = $("#admin-topbar-alerts-count");
            if (badge) { badge.textContent = String(openCount); badge.classList.toggle("hidden", openCount === 0); }
            if (topbarBadge) { topbarBadge.textContent = String(openCount); topbarBadge.classList.toggle("hidden", openCount === 0); }
          }).catch(() => {});
        });
    } catch (e) {
      console.warn("[admin] listenGlobalConcerns error:", e);
    }
  }

  // ─── Weekly Wellness Digest (EmailJS) ──────────────────────────────────────
  async function sendWellnessDigest() {
    const cfg = (typeof CONFIG !== "undefined" && CONFIG.emailjs) || window.ClassCare?.EMAILJS_CONFIG || window.CLASSCARE_CONFIG?.emailjs || {};
    if (!cfg.publicKey || !cfg.serviceId || !cfg.templateId || String(cfg.publicKey).startsWith("YOUR_")) {
      return Toast.warn("EmailJS is not fully configured in js/config.js. Please provide valid serviceId, templateId, and publicKey.");
    }

    // Ensure students are populated
    let students = Array.from(State.students.values());
    if (!students.length) {
      try {
        const uSnap = await ClassCare.DB.users.where("role", "==", "student").get();
        students = uSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
      } catch (_) {}
    }

    const eligible = students.filter(s => s.parent_email && Utils.isEmail(s.parent_email));
    if (!eligible.length) {
      return Toast.warn("No enrolled students have a valid parent email on file. Add parent emails in the People tab.");
    }

    if (!confirm(`Send the Weekly Wellness Digest to ${eligible.length} registered parent(s)?\n\nThis compiles a 7-day attendance and mood report per student and sends it via EmailJS.`)) {
      return;
    }

    const statusLabels = [$("#digest-status-label")];
    const setStatus = txt => statusLabels.forEach(l => { if (l) l.textContent = txt; });
    setStatus(`Preparing 7-day digest data...`);
    Toast.info(`Generating digest for ${eligible.length} parents...`);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const cutoffIso = sevenDaysAgo.toISOString().slice(0, 10);

    // 1. Fetch past 7 days of emotional checkins
    let checkinMap = new Map();
    try {
      const snap = await ClassCare.DB.emotional_checkins.where("date", ">=", cutoffIso).get();
      snap.forEach(d => {
        const c = d.data() || {};
        if (!c.student_uid) return;
        if (!checkinMap.has(c.student_uid)) checkinMap.set(c.student_uid, { pos: 0, neg: 0 });
        const entry = checkinMap.get(c.student_uid);
        if (c.is_negative) entry.neg += 1;
        else entry.pos += 1;
      });
    } catch (e) {
      console.warn("[digest] check-ins fetch failed:", e);
    }

    // 2. Fetch past 7 days of attendance records directly from Firestore for 100% accuracy
    let directAttendanceMap = new Map();
    try {
      const attSnap = await ClassCare.DB.attendance.where("date", ">=", cutoffIso).get();
      attSnap.forEach(d => {
        const a = d.data() || {};
        if (!a.student_uid || !a.date) return;
        directAttendanceMap.set(`${a.student_uid}_${a.date}`, a);
      });
    } catch (attErr) {
      console.warn("[digest] direct attendance fetch fallback:", attErr);
    }

    // Initialize EmailJS SDK if available
    if (window.emailjs && typeof window.emailjs.init === "function") {
      try {
        window.emailjs.init({ publicKey: cfg.publicKey });
      } catch (_) {}
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < eligible.length; i++) {
      const student = eligible[i];
      setStatus(`Sending ${i + 1} of ${eligible.length}...`);

      let pres = 0, late = 0, abs = 0;
      const last7Days = State.last14Days ? State.last14Days.slice(-7) : lastNDays(7);
      last7Days.forEach(date => {
        const key = `${student.uid}_${date}`;
        const att = directAttendanceMap.get(key) || State.attendance.get(key);
        if (att?.status === "Present") pres += 1;
        else if (att?.status === "Late") late += 1;
        else if (att?.status === "Absent") abs += 1;
      });

      const mood = checkinMap.get(student.uid) || { pos: 0, neg: 0 };
      const studentName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";

      const templateParams = {
        to_name: `Parent of ${studentName}`,
        to_email: student.parent_email,
        student_name: studentName,
        section: student.section || "—",
        attendance_summary: `${pres} Present, ${late} Late, ${abs} Absent (past 7 days)`,
        wellness_summary: `${mood.pos} positive days, ${mood.neg} challenging days recorded`,
        message: `Dear Parent/Guardian,\n\nHere is your student's weekly summary from ClassCare for the past 7 days:\n• Attendance: ${pres} Present, ${late} Late, ${abs} Absent\n• Wellbeing Check-ins: ${mood.pos} positive, ${mood.neg} challenging\n${mood.neg >= 3 ? "\n⚠️ Note: School counselors monitor multi-day distress and are available for student support.\n" : ""}\nThank you for partnering with us in your child's education!\n— ClassCare School Administration`
      };

      let emailSent = false;
      // Option A: Use emailjs.send SDK
      if (window.emailjs && typeof window.emailjs.send === "function") {
        try {
          await window.emailjs.send(cfg.serviceId, cfg.templateId, templateParams, cfg.publicKey);
          emailSent = true;
          sent += 1;
        } catch (sdkErr) {
          console.warn("[digest] EmailJS SDK send error, trying REST API:", sdkErr);
        }
      }

      // Option B: REST API fallback
      if (!emailSent) {
        try {
          const payload = {
            service_id: cfg.serviceId,
            template_id: cfg.templateId,
            user_id: cfg.publicKey,
            template_params: templateParams
          };
          const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            sent += 1;
            emailSent = true;
          } else {
            failed += 1;
          }
        } catch (err) {
          console.warn("[digest] send error for", student.parent_email, err);
          failed += 1;
        }
      }

      if (i < eligible.length - 1) await new Promise(r => setTimeout(r, 250));
    }

    setStatus(`Last sent: ${new Date().toLocaleTimeString()} (${sent} sent, ${failed} failed)`);
    if (sent > 0) {
      Toast.success(`Weekly digest sent to ${sent} parent(s)!${failed ? ` (${failed} failed)` : ""}`);
      ClassCare.DB.logAudit(State.admin?.uid || "", "weekly_wellness_digest_sent", {
        recipient_count: sent,
        failed_count: failed,
        sent_at: new Date().toISOString()
      });
    } else {
      Toast.error(`Failed to send digest. Check EmailJS quota and network connection.`);
    }
  }

  // Wire up action buttons
  $("#btn-refresh-counselor")?.addEventListener("click", () => loadCounselorPatterns());
  $("#btn-send-wellness-digest")?.addEventListener("click", () => sendWellnessDigest());
  $("#btn-settings-send-digest")?.addEventListener("click", () => sendWellnessDigest());

  document.addEventListener("classcare:admin-refresh", () => {
    renderTopStats();
    renderHeatmap();
    renderBarsChart();
    renderMoodChart();
    renderDailyAttendanceLog();
    loadCounselorPatterns();
  });

  function cleanupAdminDashboard() {
    ['_unsubUsers', '_unsubAttendance', '_unsubTickets', '_unsubDaily', 'unsubscribeConcerns', 'unsubscribeReferrals', 'unsubscribeConcernsGlobal'].forEach(key => {
      try { State[key]?.(); } catch (_) {}
      State[key] = null;
    });
    if (State._unsubBc) {
      try { State._unsubBc.close(); } catch (_) {}
      State._unsubBc = null;
    }
  }

  window.addEventListener("pagehide", cleanupAdminDashboard);
  window.addEventListener("beforeunload", cleanupAdminDashboard);

  window.AdminState = State;
  window.sendWellnessDigest = sendWellnessDigest;
  window.loadCounselorPatterns = loadCounselorPatterns;
})();
