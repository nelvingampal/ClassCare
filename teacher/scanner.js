/* ============================================================
   teacher/scanner.js — camera, manual QR, register, and sync state
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const viewGuest = $("#view-guest");
  const viewDashboard = $("#view-dashboard");
  const publicView = $("#public-view");
  const appShell = $("#app-shell");
  const userChip = $("#user-chip");
  const EMOTION_QUESTIONS = [
    "Did you feel happy today?",
    "Did you enjoy your classes today?",
    "Did you feel safe and supported today?",
    "Did you finish your activities today?",
    "Did you feel ready to learn today?"
  ];
  const EMOTION_DELAY_MS = 20;
  const WELLBEING_SURVEY_DELAY_MS = 20;
  const WELLBEING_HOVER_MS = 900;
  const WELLBEING_CHOICES = ["A", "B", "C", "D"];
  const WELLBEING_CHOICE_LABELS = { A: "Very much", B: "Mostly", C: "A little", D: "Not at all" };
  const WELLBEING_QUESTIONS = [
    { q: "Did you feel happy today?", choices: { A: "Very much", B: "Mostly", C: "A little", D: "Not at all" } },
    { q: "Did you enjoy your classes today?", choices: { A: "Very much", B: "Mostly", C: "A little", D: "Not at all" } },
    { q: "Did you feel safe and supported today?", choices: { A: "Very safe", B: "Mostly safe", C: "A little", D: "Not at all" } },
    { q: "Did you finish your activities today?", choices: { A: "All of them", B: "Most of them", C: "A few", D: "Not yet" } },
    { q: "Did you feel ready to learn today?", choices: { A: "Very ready", B: "Mostly ready", C: "A little", D: "Not ready" } }
  ];
  const HAND_LANDMARK_INDEX = { INDEX_FINGER_TIP: 8 };
  function createWellbeingState() {
    return {
      active: false, pending: false, phase: "idle", token: 0, studentUid: "", student: null, recordId: "",
      questionIndex: 0, answers: Array(WELLBEING_QUESTIONS.length).fill(null), startTimer: null, advanceTimer: null,
      autoDismissTimer: null, timerInterval: null, selectedEmotion: null,
      handsFrameId: null, frameBusy: false, lastFrameAt: 0, hands: null, resizeObserver: null,
      cameraStream: null, video: null, canvas: null, ctx: null, resumeScanner: false,
      hoveredChoice: "", hoveredSince: 0, lastLockUntil: 0, answerInFlight: false, handErrorAt: 0
    };
  }
  const State = {
    teacher: null, section: "", sections: new Set(), students: new Map(), attendance: new Map(), enrolledUids: new Set(),
    settings: { school_start_time: "07:30", late_grace_period: 15, time_out_start: "15:00" }, scanner: null,
    scanning: false, transitioning: false, scanInFlight: false, generation: 0, unsubscribeAttendance: null, unsubscribeVibeCheck: null, bound: false,
    lastScanTs: 0, lastDuplicateAlertTs: 0, nextDayTimer: null, wellbeing: createWellbeingState(),
    intervention: {
      emotionCache: new Map(),   // studentUid -> {emotion, date}
      gradeCache: new Map(),     // studentUid -> {average, deped}
      createdAlertKeys: new Set(), // dedupe keys
      unsubAlerts: null,
      openAlerts: 0,
      lastEvalAt: 0
    }
  };
  let currentScanKey = "";

  // NEW: Web Audio API sound feedback helper for scanner & intervention alerts
  const SoundFeedback = (function () {
    let audioCtx = null;
    function getAudioContext() {
      if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    function play(type = "success") {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === "tap") {
          // Soft warm chime for emotion selection
          osc.type = "sine";
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
          osc.start(now);
          osc.stop(now + 0.21);
          if (navigator.vibrate) navigator.vibrate(30);
        } else if (type === "success") {
          // Cheerful bell chime
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.23);
          if (navigator.vibrate) navigator.vibrate(40);
        } else if (type === "warning") {
          // Soft warning double beep
          osc.type = "triangle";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(392, now + 0.08);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.26);
          if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
        } else if (type === "intervention") {
          // Distinct 3-tone intervention chime
          osc.type = "sine";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(554.37, now + 0.09);
          osc.frequency.setValueAtTime(659.25, now + 0.18);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          osc.start(now);
          osc.stop(now + 0.40);
          if (navigator.vibrate) navigator.vibrate([60, 50, 80]);
        } else if (type === "error") {
          // Gentle low tone
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.15);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.23);
          if (navigator.vibrate) navigator.vibrate(100);
        }
      } catch (_) {}
    }

    return { play };
  })();

  const CAMERA_TIMEOUT_MS = 12000;
  const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

  function withTimeout(promise, timeoutMs = CAMERA_TIMEOUT_MS) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Camera request timed out."), { code: "camera-timeout", name: "TimeoutError" })), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function sectionValue(value) {
    return String(value || "").trim().replace(/[\s_]+/g, " ").replace(/[-–—]+/g, " ").replace(/\s+/g, " ");
  }
  function sectionKey(value) { return sectionValue(value).toLowerCase(); }
  function sectionMatchesPrefix(parent, candidate) {
    const expected = sectionKey(parent);
    const actual = sectionKey(candidate);
    if (!expected) return true;
    if (!actual) return false;
    const normalizedExpected = expected.replace(/[^a-z0-9]/g, "");
    const normalizedActual = actual.replace(/[^a-z0-9]/g, "");
    if (!normalizedExpected) return true;
    if (actual === expected) return true;
    return normalizedActual === normalizedExpected || normalizedActual.startsWith(normalizedExpected) || normalizedExpected.startsWith(normalizedActual);
  }
  function getTeacherAssignedSections(user) {
    if (!user || normalizeRole(user.role) === "admin") return [];
    const list = [];
    if (Array.isArray(user.teaching_assignments) && user.teaching_assignments.length) {
      user.teaching_assignments.forEach(a => {
        const sec = typeof a === "object" ? a?.section : a;
        const v = sectionValue(sec);
        if (v && !list.includes(v)) list.push(v);
      });
    }
    if (Array.isArray(user.assigned_sections) && user.assigned_sections.length) {
      user.assigned_sections.forEach(s => {
        const v = sectionValue(s);
        if (v && !list.includes(v)) list.push(v);
      });
    }
    if (user.section) {
      const v = sectionValue(user.section);
      if (v && !list.includes(v)) list.push(v);
    }
    return list;
  }
  function matchesSectionFilter(student) {
    const selected = sectionKey(State.section); if (!selected) return true;
    return sectionKey(student.section) === selected || sectionMatchesPrefix(selected, student.section);
  }
  function sectionQueries(collection, section, role = "") {
    const teacherSections = getTeacherAssignedSections(State.teacher);
    const assigned = sectionValue(section);
    const targetSections = assigned ? [assigned] : (teacherSections.length ? teacherSections : []);
    if (!targetSections.length) return [collection];
    const queries = [];
    targetSections.forEach(sec => {
      if (!sec) return;
      queries.push(collection.where("section", "==", sec));
      const variant1 = sec.replace(/[-–—]/g, " ");
      const variant2 = sec.replace(/\s+/g, "-");
      if (variant1 !== sec) queries.push(collection.where("section", "==", variant1));
      if (variant2 !== sec && variant2 !== variant1) queries.push(collection.where("section", "==", variant2));
    });
    if (!queries.length) queries.push(collection);
    return queries;
  }
  function attendanceQueries(user) {
    const today = Utils.todayIso();
    return [ClassCare.DB.attendance.where("date", "==", today)];
  }
  function initialsOf(user) { return [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "T"; }
  function escapeHtml(value) { return ClassCareUI.escapeHtml(value); }
  function escapeAttr(value) { return escapeHtml(value).replace(/"/g, "&quot;"); }

  function ensureWellbeingOverlay() {
    let overlay = $("#wellbeing-survey-overlay") || $("#emotion-overlay");
    if (overlay) return overlay;
    const frame = $(".scanner-frame-wrap") || $("#camera-frame-wrap") || $("#scanner-root")?.parentElement || document.body;
    if (!frame) return null;
    const emotionPanel = $("#emotion-panel", frame);
    const markup = `
      <div id="wellbeing-survey-overlay" class="wellbeing-overlay hidden" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="wellbeing-title">
        <div class="emotion-tap-card">
          <div class="emotion-tap-header">
            <div id="wellbeing-avatar" class="user-avatar emotion-tap-avatar">S</div>
            <div style="flex:1;min-width:0;">
              <div id="wellbeing-student-name" class="emotion-tap-student-name">Student</div>
              <div id="wellbeing-student-meta" class="emotion-tap-student-meta">✓ Attendance Recorded</div>
            </div>
            <button id="wellbeing-skip" class="btn btn-ghost btn-sm" type="button" style="color:var(--text-muted);font-size:0.8rem;padding:4px 10px;">Skip</button>
          </div>
          <div class="emotion-tap-body">
            <span class="emotion-tap-prompt-badge">Emotional Well-being Check-in</span>
            <h2 id="wellbeing-title" class="emotion-tap-title">How are you feeling this morning?</h2>
            <p class="emotion-tap-subtitle">Tap once or show a hand gesture (👍 Happy, ✌️ Calm, ✋ Excited, 👎 Stressed).</p>
            <div class="emotion-tap-grid" id="wellbeing-emotion-grid"></div>
            <div id="wellbeing-feedback" class="emotion-tap-feedback hidden"></div>
            <div class="emotion-tap-timer-bar">
              <div id="wellbeing-timer-progress" class="emotion-tap-timer-fill"></div>
            </div>
          </div>
        </div>
      </div>`;
    if (emotionPanel) emotionPanel.insertAdjacentHTML("afterend", markup);
    else frame.insertAdjacentHTML("afterbegin", markup);
    overlay = $("#wellbeing-survey-overlay");
    overlay?.querySelector("#wellbeing-skip")?.addEventListener("click", () => { teardownWellbeingSurvey(); });
    return overlay;
  }

  function showGuest(message = "") {
    if ($('#auth-required')) $('#auth-required').hidden = false;
    if ($('#kiosk-content')) $('#kiosk-content').hidden = true;
    cleanupScanner(); State.generation++; State.students.clear(); State.attendance.clear(); State.teacher = null;
    publicView?.classList.remove("hidden"); appShell?.classList.add("hidden");
    viewGuest?.classList.remove("hidden"); viewDashboard?.classList.add("hidden"); userChip?.classList.add("hidden");
    ClassCareUI?.setAuthState(false);
    if (message) Toast.error(message);
  }
  function showDashboard(user) {
    if ($('#auth-required')) $('#auth-required').hidden = true;
    if ($('#kiosk-content')) $('#kiosk-content').hidden = false;
    publicView?.classList.add("hidden"); appShell?.classList.remove("hidden");
    viewGuest?.classList.add("hidden"); viewDashboard?.classList.remove("hidden"); userChip?.classList.remove("hidden");
    ClassCareUI?.setAuthState(true);
    $("#user-name")?.replaceChildren(document.createTextNode(`${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Teacher"));
    const roleEl = document.querySelector(".classcare-profile-role");
    if (roleEl) roleEl.textContent = normalizeRole(user.role) === "admin" ? "Administrator" : (user.position || "Teacher");
    const avatar = $("#user-avatar"); if (avatar) avatar.textContent = initialsOf(user);
    $("#today-label")?.replaceChildren(document.createTextNode(Utils.todayIso()));
    initTeacherDashboard(user);
  }

  function studentFromDoc(doc) {
    const data = doc.data() || {};
    return { ...data, uid: doc.id, role: String(data.role || "").trim().toLowerCase(), section: data.section || "" };
  }
  function normalizeRole(role) { return String(role || "").trim().toLowerCase(); }
  async function getQuerySnapshots(queries) {
    const results = await Promise.allSettled(queries.map(query => query.get()));
    return results.filter(result => result.status === "fulfilled").map(result => result.value);
  }
  function listenToQueries(queries, onNext, onError) {
    const unsubscribe = [];
    let errors = 0;
    queries.forEach(query => {
      try {
        unsubscribe.push(query.onSnapshot(onNext, () => { errors += 1; if (errors >= queries.length) onError?.(Object.assign(new Error("All listeners failed"), { code: "listeners-failed" })); }));
      } catch (_) { errors += 1; }
    });
    if (errors >= queries.length) setTimeout(() => onError?.(Object.assign(new Error("Listeners could not attach"), { code: "listeners-failed" })), 0);
    return () => unsubscribe.forEach(stop => stop?.());
  }

  $("#form-login")?.addEventListener("submit", async event => {
    event.preventDefault();
    const values = new FormData(event.target); const email = String(values.get("email") || "").trim(); const password = String(values.get("password") || "");
    if (!Utils.isEmail(email) || password.length < 6) return Toast.error("Check your email and password.");
    const button = $("#btn-login"); Utils.setLoading(button, true);
    try {
      const services = ClassCare.getFirebase(); if (!services?.auth) throw Object.assign(new Error("Firebase is unavailable."), { code: "service-unavailable" });
      await services.auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error("[teacher-auth] sign-in failed:", error);
      const code = String(error?.code || "");
      const message = code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")
        ? "Incorrect teacher email or password. Use the email registered in this Firebase project."
        : code.includes("operation-not-allowed")
          ? "Email/password sign-in is disabled in Firebase. Ask the administrator to enable it."
          : code.includes("unauthorized-domain")
            ? "This website is not authorized in Firebase. Add localhost to Firebase Authorized domains."
            : code.includes("invalid-api-key")
              ? "Firebase configuration is invalid. Check js/config.js."
              : error?.message || "Sign-in failed.";
      Toast.error(message);
    }
    finally { Utils.setLoading(button, false); }
  });

  $("#teacher-forgot-pwd")?.addEventListener("click", async () => {
    const inputVal = String($("#teacher-login-email")?.value || "").trim();
    let email = Utils.isEmail(inputVal) ? inputVal : "";
    if (!email) {
      email = prompt("Enter your teacher email to receive password reset instructions:", "");
      if (email === null) return;
      email = String(email).trim().toLowerCase();
    }
    if (!email || !Utils.isEmail(email)) {
      return Toast.warn("Please enter a valid teacher email address.");
    }
    try {
      const auth = ClassCare.getFirebase()?.auth;
      if (!auth) throw new Error("Authentication service is unavailable.");
      await auth.sendPasswordResetEmail(email);
      Toast.success("Password reset instructions sent! Check your inbox.");
    } catch (error) {
      console.error("[teacher-forgot-pwd] error:", error);
      Toast.error(error?.message || "Could not send reset email. Contact IT administration.");
    }
  });
  $("#btn-logout")?.addEventListener("click", async () => { try { await ClassCare.getFirebase()?.auth?.signOut(); Toast.info("Signed out."); } catch (_) { Toast.error("Could not sign out."); } });

  ClassCare.onCurrentUser(user => {
    if (!user) return showGuest();
    if (user.__profileError) return showGuest("Your ClassCare profile could not be read. Check your connection or ask IT administration to verify access.");
    if (!["teacher", "admin"].includes(user.role)) { Toast.warn("This workspace is for teachers and IT administration."); setTimeout(() => location.replace("../index.html"), 700); return; }
    if (user.disabled || (user.role === "teacher" && user.pending_approval !== false)) {
      return showGuest("Your account is awaiting administrator approval or has been disabled.");
    }
    showDashboard(user);
  });

  async function initTeacherDashboard(user) {
    cleanupScanner();
    const generation = ++State.generation;
    scheduleNextDayRefresh();
    State.teacher = user; State.scanning = false; State.transitioning = false;
    State.unsubscribeAttendance?.(); State.unsubscribeAttendance = null;
    bindTeacherControls();
    ensureWellbeingOverlay();
    setScannerState("off");
    try {
      State.settings = await ClassCare.DB.getSettings();
      State._unsubSettings = ClassCare.DB.settings.onSnapshot(doc => {
        if (doc.exists) {
          State.settings = Object.assign(State.settings || {}, doc.data() || {});
          console.log("[teacher] Live attendance threshold/schedule settings synchronized:", State.settings);
        }
      }, err => console.warn("[teacher] settings snapshot:", err));
    } catch (error) { console.warn("[teacher] settings unavailable:", error); }
    if (generation !== State.generation) return;

    State.students.clear(); State.sections.clear(); State.enrolledUids.clear();
    const teacherSections = getTeacherAssignedSections(user);
    const assignedSection = normalizeRole(user.role) === "teacher" ? (teacherSections[0] || sectionValue(user.section)) : "";
    State.section = assignedSection;
    teacherSections.forEach(sec => State.sections.add(sec));
    if (assignedSection) State.sections.add(assignedSection);
    try {
      const primarySnapshots = await getQuerySnapshots(sectionQueries(ClassCare.DB.users, "", "student"));
      primarySnapshots.forEach(snapshot => snapshot.forEach(doc => {
        const student = studentFromDoc(doc);
        const belongs = normalizeRole(user.role) === "admin" || (teacherSections.length ? teacherSections.some(sec => sectionMatchesPrefix(sec, student.section)) : true);
        if (normalizeRole(student.role) !== "student" || !belongs) return;
        State.students.set(student.uid, student);
        if (student.section) State.sections.add(student.section);
      }));

      if (user?.uid && normalizeRole(user.role) === "teacher") {
        try {
          const enrollmentsSnapshot = await ClassCare.DB.enrollments.where("teacher_uid", "==", user.uid).get();
          const pendingUidGets = [];
          enrollmentsSnapshot.forEach(doc => {
            const item = doc.data() || {};
            if (item.student_uid) {
              State.enrolledUids.add(item.student_uid);
              if (!State.students.has(item.student_uid)) {
                State.students.set(item.student_uid, {
                  uid: item.student_uid,
                  first_name: item.student_name || "Student",
                  last_name: "",
                  student_id: item.student_id || "—",
                  section: item.section || "—",
                  role: "student",
                  photo_data: item.photo_data || ""
                });
                pendingUidGets.push(item.student_uid);
              }
            }
            if (item.section) State.sections.add(item.section);
          });
          if (teacherSections.length) {
            for (const sec of teacherSections) {
              try {
                const secSnap = await ClassCare.DB.enrollments.where("section", "==", sec).get();
                secSnap.forEach(doc => {
                  const item = doc.data() || {};
                  if (item.student_uid) {
                    State.enrolledUids.add(item.student_uid);
                    if (!State.students.has(item.student_uid)) {
                      State.students.set(item.student_uid, {
                        uid: item.student_uid,
                        first_name: item.student_name || "Student",
                        last_name: "",
                        student_id: item.student_id || "—",
                        section: sec,
                        role: "student",
                        photo_data: item.photo_data || ""
                      });
                      pendingUidGets.push(item.student_uid);
                    }
                  }
                  State.sections.add(sec);
                });
              } catch (_) {}
            }
          }
          if (pendingUidGets.length > 0) {
            Promise.allSettled(pendingUidGets.map(uid => ClassCare.DB.users.doc(uid).get())).then(results => {
              let updated = false;
              results.forEach(res => {
                if (res.status === "fulfilled" && res.value.exists) {
                  const s = studentFromDoc(res.value);
                  if (s.uid) {
                    State.students.set(s.uid, { ...State.students.get(s.uid), ...s });
                    updated = true;
                  }
                }
              });
              if (updated && generation === State.generation) {
                renderAttendanceTable();
                renderStats();
                updateChooser();
                if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
              }
            }).catch(() => {});
          }
        } catch (enrErr) {
          console.warn("[teacher] initial enrollments query failed:", enrErr);
        }
      }
    } catch (error) {
      console.error("[teacher] roster load failed:", error);
      setTableState("error", "Roster unavailable", error?.code === "permission-denied" ? "You do not have permission to view the student roster." : "Check the connection and try again.");
    }
    if (generation !== State.generation) return;
    populateSectionDropdown();
    populateSubjectDropdown();
    const sectionSelect = $("#section-select");
    if (normalizeRole(user.role) === "teacher" && teacherSections.length > 1) {
      if (sectionSelect) { sectionSelect.disabled = false; }
    } else if (normalizeRole(user.role) === "teacher" && teacherSections.length === 1) {
      if (sectionSelect) { sectionSelect.value = teacherSections[0]; sectionSelect.disabled = false; }
      State.section = teacherSections[0];
    } else if (sectionSelect) {
      sectionSelect.disabled = false;
    }

    State.attendance.clear();
    const today = Utils.todayIso();
    const applyAttendanceSnapshot = snapshot => snapshot.forEach(doc => {
      const data = doc.data() || {}; const record = { ...data, id: doc.id };
      if (record.student_uid && (!record.date || record.date === today)) State.attendance.set(record.student_uid, record);
    });
    try {
      const snapshots = await getQuerySnapshots(attendanceQueries(user));
      snapshots.forEach(applyAttendanceSnapshot);
    } catch (error) {
      console.error("[teacher] attendance load failed:", error);
      setTableState("error", "Today’s register unavailable", error?.code === "permission-denied" ? "You do not have permission to view attendance." : "Check the connection and try again.");
    }
    if (generation !== State.generation) return;

    try {
      State.unsubscribeAttendance = listenToQueries(attendanceQueries(user), snapshot => {
        if (generation !== State.generation) return;
        snapshot.docChanges().forEach(change => {
          const data = change.doc.data() || {}; const record = { ...data, id: change.doc.id };
          if (!record.student_uid || (record.date && record.date !== today)) return;
          if (change.type === "removed") State.attendance.delete(record.student_uid); else State.attendance.set(record.student_uid, record);
        });
        renderAttendanceTable(); renderEmotionReport(); renderStats(); updateChooser();
        if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
        const activeStudent = State.students.get(_referenceHeroSelectedUid);
        if (activeStudent) updateRecordOverviewCard(activeStudent);
      }, error => { console.warn("[teacher] attendance listener failed:", error); });
    } catch (error) { console.warn("[teacher] realtime attendance unavailable:", error); }
    renderAttendanceTable(); renderEmotionReport(); renderStats(); updateChooser(); refreshOfflineBadge();
    OfflineSync.on(refreshOfflineBadge);
    startInterventionListeners(user, generation);
    listenUsers(user, generation);
    listenEnrollments(user, generation);
    if (typeof window.registerTeacherExportSource === "function") window.registerTeacherExportSource(() => ({ list: studentsFiltered(), attMap: State.attendance, section: State.section || "all-sections", teacher: State.teacher }));
    window._studentsPresent = studentsPresent;
    loadVibeCheck();
    initTeacherCareAlerts();

    // Instant real-time cross-tab synchronization for kiosk check-ins
    try {
      if (window.BroadcastChannel) {
        if (State._unsubBc) { State._unsubBc.close(); State._unsubBc = null; }
        State._unsubBc = new BroadcastChannel("classcare_attendance_sync");
        State._unsubBc.onmessage = event => {
          const msg = event.data;
          if (msg && (msg.type === "attendance_update" || msg.type === "deep_check_saved")) {
            const todayStr = Utils.todayIso();
            if (!msg.date || msg.date === todayStr) {
              if (msg.student_uid && msg.record) {
                State.attendance.set(msg.student_uid, msg.record);
              }
              renderAttendanceTable();
              renderEmotionReport();
              renderStats();
              updateChooser();
              if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
              const activeStudent = State.students.get(_referenceHeroSelectedUid || msg.student_uid);
              if (activeStudent) updateRecordOverviewCard(activeStudent);
            }
          }
        };
      }
    } catch (_) {}
  }

  function listenUsers(user, generation) {
    if (State._unsubUsers) { State._unsubUsers(); State._unsubUsers = null; }
    const teacherSections = getTeacherAssignedSections(user);
    const queries = sectionQueries(ClassCare.DB.users, "", "student");
    try {
      State._unsubUsers = listenToQueries(queries, snapshot => {
        if (generation !== State.generation) return;
        snapshot.docChanges().forEach(change => {
          const student = studentFromDoc(change.doc);
          if (normalizeRole(student.role) !== "student") return;
          const isEnrolled = State.enrolledUids?.has(student.uid);
          const belongs = normalizeRole(user.role) === "admin" || isEnrolled || (teacherSections.length ? teacherSections.some(sec => sectionMatchesPrefix(sec, student.section)) : true);
          if (!belongs) {
            if (!isEnrolled) State.students.delete(student.uid);
            return;
          }
          if (change.type === "removed") {
            if (!isEnrolled) State.students.delete(student.uid);
          } else {
            const existing = State.students.get(student.uid) || {};
            State.students.set(student.uid, { ...existing, ...student });
            if (student.section) State.sections.add(student.section);
          }
        });
        populateSectionDropdown();
        renderAttendanceTable(); renderEmotionReport(); renderStats(); updateChooser();
        if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
      }, error => { console.warn("[teacher] users listener failed:", error); });
    } catch (error) { console.warn("[teacher] realtime users unavailable:", error); }
  }

  function listenEnrollments(user, generation) {
    if (State._unsubEnrollments) { try { State._unsubEnrollments(); } catch (_) {} State._unsubEnrollments = null; }
    if (!user?.uid) return;
    const teacherSections = getTeacherAssignedSections(user);
    try {
      State._unsubEnrollments = ClassCare.DB.enrollments
        .onSnapshot(snapshot => {
          if (generation !== State.generation) return;
          const newUids = [];
          snapshot.forEach(doc => {
            const item = doc.data() || {};
            if (item.status && item.status !== "approved" && item.status !== "enrolled") return;
            const matchesTeacher = item.teacher_uid === user.uid || (teacherSections.length && teacherSections.includes(item.section)) || normalizeRole(user.role) === "admin";
            if (!matchesTeacher) return;
            if (item.student_uid) {
              State.enrolledUids.add(item.student_uid);
              if (!State.students.has(item.student_uid)) {
                State.students.set(item.student_uid, {
                  uid: item.student_uid,
                  first_name: item.student_name || "Student",
                  last_name: "",
                  student_id: item.student_id || "—",
                  section: item.section || "—",
                  role: "student",
                  photo_data: item.photo_data || ""
                });
                newUids.push(item.student_uid);
              }
              if (item.section) State.sections.add(item.section);
            }
          });
          if (newUids.length) {
            Promise.allSettled(newUids.map(uid => ClassCare.DB.users.doc(uid).get())).then(results => {
              let updated = false;
              results.forEach(res => {
                if (res.status === "fulfilled" && res.value.exists) {
                  const s = studentFromDoc(res.value);
                  if (s.uid) {
                    State.students.set(s.uid, { ...State.students.get(s.uid), ...s });
                    updated = true;
                  }
                }
              });
              if (updated && generation === State.generation) {
                renderAttendanceTable(); renderStats(); updateChooser();
                if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
              }
            }).catch(() => {});
          }
          populateSectionDropdown();
          renderAttendanceTable(); renderEmotionReport(); renderStats(); updateChooser();
          if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
        }, error => { console.warn("[teacher] enrollments listener failed:", error); });
    } catch (error) { console.warn("[teacher] realtime enrollments unavailable:", error); }
  }

  function applyCameraMirrorState() {
    const wrap = document.querySelector(".scanner-frame-wrap");
    const isMirrored = localStorage.getItem("classcare_camera_mirrored") === "true";
    if (wrap) wrap.classList.toggle("is-mirrored", isMirrored);
    const btn = $("#btn-flip-camera");
    if (btn) btn.classList.toggle("is-active", isMirrored);
    if (typeof applyZoomLevel === "function") applyZoomLevel(currentZoom);
  }

  function toggleCameraMirror() {
    const current = localStorage.getItem("classcare_camera_mirrored") === "true";
    localStorage.setItem("classcare_camera_mirrored", String(!current));
    applyCameraMirrorState();
    Toast.info(!current ? "Camera view mirrored" : "Camera view normal");
  }

  function scheduleNextDayRefresh() {
    if (State.nextDayTimer) clearTimeout(State.nextDayTimer);
    const nextDay = new Date(); nextDay.setHours(24, 0, 5, 0);
    State.nextDayTimer = setTimeout(() => location.reload(), Math.max(1000, nextDay.getTime() - Date.now()));
  }

  function bindTeacherControls() {
    if (State.bound) return; State.bound = true;
    const handleSectionChange = event => {
      State.section = event.target.value;
      const pageTitle = $("#teacher-page-title");
      if (pageTitle) pageTitle.textContent = State.section ? `Section ${State.section}` : "All Sections";
      const roomLabel = $("#teacher-room-label");
      if (roomLabel) roomLabel.textContent = State.section ? `Section ${State.section}` : (State.teacher?.preferred_section || "Classroom");
      renderStats();
      renderAttendanceTable();
      renderEmotionReport();
      updateChooser();
      loadVibeCheck();
      loadTeacherCareAlerts();
    };
    $("#section-select")?.addEventListener("change", handleSectionChange);
    $("#kiosk-section-select")?.addEventListener("change", handleSectionChange);

    $("#btn-toggle-fullscreen")?.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    $("#btn-skip-emotion")?.addEventListener("click", () => {
      void skipWellbeingSurvey();
    });

    $("#scanner-subject-select")?.addEventListener("change", () => {
      updateQuotaBadge();
      const active = getActiveTeacherAssignment();
      if (active?.section) {
        const secSelect = $("#section-select") || $("#kiosk-section-select");
        if (secSelect && Array.from(secSelect.options).some(o => o.value === active.section)) {
          secSelect.value = active.section;
          State.section = active.section;
          renderStats();
          renderAttendanceTable();
          renderEmotionReport();
          updateChooser();
        }
      }
      loadVibeCheck();
      loadTeacherCareAlerts();
    });
    $("#btn-refresh-vibe")?.addEventListener("click", () => loadVibeCheck());
    $("#search-student")?.addEventListener("input", renderAttendanceTable);
    $("#btn-start-scan")?.addEventListener("click", startScanner);
    $("#workspace-student-search")?.addEventListener("input", event => {
      const q = String(event.target.value || "").trim().toLowerCase();
      const carousel = $("#reference-student-carousel");
      if (!carousel) return;
      let visible = 0;
      carousel.querySelectorAll(".student-pill-card[data-student-uid]").forEach(card => {
        const uid = card.getAttribute("data-student-uid");
        const st = State.students.get(uid);
        const text = st ? `${st.first_name || ""} ${st.last_name || ""} ${st.student_id || ""}`.toLowerCase() : card.textContent.toLowerCase();
        const match = !q || text.includes(q);
        card.style.display = match ? "" : "none";
        if (match) visible++;
      });
      const countEl = $("#workspace-student-count");
      if (countEl) countEl.textContent = String(visible);
    });
    $("#btn-workspace-filter")?.addEventListener("click", () => {
      const input = $("#workspace-student-search");
      if (input) {
        input.focus();
        input.select?.();
      }
    });
    $("#btn-stop-scan")?.addEventListener("click", stopScanner);
    $("#btn-flip-camera")?.addEventListener("click", toggleCameraMirror);
    $("#btn-camera-zoom")?.addEventListener("click", toggleCameraZoom);
    $("#btn-camera-lighting")?.addEventListener("click", toggleCameraLighting);
    applyCameraMirrorState();
    window.addEventListener("classcare:assignments-updated", event => {
      if (event?.detail?.teacher) {
        State.teacher = event.detail.teacher;
      }
      populateSectionDropdown();
      populateSubjectDropdown();
      renderStats();
      renderAttendanceTable();
    });
    window.addEventListener("classcare:enrollment-updated", () => {
      populateSectionDropdown();
      populateSubjectDropdown();
      renderAttendanceTable(); renderEmotionReport(); renderStats(); updateChooser();
      if (typeof renderDynamicReferenceHero === "function") renderDynamicReferenceHero();
    });
    const handleManualScan = () => {
      const input = $("#manual-qr") || $("#manual-qr-input");
      if (!input || !input.value.trim()) return Toast.warn("Paste or type the QR code / Student ID first.");
      if (State.scanInFlight) return;
      State.scanInFlight = true;
      Promise.resolve(handleDecodedText(input.value.trim(), { fromScanner: false })).finally(() => {
        State.scanInFlight = false;
        input.value = "";
      });
    };
    $("#btn-manual-scan")?.addEventListener("click", handleManualScan);
    $("#manual-qr-input")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleManualScan();
      }
    });
    $("#manual-qr")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleManualScan();
      }
    });

    const reportsLink = document.querySelector('.app-sidebar a[href="#teacher-reports"]');
    reportsLink?.addEventListener("click", event => {
      event.preventDefault();
      document.querySelector("#teacher-emotion-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelectorAll(".app-sidebar .nav-link").forEach(link => link.classList.toggle("active", link === reportsLink));
      history.replaceState(null, "", "#teacher-reports");
    });
    window.addEventListener("beforeunload", cleanupScanner, { once: true });
    window.addEventListener("pagehide", cleanupScanner);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (State.scanning && State.scanner) {
          State._pausedForVisibility = true;
          stopHighSensitivityScannerLoop();
        }
      } else {
        if (State._pausedForVisibility && State.scanning) {
          State._pausedForVisibility = false;
          startHighSensitivityScannerLoop();
        }
      }
    });
  }

  function getTeacherAssignmentsList() {
    if (Array.isArray(State.teacher?.teaching_assignments) && State.teacher.teaching_assignments.length) {
      return State.teacher.teaching_assignments;
    }
    if (typeof window.TeacherAssignments?.getAssignments === "function") {
      const fromModule = window.TeacherAssignments.getAssignments();
      if (Array.isArray(fromModule) && fromModule.length) {
        if (State.teacher) State.teacher.teaching_assignments = fromModule;
        return fromModule;
      }
    }
    return [];
  }

  function getActiveTeacherAssignment() {
    const assignments = getTeacherAssignmentsList();
    const select = $("#scanner-subject-select");
    const val = select?.value;
    if (!val) return null;
    return assignments.find(a => (a.id && a.id === val) || (`${a.subject}_${a.section}` === val)) || null;
  }

  function updateQuotaBadge() {
    const badge = $("#scanner-quota-badge");
    if (!badge) return;
    const active = getActiveTeacherAssignment();
    if (active?.custom_quota && active?.start_time) {
      badge.className = "status-badge status-late";
      badge.style.border = "1px solid var(--border-subtle)";
      badge.textContent = `⚡ Custom Quota: ${active.subject} (${active.start_time}, ${active.late_grace_period || 15}m grace)`;
    } else {
      badge.className = "status-badge status-present";
      badge.style.border = "1px solid var(--border-subtle)";
      badge.textContent = `🏛️ Admin Master Quota (Morning: 7:30–7:45 AM | Afternoon: 1:00–1:15 PM)`;
    }
  }

  function populateSubjectDropdown() {
    const select = $("#scanner-subject-select");
    if (!select) return;
    const assignments = getTeacherAssignmentsList();
    if (!assignments.length) {
      select.innerHTML = '<option value="">Admin Master Schedule</option>';
      updateQuotaBadge();
      return;
    }
    const currentVal = select.value;
    select.innerHTML = [
      '<option value="">🏛️ All / Admin Master Schedule</option>',
      ...assignments.map(a => {
        const key = a.id || `${a.subject}_${a.section}`;
        const quotaLabel = a.custom_quota && a.start_time ? ` [⚡ ${a.start_time}]` : "";
        return `<option value="${escapeAttr(key)}">${escapeHtml(a.subject)} - ${escapeHtml(a.section)}${quotaLabel}</option>`;
      })
    ].join("");
    if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    }
    updateQuotaBadge();
  }

  function populateSectionDropdown() {
    const select = $("#section-select");
    const kioskSelect = $("#kiosk-section-select");
    if (!select && !kioskSelect) return;
    const teacherSections = getTeacherAssignedSections(State.teacher);
    let sections = [];
    if (teacherSections.length) {
      sections = teacherSections;
    } else {
      sections = Array.from(new Set(Array.from(State.sections).map(sectionValue).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }
    const html = `<option value="">All assigned sections</option>${sections.map(section => `<option value="${escapeAttr(section)}">${escapeHtml(section)}</option>`).join("")}`;
    if (select) select.innerHTML = html;
    if (kioskSelect) kioskSelect.innerHTML = html;
  }
  function studentsFiltered() {
    const query = String($("#search-student")?.value || "").trim().toLowerCase();
    const teacherSections = getTeacherAssignedSections(State.teacher);
    const combinedMap = new Map(State.students);
    State.attendance.forEach((rec, studentUid) => {
      if (!combinedMap.has(studentUid)) {
        combinedMap.set(studentUid, {
          uid: studentUid,
          first_name: rec.student_name || rec.name || "Student",
          last_name: "",
          student_id: rec.student_id || "—",
          section: rec.section || State.section || "—",
          role: "student",
          photo_data: rec.photo_data || ""
        });
      }
    });
    return Array.from(combinedMap.values()).filter(student => {
      const isEnrolled = State.enrolledUids?.has(student.uid);
      const attRecord = State.attendance.get(student.uid);
      const scannedByMe = attRecord?.scanned_by === State.teacher?.uid;
      if (State.section && !matchesSectionFilter(student) && !scannedByMe) return false;
      if (teacherSections.length && !isEnrolled && !scannedByMe) {
        const matchesAny = teacherSections.some(sec => sectionMatchesPrefix(sec, student.section));
        if (!matchesAny) return false;
      }
      if (!query) return true;
      return `${student.first_name || ""} ${student.last_name || ""}`.toLowerCase().includes(query) || String(student.student_id || "").toLowerCase().includes(query);
    }).sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`));
  }
  function studentsPresent() { return studentsFiltered().filter(student => ["Present", "Late"].includes(State.attendance.get(student.uid)?.status)); }

  function surveyAnswers(record) {
    const data = record?.wellbeing_data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return EMOTION_QUESTIONS.map((_, index) => {
        const answer = String(data[`q${index + 1}`] || "").trim().toUpperCase();
        return WELLBEING_CHOICES.includes(answer) ? answer : "";
      });
    }
    if (Array.isArray(record?.emotion_checkin)) {
      return EMOTION_QUESTIONS.map((_, index) => {
        const answer = String(record.emotion_checkin[index] || "").trim().toLowerCase();
        return answer === "yes" ? "A" : answer === "no" ? "D" : "";
      });
    }
    return [];
  }

  function startInterventionListeners(user, generation) {
    const state = State.intervention;
    if (!user?.uid) return;
    if (state.unsubAlerts) { try { state.unsubAlerts(); } catch (_) {} state.unsubAlerts = null; }
    state.createdAlertKeys.clear();
    state.emotionCache.clear();
    state.gradeCache.clear();
    state.openAlerts = 0;
    renderAlertBadge();
    try {
      state.unsubAlerts = ClassCare.DB.intervention_alerts
        .where("teacher_uid", "==", user.uid)
        .where("status", "in", ["Open", "Acknowledged"])
        .onSnapshot(snap => {
          if (generation !== State.generation) return;
          let openCount = 0;
          const seenKeys = new Set();
          snap.forEach(doc => {
            const d = doc.data() || {};
            if (d.status === "Open") openCount += 1;
            if (d.student_uid) seenKeys.add(`${d.student_uid}_${Utils.todayIso()}`);
          });
          state.openAlerts = openCount;
          state.createdAlertKeys = seenKeys;
          renderAlertBadge();
          renderInterventionPanel(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, err => console.warn("[intervention] alerts listener:", err));
    } catch (e) { console.warn(e); }
  }

  function renderAlertBadge() {
    const count = Number(State.intervention.openAlerts) || 0;
    const badge = $("#stat-alerts-badge");
    if (badge) {
      badge.textContent = `${count} Alert${count !== 1 ? "s" : ""}`;
      badge.classList.toggle("status-absent", count > 0);
      badge.classList.toggle("status-not-recorded", count === 0);
    }
    const topCount = $("#topstat-alerts-count");
    if (topCount) topCount.textContent = String(count);
  }

  function renderInterventionPanel(alerts) {
    const wrap = $("#intervention-alerts-body");
    if (!wrap) return;
    if (!alerts || !alerts.length) {
      wrap.innerHTML = `<div class="state-panel state-empty"><strong>No intervention alerts</strong><span>No students currently require immediate support. Keep up the great work!</span></div>`;
      return;
    }
    const open = alerts.filter(a => a.status === "Open");
    const ack = alerts.filter(a => a.status === "Acknowledged");
    const sorted = open.concat(ack).slice(0, 25);
    wrap.innerHTML = sorted.map(a => {
      const d = (a.triggered_at?.toDate ? a.triggered_at.toDate() : new Date()).toLocaleString();
      const status = a.status === "Open" ? `<span class="status-badge status-absent">Open</span>` : `<span class="status-badge status-late">Acknowledged</span>`;
      const emo = a.emotion ? `${a.emotion_emoji || "⚠"} ${a.emotion_label || a.emotion}` : "—";
      const grade = a.average_grade ? (Number(a.average_grade) < 75 ? `<span style="color:#b91c1c;font-weight:600;">${Number(a.average_grade).toFixed(1)}</span>` : Number(a.average_grade).toFixed(1)) : "—";
      const ackBtn = a.status === "Open" ? `<button type="button" class="btn btn-ghost btn-sm" data-ack-alert="${escapeAttr(a.id)}">Acknowledge</button><button type="button" class="btn btn-secondary btn-sm" data-escalate-alert="${escapeAttr(a.id)}" title="Refer to school counselor">Escalate ↑</button>` : "";
      return `<div style="padding:10px 12px;border-radius:8px;background:${a.status === "Open" ? "rgba(239,68,68,0.06)" : "var(--panel-muted)"};border:1px solid ${a.status === "Open" ? "rgba(239,68,68,0.2)" : "var(--border-subtle)"};margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${escapeHtml(a.student_name || "Student")} <span class="tabular" style="color:var(--text-muted);font-weight:400;">${escapeHtml(a.student_id || "")}</span></div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(a.section || "—")} · ${d}</div>
          </div>
          ${status}
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;font-size:0.85rem;">
          <span>Emotion: <strong>${escapeHtml(emo)}</strong></span>
          <span>Avg Grade: <strong>${grade}</strong></span>
        </div>
        ${a.reason ? `<div style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">${escapeHtml(a.reason)}</div>` : ""}
        <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">${ackBtn}</div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-ack-alert]").forEach(btn => {
      btn.addEventListener("click", () => acknowledgeAlert(btn.dataset.ackAlert));
    });
    wrap.querySelectorAll("[data-escalate-alert]").forEach(btn => {
      btn.addEventListener("click", () => escalateAlert(btn.dataset.escalateAlert));
    });
  }

  async function acknowledgeAlert(alertId) {
    if (!alertId) return;
    try {
      await ClassCare.DB.intervention_alerts.doc(alertId).set({ status: "Acknowledged", acknowledged_at: firebase.firestore.FieldValue.serverTimestamp(), acknowledged_by: State.teacher?.uid || "" }, { merge: true });
      Toast.success("Alert acknowledged.");
    } catch (err) { console.error(err); Toast.error("Could not update alert."); }
  }

  async function escalateAlert(alertId) {
    if (!alertId) return;
    if (!confirm("Escalate this student concern to the school counselor? This creates a private referral record.")) return;
    const teacher = State.teacher || {};
    try {
      const alertDoc = await ClassCare.DB.intervention_alerts.doc(alertId).get();
      const alertData = alertDoc.exists ? alertDoc.data() : {};
      // 1. Update the original alert status
      await ClassCare.DB.intervention_alerts.doc(alertId).set({
        status: "Escalated",
        escalated_at: firebase.firestore.FieldValue.serverTimestamp(),
        escalated_by: teacher.uid || "",
        escalated_by_name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || "Teacher"
      }, { merge: true });
      // 2. Write counselor referral record
      await ClassCare.DB.concern_referrals.add({
        source_alert_id: alertId,
        student_uid: alertData.student_uid || "",
        student_name: alertData.student_name || "",
        student_id: alertData.student_id || "",
        section: alertData.student_section || alertData.section || "",
        emotion: alertData.emotion || "",
        emotion_label: alertData.emotion_label || "",
        average_grade: alertData.average_grade || null,
        reason: alertData.reason || "",
        priority: alertData.priority || "high",
        referred_by_uid: teacher.uid || "",
        referred_by_name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || "Teacher",
        status: "Referred",
        referred_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      Toast.success("Escalated to counselor. A referral record has been created.");
    } catch (err) { console.error("[escalate]", err); Toast.error("Could not escalate. Please try again."); }
  }

  // ─── Vibe Check Dashboard — section emotion trend (tiered visibility) ──────
  // Positive emotions: aggregate count only (not by name for privacy)
  // Negative emotions: individual student name shown for teacher follow-up
  // ─── Vibe Check Dashboard — section emotion trend (constructivist pedagogical triage) ───
  async function loadVibeCheck() {
    const wrap = document.querySelector("#vibe-check-body");
    if (!wrap) return;
    const section = State.section;
    if (!section) {
      wrap.innerHTML = `<div class="state-panel state-empty"><strong>Select a section</strong><span>Choose a section from the bar above to load the live Vibe Check dashboard.</span></div>`;
      return;
    }
    wrap.innerHTML = `<div class="state-panel state-loading"><strong>Loading live classroom mood…</strong></div>`;

    if (State.unsubscribeVibeCheck) {
      try { State.unsubscribeVibeCheck(); } catch (_) {}
      State.unsubscribeVibeCheck = null;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const cutoffIso = sevenDaysAgo.toISOString().slice(0, 10);

    try {
      State.unsubscribeVibeCheck = ClassCare.DB.emotional_checkins
        .where("section", "==", section)
        .limit(250)
        .onSnapshot(snap => {
          const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const checkins = allDocs.filter(d => (d.date || "") >= cutoffIso);
          if (!checkins.length) {
            wrap.innerHTML = `
              <div class="state-panel state-empty">
                <strong>No check-ins for Section ${escapeHtml(section)} this week</strong>
                <span>Mood data will update here in real time the exact second students complete check-ins during arrival or in the Student Portal.</span>
              </div>`;
            return;
          }
          renderVibeCheck(checkins, wrap);
        }, err => {
          console.warn("[vibecheck realtime listener error]", err);
          wrap.innerHTML = `<div class="state-panel state-error"><strong>Could not load mood data</strong><span>${err?.message || "Please check connection and try again."}</span></div>`;
        });
    } catch (err) {
      console.warn("[vibecheck]", err);
      wrap.innerHTML = `<div class="state-panel state-error"><strong>Could not load mood data</strong><span>${err?.message || "A network error occurred."}</span></div>`;
    }
  }

  function renderVibeCheck(checkins, wrap) {
    const today = Utils.todayIso();
    const byDate = {};
    const positiveByEmotion = {};
    const negativeByStudent = {};
    let todayTotal = 0;
    let todayPos = 0;
    let todayNeg = 0;

    checkins.forEach(c => {
      const date = (c.date || "").slice(0, 10);
      if (!byDate[date]) byDate[date] = { positive: 0, negative: 0 };
      
      const isNeg = c.is_negative === true || ["tired", "stressed", "anxious", "sad", "angry", "scared", "lonely"].includes(String(c.emotion || "").toLowerCase());
      const emoKey = String(c.emotion || (isNeg ? "stressed" : "happy")).toLowerCase();
      const norm = typeof ClassCare !== "undefined" && typeof ClassCare.normalizeEmotion === "function"
        ? ClassCare.normalizeEmotion(emoKey)
        : { emotion: emoKey, emotion_label: emoKey, emotion_emoji: isNeg ? "😰" : "😊", is_negative: isNeg };

      if (isNeg) {
        byDate[date].negative += 1;
        if (date === today) { todayTotal += 1; todayNeg += 1; }
        const key = c.student_uid || c.student_name || "unknown";
        if (!negativeByStudent[key]) {
          negativeByStudent[key] = {
            student_uid: c.student_uid || "",
            name: c.student_name || "Student",
            emotion: norm.emotion_label,
            emoji: norm.emotion_emoji,
            date: date,
            count: 0
          };
        }
        negativeByStudent[key].count += 1;
        negativeByStudent[key].date = date;
      } else {
        byDate[date].positive += 1;
        if (date === today) { todayTotal += 1; todayPos += 1; }
        positiveByEmotion[norm.emotion] = (positiveByEmotion[norm.emotion] || 0) + 1;
      }
    });

    const totalCheckins = checkins.length;
    const totalPos = Object.values(positiveByEmotion).reduce((a, b) => a + b, 0);
    const negStudents = Object.values(negativeByStudent);
    const healthPct = totalCheckins ? Math.round((totalPos / totalCheckins) * 100) : 100;

    // Determine overall mood climate
    let moodToneBadge = "😊 Grounded & Calm";
    let moodToneSub = `${healthPct}% of check-ins are calm, happy, or excited`;
    if (healthPct < 50) {
      moodToneBadge = "💙 Elevated Needs & Stress";
      moodToneSub = `${100 - healthPct}% of students are experiencing heightened emotional load`;
    } else if (healthPct < 75) {
      moodToneBadge = "⚖️ Mixed Emotional Energy";
      moodToneSub = `${healthPct}% positive; several students may need quiet support`;
    }

    // Constructivist Teaching Scaffolding Recommendation
    let triageTitle = "🚀 Optimal Inquiry & Collaborative Challenge";
    let triageAdvice = "Classroom emotional climate is calm, grounded, and receptive today. Constructivist learning theory indicates that high psychological safety unlocks deeper cognitive risk-taking. This is an ideal session for complex problem-solving, open inquiry, and peer collaboration.";
    let triageBadge = "Classroom Readiness: High";

    if (negStudents.length >= 3 || (totalCheckins > 0 && (negStudents.length / totalCheckins) >= 0.25)) {
      triageTitle = "🧘 Low-Stakes Scaffolding & Psychological Safety";
      triageAdvice = "Heightened stress or anxiety is present across Section " + escapeHtml(State.section) + " today. Under constructivist principles, emotional stress restricts working memory and flexible reasoning. Consider opening with a 3-minute calming breath, reducing individual cold-calling, and providing paired think-pair-share warm-ups.";
      triageBadge = "Scaffolding: Supportive";
    } else if (positiveByEmotion["tired"] && positiveByEmotion["tired"] >= 3) {
      triageTitle = "⚡ Active Energizer & Chunked Instruction";
      triageAdvice = "Multiple students report feeling sluggish or fatigued today. Lengthy teacher-led lecturing risks passive disengagement. Chunk today's lesson into 10-15 minute interactive segments with movement-based participation, paired exercises, or interactive polling.";
      triageBadge = "Engagement: Dynamic";
    }

    const sortedDates = Object.keys(byDate).sort();
    const maxCount = Math.max(1, ...sortedDates.map(d => byDate[d].positive + byDate[d].negative));
    const positiveBreakdown = Object.entries(positiveByEmotion).sort((a, b) => b[1] - a[1]);
    const EMOTION_EMOJIS = { happy: "😊", calm: "😌", excited: "🤩", okay: "😐", tired: "😴", sad: "😢", angry: "😠", anxious: "😰", stressed: "😰" };

    wrap.innerHTML = `
      <div class="vibe-dashboard-hero">
        <div class="vibe-metric-card">
          <span class="vibe-metric-badge">Overall Climate</span>
          <div class="vibe-metric-stat">${escapeHtml(moodToneBadge)}</div>
          <div class="vibe-metric-sub">${escapeHtml(moodToneSub)}</div>
        </div>
        <div class="vibe-metric-card">
          <span class="vibe-metric-badge">Triage Status</span>
          <div class="vibe-metric-stat">${totalPos} <span style="font-size:0.95rem;font-weight:600;color:var(--c-accent-dark);">Positive</span> · ${negStudents.length} <span style="font-size:0.95rem;font-weight:600;color:#9b2c2c;">Care</span></div>
          <div class="vibe-metric-sub">${totalCheckins} check-ins for Section ${escapeHtml(State.section)}</div>
        </div>
        <div class="vibe-metric-card">
          <span class="vibe-metric-badge">Pedagogical Readiness</span>
          <div class="vibe-metric-stat">${escapeHtml(triageBadge)}</div>
          <div class="vibe-metric-sub">Constructivist adaptation guidance active</div>
        </div>
      </div>

      <!-- Constructivist Lesson Guidance Card -->
      <div class="vibe-triage-card">
        <div class="vibe-triage-title">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          ${escapeHtml(triageTitle)}
        </div>
        <div class="vibe-triage-advice">
          ${escapeHtml(triageAdvice)}
        </div>
        <div class="vibe-triage-footer">
          <span>Grounding pedagogical framework: Constructivist Social-Emotional Learning</span>
          <span>Live synchronization active</span>
        </div>
      </div>

      <!-- Two-Column Breakdown: Positive Trends vs Discreet Care Alerts -->
      <div class="vibe-breakdown-grid">
        <div class="vibe-pillar-card">
          <div class="vibe-pillar-header">
            <h3 class="vibe-pillar-title" style="color:var(--c-accent-dark);">Positive Mood Distribution (${totalPos})</h3>
            <span class="status-badge status-present">Privacy Protected</span>
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 10px;">Individual names are hidden to preserve student comfort and avoid social comparison.</p>
          <div>
            ${positiveBreakdown.length ? positiveBreakdown.map(([emo, count]) => {
              const pct = Math.round((count / (totalPos || 1)) * 100);
              const emoji = EMOTION_EMOJIS[emo] || "😊";
              return `
                <div style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:600;margin-bottom:3px;">
                    <span>${emoji} <span style="text-transform:capitalize;">${escapeHtml(emo)}</span></span>
                    <span><strong>${count}</strong> <span style="font-size:0.75rem;color:var(--text-muted);">(${pct}%)</span></span>
                  </div>
                  <div style="height:6px;background:var(--panel-muted);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;background:var(--c-accent);width:${pct}%;border-radius:3px;"></div>
                  </div>
                </div>`;
            }).join("") : `<div class="state-panel state-empty" style="padding:16px;"><span>No positive check-ins recorded yet.</span></div>`}
          </div>
        </div>

        <div class="vibe-pillar-card support">
          <div class="vibe-pillar-header">
            <h3 class="vibe-pillar-title" style="color:#9b2c2c;">Discreet Care Alerts (${negStudents.length})</h3>
            <span class="priority-pill ${negStudents.length ? "priority-critical" : "priority-neutral"}">${negStudents.length ? "Needs Teacher Care" : "All Clear"}</span>
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 10px;">Visible only to you as their teacher to support compassionate classroom scaffolding.</p>
          <div>
            ${negStudents.length ? negStudents.map(s => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);gap:8px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:1.3rem;">${escapeHtml(s.emoji)}</span>
                  <div>
                    <div style="font-size:0.88rem;font-weight:700;">${escapeHtml(s.name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">Reported ${escapeHtml(s.emotion)} · ${escapeHtml(s.date)}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <button type="button" class="btn btn-secondary btn-sm btn-discreet-chat" data-student-name="${escapeAttr(s.name)}" data-emotion="${escapeAttr(s.emotion)}" style="font-size:0.75rem;padding:3px 8px;">
                    Check in
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm btn-escalate-counselor" data-uid="${escapeAttr(s.student_uid)}" data-name="${escapeAttr(s.name)}" data-sec="${escapeAttr(State.section)}" style="font-size:0.75rem;padding:3px 8px;color:#9b2c2c;" title="Refer to counselor">
                    Refer
                  </button>
                </div>
              </div>
            `).join("") : `<div style="text-align:center;padding:18px;font-size:0.88rem;color:var(--text-muted);">All checked-in students are currently feeling grounded and positive 🎉</div>`}
          </div>
        </div>
      </div>

      <!-- 7-Day Trajectory Bar Chart -->
      <div style="margin-top:16px;background:var(--panel-muted);border:1px solid var(--border-subtle);border-radius:10px;padding:14px 16px;">
        <strong style="font-size:0.82rem;color:var(--text-secondary);display:block;margin-bottom:6px;">7-Day Classroom Emotional Trajectory · Section ${escapeHtml(State.section)}</strong>
        <div style="display:flex;align-items:flex-end;gap:6px;margin-top:10px;height:70px;">
          ${sortedDates.map(d => {
            const pos = byDate[d].positive; const neg = byDate[d].negative;
            const posH = Math.round((pos / maxCount) * 58);
            const negH = Math.round((neg / maxCount) * 58);
            const label = new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });
            return `
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;" title="${escapeHtml(label)}: ${pos} positive, ${neg} concern">
                <div style="width:100%;max-width:28px;border-radius:3px 3px 0 0;background:var(--c-accent);height:${posH}px;min-height:${pos ? 3 : 0}px;"></div>
                <div style="width:100%;max-width:28px;border-radius:3px 3px 0 0;background:#e53e3e;height:${negH}px;min-height:${neg ? 3 : 0}px;"></div>
                <span style="font-size:9px;color:var(--text-muted);white-space:nowrap;margin-top:2px;">${d.slice(5)}</span>
              </div>`;
          }).join("")}
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;font-size:0.75rem;color:var(--text-secondary);">
          <span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:10px;height:10px;border-radius:2px;background:var(--c-accent);display:inline-block;"></i> Positive / Grounded</span>
          <span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:10px;height:10px;border-radius:2px;background:#e53e3e;display:inline-block;"></i> Needs Attention / Care</span>
        </div>
      </div>
    `;

    // Attach discreet care actions
    wrap.querySelectorAll(".btn-discreet-chat").forEach(b => {
      b.addEventListener("click", () => {
        const sName = b.dataset.studentName;
        Toast.info(`Tip for ${sName}: A quiet, supportive check-in like "Hey, how are you feeling today? Let me know if you need anything" builds trust without singling them out.`);
      });
    });

    wrap.querySelectorAll(".btn-escalate-counselor").forEach(b => {
      b.addEventListener("click", () => {
        const uid = b.dataset.uid;
        const name = b.dataset.name;
        const sec = b.dataset.sec;
        if (confirm(`Refer ${name} to the school guidance counselor for emotional support follow-up?`)) {
          void escalateToCounselor(uid, name, sec);
        }
      });
    });
  }

  async function escalateToCounselor(studentUid, studentName, section, note = "") {
    try {
      const teacher = State.teacher || {};
      const teacherName = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email || "Teacher";
      const payload = {
        student_uid: studentUid,
        student_name: studentName,
        section: section || State.section || "—",
        referred_by_uid: teacher.uid || "",
        referred_by_name: teacherName,
        note: note || "Teacher escalated student from emotional well-being check-in for counselor follow-up.",
        priority: "High",
        status: "Open",
        referred_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ClassCare.DB.concern_referrals.add(payload);
      ClassCare.DB.logAudit(teacher.uid || "", "counselor_referral", {
        student_uid: studentUid,
        student_name: studentName,
        section: section || State.section || "—",
        note: payload.note
      }).catch(() => {});
      Toast.success(`Referral for ${studentName} sent to School Guidance Counselor.`);
      loadTeacherCareAlerts();
    } catch (err) {
      console.error("[teacher] escalate to counselor failed:", err);
      Toast.error("Could not send referral to counselor. Check connection and retry.");
    }
  }

  // ─── TEACHER CO-ADMIN CARE ALERTS & WELLBEING CENTER ─────────
  const TeacherCareState = {
    unsubEmotional: null,
    unsubConcerns: null,
    unsubCareAlerts: null,
    unsubDistressAlerts: null,
    recentCheckins: [],
    studentConcerns: [],
    distressStatusMap: new Map(),
    distressFilter: "all",
    todayNegativeCount: 0,
    multiDayFlaggedCount: 0,
    activeTab: "distress",
    seenNegativeKeys: new Set()
  };

  function initTeacherCareAlerts() {
    bindCareAlertsUI();
    startTeacherCareListeners();
  }

  function bindCareAlertsUI() {
    $("#btn-refresh-care-alerts")?.addEventListener("click", () => {
      loadTeacherCareAlerts();
      Toast.info("Care alerts refreshed.");
    });

    const scrollToCareSection = (e) => {
      e?.preventDefault();
      window.location.hash = "#teacher-care-alerts";
      document.querySelectorAll(".teacher-tab-panel").forEach(p => {
        p.classList.toggle("hidden", p.id !== "tab-teacher-care-alerts");
      });
      document.querySelectorAll(".classcare-nav-item").forEach(item => {
        item.classList.toggle("active", item.getAttribute("href") === "#teacher-care-alerts");
      });
      switchCareTab("concerns");
      const careSection = $("#teacher-care-alerts");
      if (careSection) {
        careSection.scrollIntoView({ behavior: "smooth", block: "start" });
        careSection.style.transition = "box-shadow 0.3s ease";
        careSection.style.boxShadow = "0 0 0 3px var(--c-primary)";
        setTimeout(() => { careSection.style.boxShadow = ""; }, 1800);
      }
      document.querySelector(".app-sidebar")?.classList.remove("is-open");
      document.querySelector(".sidebar-backdrop")?.classList.remove("is-visible");
    };

    $("#btn-topbar-care-alerts")?.addEventListener("click", scrollToCareSection);
    $("#btn-mobile-care-alerts")?.addEventListener("click", scrollToCareSection);
    $("#nav-teacher-care-alerts")?.addEventListener("click", scrollToCareSection);

    // Secondary tab navigation
    $("#tab-btn-care-distress")?.addEventListener("click", () => switchCareTab("distress"));
    $("#tab-btn-care-concerns")?.addEventListener("click", () => switchCareTab("concerns"));

    // Distress status filter pills
    document.querySelectorAll("[data-distress-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.distressFilter || "all";
        TeacherCareState.distressFilter = filter;
        document.querySelectorAll("[data-distress-filter]").forEach(b => {
          const isActive = b.dataset.distressFilter === filter;
          b.classList.toggle("btn-primary", isActive);
          b.classList.toggle("btn-secondary", !isActive);
          b.classList.toggle("active", isActive);
        });
        processCareAlerts();
      });
    });

    if (window.BroadcastChannel) {
      try {
        const careBc = new BroadcastChannel("classcare_distress_sync");
        careBc.onmessage = (ev) => {
          if (ev.data?.type === "distress_status_update" && ev.data.student_uid) {
            TeacherCareState.distressStatusMap.set(ev.data.student_uid, {
              status: ev.data.status,
              updated_at: ev.data.updated_at || new Date().toISOString()
            });
            processCareAlerts();
          }
        };
      } catch (_) {}
    }

    // Modal close handlers
    document.querySelectorAll("[data-close-care-modal]").forEach(el => {
      el.addEventListener("click", closeCareActionModal);
    });

    // Form submission
    $("#form-teacher-care-action")?.addEventListener("submit", handleCareActionSubmit);

    // Actively start care alerts & Talk to Someone listeners
    startTeacherCareListeners();
  }

  function switchCareTab(tab) {
    TeacherCareState.activeTab = tab;
    const btnDistress = $("#tab-btn-care-distress");
    const btnConcerns = $("#tab-btn-care-concerns");
    const panelDistress = $("#panel-care-distress");
    const panelConcerns = $("#panel-care-concerns");

    if (tab === "distress") {
      btnDistress?.classList.add("active");
      btnConcerns?.classList.remove("active");
      panelDistress?.classList.remove("hidden");
      panelConcerns?.classList.add("hidden");
    } else {
      btnConcerns?.classList.add("active");
      btnDistress?.classList.remove("active");
      panelConcerns?.classList.remove("hidden");
      panelDistress?.classList.add("hidden");
    }
  }

  let _lastTeacherConcernNotifiedId = null;
  let _unsubTalkToSomeone = null;
  let _unsubTimelineModal = null;
  let _talkToSomeoneInitial = true;
  let _concernSubmissionsInitial = true;

  function startTeacherCareListeners() {
    if (TeacherCareState.unsubEmotional) TeacherCareState.unsubEmotional();
    if (TeacherCareState.unsubConcerns) TeacherCareState.unsubConcerns();
    if (TeacherCareState.unsubDistressAlerts) TeacherCareState.unsubDistressAlerts();
    if (_unsubTalkToSomeone) _unsubTalkToSomeone();

    _talkToSomeoneInitial = true;
    _concernSubmissionsInitial = true;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const cutoffIso = fourteenDaysAgo.toISOString().slice(0, 10);

    // 1. Emotional checkins listener (Requirement 3: pure real-time onSnapshot)
    try {
      TeacherCareState.unsubEmotional = ClassCare.DB.emotional_checkins
        .limit(250)
        .onSnapshot(snap => {
          const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          TeacherCareState.recentCheckins = allDocs.filter(d => (d.date || "") >= cutoffIso);
          processCareAlerts();
        }, err => {
          console.warn("[teacher-care] emotional listener notice:", err);
        });
    } catch (e) {
      console.warn("[teacher-care] emotional listener error:", e);
    }

    // Unified helper to merge concerns from talkToSomeone and concern_submissions
    const concernsMap = new Map();
    function syncMergedConcerns(sourceKey, docs) {
      docs.forEach(doc => {
        const d = { id: doc.id, ...doc.data() };
        concernsMap.set(doc.id, d);
      });
      TeacherCareState.studentConcerns = Array.from(concernsMap.values());
      renderCareConcerns();
      updateCareBadges();
    }

    // 2. Student concerns listener 1: talkToSomeone collection
    try {
      _unsubTalkToSomeone = ClassCare.DB.talkToSomeone
        .limit(100)
        .onSnapshot(snap => {
          syncMergedConcerns("talkToSomeone", snap.docs);
          if (!_talkToSomeoneInitial) {
            snap.docChanges().forEach(change => {
              if (change.type === "added") {
                const d = change.doc.data() || {};
                const docId = change.doc.id;
                const statusNorm = String(d.status || "").toLowerCase();
                if (statusNorm !== "resolved" && statusNorm !== "solved" && docId !== _lastTeacherConcernNotifiedId) {
                  _lastTeacherConcernNotifiedId = docId;
                  SoundFeedback.play("tap");
                  Toast.warn(`⚠️ Care Alert: New student submission received — "${d.concern_type_label || d.concern_type || "Confidential Inquiry"}"!`, { duration: 8000 });
                }
              }
            });
          }
          _talkToSomeoneInitial = false;
        }, err => {
          console.warn("[teacher-care] talkToSomeone listener notice:", err);
        });
    } catch (e) {
      console.warn("[teacher-care] talkToSomeone setup error:", e);
    }

    // 3. Student concerns listener 2: concern_submissions collection
    try {
      TeacherCareState.unsubConcerns = ClassCare.DB.concern_submissions
        .limit(100)
        .onSnapshot(snap => {
          syncMergedConcerns("concern_submissions", snap.docs);
          if (!_concernSubmissionsInitial) {
            snap.docChanges().forEach(change => {
              if (change.type === "added") {
                const d = change.doc.data() || {};
                const docId = change.doc.id;
                const statusNorm = String(d.status || "").toLowerCase();
                if (statusNorm !== "resolved" && statusNorm !== "solved" && docId !== _lastTeacherConcernNotifiedId) {
                  _lastTeacherConcernNotifiedId = docId;
                  SoundFeedback.play("tap");
                  Toast.warn(`⚠️ Care Alert: New student report — "${d.concern_type_label || d.concern_type || "Confidential Message"}"!`, { duration: 8000 });
                }
              }
            });
          }
          _concernSubmissionsInitial = false;
        }, err => {
          console.warn("[teacher-care] concerns listener notice:", err);
        });
    } catch (e) {
      console.warn("[teacher-care] concerns listener error:", e);
    }

    // 4. Holistic Care Alerts listener (Requirement 1 & 3: real-time careAlerts collection subscription)
    try {
      if (TeacherCareState.unsubCareAlerts) {
        try { TeacherCareState.unsubCareAlerts(); } catch (_) {}
        TeacherCareState.unsubCareAlerts = null;
      }
      const careRef = ClassCare.DB.careAlerts;
      const teacherUid = State.teacher?.uid;
      const careQuery = (normalizeRole(State.teacher?.role) === "admin")
        ? careRef.limit(100)
        : (teacherUid ? careRef.where("teacherId", "==", teacherUid).limit(100) : careRef.limit(100));

      TeacherCareState.unsubCareAlerts = careQuery.onSnapshot(snap => {
        TeacherCareState.savedCareAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        processCareAlerts();
      }, err => {
        console.warn("[teacher-care] careAlerts realtime listener notice:", err);
      });
    } catch (e) {
      console.warn("[teacher-care] careAlerts setup error:", e);
    }

    // 5. Real-time Distress Alert Status Listener (Not Solved, In Progress, Solved)
    try {
      if (TeacherCareState.unsubDistressAlerts) {
        try { TeacherCareState.unsubDistressAlerts(); } catch (_) {}
        TeacherCareState.unsubDistressAlerts = null;
      }
      TeacherCareState.unsubDistressAlerts = ClassCare.DB.distress_alerts
        .limit(250)
        .onSnapshot(snap => {
          TeacherCareState.distressStatusMap.clear();
          snap.docs.forEach(doc => {
            const data = doc.data() || {};
            const uid = data.student_uid || doc.id;
            if (uid) {
              TeacherCareState.distressStatusMap.set(uid, { id: doc.id, ...data });
            }
          });
          processCareAlerts();
        }, err => {
          console.warn("[teacher-care] distress_alerts realtime listener notice:", err);
        });
    } catch (e) {
      console.warn("[teacher-care] distress_alerts setup error:", e);
    }
  }

  function loadTeacherCareAlerts() {
    processCareAlerts();
    renderCareConcerns();
  }

  function studentBelongsToTeacher(sec) {
    if (normalizeRole(State.teacher?.role) === "admin") return true;
    const currentSelected = State.section;
    if (currentSelected) {
      return sectionMatchesPrefix(currentSelected, sec);
    }
    const teacherSections = getTeacherAssignedSections(State.teacher);
    if (!teacherSections.length) return true;
    return teacherSections.some(s => sectionMatchesPrefix(s, sec));
  }

  function processCareAlerts() {
    const today = Utils.todayIso();
    const studentsMap = new Map();
    let todayNegCount = 0;

    TeacherCareState.recentCheckins.forEach(c => {
      const sec = c.section || "";
      if (!studentBelongsToTeacher(sec)) return;

      const uid = c.student_uid || c.uid;
      if (!uid) return;

      const isNeg = c.is_negative === true || ["tired", "stressed", "anxious", "sad", "angry", "overwhelmed", "worried", "lonely"].includes(String(c.emotion || "").toLowerCase());
      if (!isNeg) return;

      if (!studentsMap.has(uid)) {
        const studentInfo = State.students.get(uid) || {};
        studentsMap.set(uid, {
          uid,
          name: `${studentInfo.first_name || c.student_name || ""} ${studentInfo.last_name || ""}`.trim() || "Student",
          student_id: studentInfo.student_id || c.student_id || "—",
          section: c.section || studentInfo.section || "—",
          count: 0,
          todayEmotion: null,
          lastDate: "",
          lastNote: "",
          emotions: {}
        });
      }

      const item = studentsMap.get(uid);
      item.count += 1;
      const emo = c.emotion_label || c.emotion || "Distressed";
      item.emotions[emo] = (item.emotions[emo] || 0) + 1;

      if (c.date === today) {
        item.todayEmotion = c;
        const statusRecord = TeacherCareState.distressStatusMap.get(uid);
        const isSolved = statusRecord && (statusRecord.status === "Solved" || statusRecord.status === "Resolved");
        if (!isSolved) {
          todayNegCount += 1;
          const alertKey = `${uid}_${today}_${c.emotion}`;
          if (!TeacherCareState.seenNegativeKeys.has(alertKey)) {
            TeacherCareState.seenNegativeKeys.add(alertKey);
            // Play tactile alert sound and show toast only if NOT solved
            SoundFeedback.play("tap");
            Toast.warn(`⚠️ Care Alert: ${item.name} checked in feeling ${c.emotion_emoji || "😟"} ${c.emotion_label || c.emotion}`);
          }
        }
      }

      if (!item.lastDate || c.date > item.lastDate) {
        item.lastDate = c.date;
        if (c.note) item.lastNote = c.note;
      }
    });

    // Requirement 1: Merge real-time Care Alerts generated by Correlation Engine
    if (Array.isArray(TeacherCareState.savedCareAlerts)) {
      TeacherCareState.savedCareAlerts.forEach(alert => {
        if (alert.status !== "Open") return;
        const sec = alert.section || "";
        if (!studentBelongsToTeacher(sec)) return;
        const uid = alert.studentId || alert.student_uid;
        if (!uid) return;

        if (!studentsMap.has(uid)) {
          const studentInfo = State.students.get(uid) || {};
          studentsMap.set(uid, {
            uid,
            name: alert.studentName || `${studentInfo.first_name || ""} ${studentInfo.last_name || ""}`.trim() || "Student",
            student_id: studentInfo.student_id || "—",
            section: sec || studentInfo.section || "—",
            count: alert.consecutiveAbsences || 1,
            todayEmotion: alert.recentEmotion ? { emotion: alert.recentEmotion, emotion_label: alert.recentEmotion } : null,
            lastDate: today,
            lastNote: alert.reason || "Academic & wellbeing correlation alert",
            emotions: alert.recentEmotion ? { [alert.recentEmotion]: 1 } : {},
            summativeAlert: alert
          });
        } else {
          const item = studentsMap.get(uid);
          item.summativeAlert = alert;
          if (alert.reason) item.lastNote = alert.reason;
        }
      });
    }

    const allFlaggedList = Array.from(studentsMap.values()).map(s => {
      const statusRec = TeacherCareState.distressStatusMap.get(s.uid);
      s.distressStatus = statusRec?.status || "Not Solved";
      return s;
    }).sort((a, b) => {
      // Unsolved first, then In Progress, then Solved
      const scoreStatus = st => (st === "Not Solved" ? 3 : st === "In Progress" ? 2 : 1);
      const diffStatus = scoreStatus(b.distressStatus) - scoreStatus(a.distressStatus);
      if (diffStatus !== 0) return diffStatus;

      const aAlert = a.summativeAlert ? 2 : 0;
      const bAlert = b.summativeAlert ? 2 : 0;
      const aToday = a.todayEmotion ? 1 : 0;
      const bToday = b.todayEmotion ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      if (aToday !== bToday) return bToday - aToday;
      return b.count - a.count;
    });

    // Calculate active (unresolved) counts for system badges
    const activeFlagged = allFlaggedList.filter(s => s.distressStatus !== "Solved" && s.distressStatus !== "Resolved");
    const multiDayCount = activeFlagged.filter(s => s.count >= 3 || s.summativeAlert).length;

    TeacherCareState.todayNegativeCount = todayNegCount;
    TeacherCareState.multiDayFlaggedCount = multiDayCount;

    // Filter pill counters
    const countAll = allFlaggedList.length;
    const countUnsolved = allFlaggedList.filter(s => s.distressStatus === "Not Solved").length;
    const countInProgress = allFlaggedList.filter(s => s.distressStatus === "In Progress").length;
    const countSolved = allFlaggedList.filter(s => s.distressStatus === "Solved" || s.distressStatus === "Resolved").length;

    if ($("#count-distress-filter-all")) $("#count-distress-filter-all").textContent = String(countAll);
    if ($("#count-distress-filter-unsolved")) $("#count-distress-filter-unsolved").textContent = String(countUnsolved);
    if ($("#count-distress-filter-progress")) $("#count-distress-filter-progress").textContent = String(countInProgress);
    if ($("#count-distress-filter-solved")) $("#count-distress-filter-solved").textContent = String(countSolved);

    // Update metrics: show active (unsolved) counts so badges don't stay perpetually alert
    if ($("#stat-teacher-today-neg")) $("#stat-teacher-today-neg").textContent = String(todayNegCount);
    if ($("#stat-teacher-multi-distress")) $("#stat-teacher-multi-distress").textContent = String(multiDayCount);
    if ($("#count-care-distress")) $("#count-care-distress").textContent = String(activeFlagged.length);
    if ($("#stat-teacher-active-sec")) $("#stat-teacher-active-sec").textContent = State.section || "All Assigned";

    // Apply current filter tab
    let displayList = allFlaggedList;
    if (TeacherCareState.distressFilter === "not_solved") {
      displayList = allFlaggedList.filter(s => s.distressStatus === "Not Solved");
    } else if (TeacherCareState.distressFilter === "in_progress") {
      displayList = allFlaggedList.filter(s => s.distressStatus === "In Progress");
    } else if (TeacherCareState.distressFilter === "solved") {
      displayList = allFlaggedList.filter(s => s.distressStatus === "Solved" || s.distressStatus === "Resolved");
    }

    renderCareDistressTable(displayList);
    updateCareBadges();
  }

  function renderCareDistressTable(list) {
    const tbody = $("#tbody-care-distress");
    if (!tbody) return;

    if (!list.length) {
      const msg = TeacherCareState.distressFilter === "solved"
        ? "No resolved student distress records yet."
        : TeacherCareState.distressFilter === "in_progress"
          ? "No student distress cases currently marked In Progress."
          : TeacherCareState.distressFilter === "not_solved"
            ? "No unsolved distress alerts! All student check-ins are grounded or resolved 🎉"
            : "No active student care alerts 🎉 Students in your section are currently reporting positive, grounded emotional check-ins.";
      tbody.innerHTML = `<tr><td colspan="7"><div class="state-panel state-empty"><strong>All Clear 🎉</strong><span>${msg}</span></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(s => {
      const todayBadge = s.todayEmotion
        ? `<span class="status-badge status-absent" style="font-size:0.75rem;">${s.todayEmotion.emotion_emoji || "😟"} ${ClassCareUI.escapeHtml(s.todayEmotion.emotion_label || s.todayEmotion.emotion)} (Today)</span>`
        : `<span class="status-badge status-late" style="font-size:0.75rem;">Checked in earlier (${ClassCareUI.escapeHtml(s.lastDate || "—")})</span>`;

      const patternBadge = s.count >= 5
        ? `<span class="priority-pill urgent">${s.count} Negative Check-ins (Critical)</span>`
        : s.count >= 3
          ? `<span class="priority-pill high">${s.count} Negative Check-ins (Frequent)</span>`
          : `<span class="priority-pill moderate">${s.count} Check-in</span>`;

      const summativeBadge = s.summativeAlert
        ? `<div style="margin-top:4px;"><span class="priority-pill urgent" style="display:inline-flex;align-items:center;gap:4px;background:#fee2e2;color:#991b1b;border:1px solid #f87171;font-size:0.75rem;">⚠️ Low Score: ${ClassCareUI.escapeHtml(s.summativeAlert.assessmentTitle || 'Summative Test')} (${s.summativeAlert.score}/${s.summativeAlert.maxScore})</span></div>`
        : '';

      const currentStatus = (s.distressStatus === "Resolved" || s.distressStatus === "Solved") ? "Solved" : s.distressStatus === "In Progress" ? "In Progress" : "Not Solved";
      const statusColor = currentStatus === "Solved" ? "#15803d" : currentStatus === "In Progress" ? "#b45309" : "#b91c1c";
      const statusBg = currentStatus === "Solved" ? "#dcfce7" : currentStatus === "In Progress" ? "#fef3c7" : "#fee2e2";
      const statusBorder = currentStatus === "Solved" ? "#86efac" : currentStatus === "In Progress" ? "#fde68a" : "#fca5a5";

      const statusSelectHtml = `
        <div style="display:inline-flex;align-items:center;gap:4px;">
          <select class="field-select-sm distress-status-select" data-distress-uid="${ClassCareUI.escapeHtml(s.uid)}" data-name="${ClassCareUI.escapeHtml(s.name)}" data-section="${ClassCareUI.escapeHtml(s.section)}" style="font-weight:700;font-size:0.75rem;padding:4px 8px;border-radius:12px;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder};cursor:pointer;">
            <option value="Not Solved" ${currentStatus === "Not Solved" ? "selected" : ""}>🔴 Not Solved</option>
            <option value="In Progress" ${currentStatus === "In Progress" ? "selected" : ""}>🟡 In Progress</option>
            <option value="Solved" ${currentStatus === "Solved" ? "selected" : ""}>🟢 Solved</option>
          </select>
        </div>
      `;

      return `<tr>
        <td>
          <div style="font-weight:700;">${ClassCareUI.escapeHtml(s.name)}</div>
          <div class="tabular" style="font-size:0.75rem;color:var(--text-muted);">${ClassCareUI.escapeHtml(s.student_id)}</div>
        </td>
        <td>${ClassCareUI.escapeHtml(s.section)}</td>
        <td>${todayBadge}</td>
        <td>${patternBadge}${summativeBadge}</td>
        <td style="font-size:0.82rem;max-width:200px;color:var(--text-secondary);">${ClassCareUI.escapeHtml(s.lastNote || "No note entered")}</td>
        <td>${statusSelectHtml}</td>
        <td class="align-right">
          <div style="display:inline-flex;gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" data-care-action="${ClassCareUI.escapeHtml(s.uid)}" data-name="${ClassCareUI.escapeHtml(s.name)}" data-section="${ClassCareUI.escapeHtml(s.section)}" data-category="in_class_support">
              Support Note
            </button>
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--c-absent);" data-care-action="${ClassCareUI.escapeHtml(s.uid)}" data-name="${ClassCareUI.escapeHtml(s.name)}" data-section="${ClassCareUI.escapeHtml(s.section)}" data-category="refer_counselor">
              Escalate
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll(".distress-status-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        const uid = sel.dataset.distressUid;
        const newStatus = sel.value;
        const studentName = sel.dataset.name || "Student";
        const section = sel.dataset.section || "";

        sel.disabled = true;
        try {
          const updates = {
            student_uid: uid,
            student_name: studentName,
            section: section,
            status: newStatus,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            updated_by: State.teacher?.uid || "",
            updated_by_name: `${State.teacher?.first_name || ""} ${State.teacher?.last_name || ""}`.trim() || "Teacher"
          };
          if (newStatus === "Solved") {
            updates.resolved_at = firebase.firestore.FieldValue.serverTimestamp();
          }
          await ClassCare.DB.distress_alerts.doc(uid).set(updates, { merge: true });

          // Update local state map immediately
          TeacherCareState.distressStatusMap.set(uid, {
            ...updates,
            updated_at: new Date().toISOString()
          });

          // Broadcast real-time message across tabs
          try {
            if (window.BroadcastChannel) {
              const bc = new BroadcastChannel("classcare_distress_sync");
              bc.postMessage({ type: "distress_status_update", student_uid: uid, status: newStatus });
            }
          } catch (_) {}

          Toast.success(`Distress status for ${studentName} updated to "${newStatus}".`);
          processCareAlerts();
        } catch (err) {
          console.error("Error updating distress status:", err);
          Toast.error("Failed to update status. Please try again.");
          sel.disabled = false;
        }
      });
    });

    tbody.querySelectorAll("[data-care-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        openCareActionModal(btn.dataset.careAction, btn.dataset.name, btn.dataset.section, btn.dataset.category);
      });
    });
  }

  function openConcernViewModal(c) {
    if (!c) return;
    const modal = $("#teacher-concern-view-modal");
    if (!modal) return;
    const nameEl = $("#concern-view-student-name");
    const badgeEl = $("#concern-view-badge");
    const metaEl = $("#concern-view-meta");
    const catEl = $("#concern-view-category");
    const textEl = $("#concern-view-text");

    const isAnon = c.is_anonymous || !c.student_name || c.student_name === "Anonymous";
    if (nameEl) nameEl.textContent = isAnon ? "Anonymous Student" : (c.student_name || "Student");
    if (badgeEl) {
      badgeEl.textContent = isAnon ? "Anonymous" : "Named Submission";
      badgeEl.className = `status-badge ${isAnon ? "status-late" : "status-present"}`;
    }
    const currentStatus = (c.status === "Resolved" || c.status === "Solved") ? "Solved" : c.status === "In Progress" ? "In Progress" : "Not Solved";
    const dateStr = c.submitted_at?.toDate ? c.submitted_at.toDate().toLocaleString() : (c.submitted_date || c.date || "Today");
    if (metaEl) metaEl.textContent = `Section: ${c.section || "General"} • Submitted: ${dateStr} • Status: ${currentStatus}`;
    if (catEl) catEl.textContent = c.concern_type_label || c.concern_type || "General Emotional / Academic Support";
    if (textEl) textEl.textContent = c.message || "(No message body provided)";

    const updateStatusButtons = () => {
      const activeStatus = (c.status === "Resolved" || c.status === "Solved") ? "Solved" : c.status === "In Progress" ? "In Progress" : "Not Solved";
      modal.querySelectorAll("[data-set-concern-status]").forEach(btn => {
        const s = btn.getAttribute("data-set-concern-status");
        const isActive = s === activeStatus;
        btn.className = `btn btn-sm ${isActive ? (s === "Solved" ? "btn-primary" : s === "In Progress" ? "btn-secondary" : "btn-danger") : "btn-secondary"}`;
        btn.style.fontWeight = isActive ? "800" : "500";
      });
      if (metaEl) metaEl.textContent = `Section: ${c.section || "General"} • Submitted: ${dateStr} • Status: ${activeStatus}`;
    };
    updateStatusButtons();

    modal.querySelectorAll("[data-set-concern-status]").forEach(btn => {
      btn.onclick = async () => {
        const newStatus = btn.getAttribute("data-set-concern-status");
        try {
          const updates = { status: newStatus, updated_at: firebase.firestore.FieldValue.serverTimestamp(), teacher_updated: true };
          try { await ClassCare.DB.concern_submissions.doc(c.id).set(updates, { merge: true }); } catch (_) {}
          try { await ClassCare.DB.talkToSomeone.doc(c.id).set(updates, { merge: true }); } catch (_) {}
          c.status = newStatus;
          updateStatusButtons();
          Toast.success(`Concern status set to "${newStatus}".`);
          renderCareConcerns();
        } catch (err) {
          Toast.error("Could not update status. Please try again.");
        }
      };
    });

    const actionBtn = $("#btn-concern-view-action");
    if (actionBtn) {
      actionBtn.onclick = () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex", "is-open");
        modal.style.display = "none";
        openCareActionModal(c.student_uid, c.student_name || "Student", c.section || "", "in_class_support", c.id);
      };
    }

    modal.querySelectorAll("[data-close-concern-view]").forEach(btn => {
      btn.onclick = () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex", "is-open");
        modal.style.display = "none";
      };
    });

    modal.classList.remove("hidden");
    modal.classList.add("flex", "is-open"); modal.dataset.studentUid = c.student_uid || c.id || "";
    modal.style.display = "flex";
  }

  function renderCareConcerns() {
    const tbody = $("#tbody-care-concerns");
    if (!tbody) return;

    const filtered = TeacherCareState.studentConcerns.filter(c => {
      return studentBelongsToTeacher(c.section || "");
    }).sort((a, b) => {
      const aT = a.submitted_at?.toMillis ? a.submitted_at.toMillis() : (a.timestamp?.toMillis ? a.timestamp.toMillis() : 0);
      const bT = b.submitted_at?.toMillis ? b.submitted_at.toMillis() : (b.timestamp?.toMillis ? b.timestamp.toMillis() : 0);
      return bT - aT;
    });

    if ($("#stat-teacher-concerns")) $("#stat-teacher-concerns").textContent = String(filtered.length);
    if ($("#count-care-concerns")) $("#count-care-concerns").textContent = String(filtered.length);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="state-panel state-empty"><strong>No confidential student inquiries</strong><span>Students in your section have not submitted any pending "Talk to Someone" requests.</span></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const dateStr = c.submitted_at?.toDate ? c.submitted_at.toDate().toLocaleDateString() : (c.date || "—");
      const normStatus = (c.status === "Resolved" || c.status === "Solved") ? "Solved" : c.status === "In Progress" ? "In Progress" : "Not Solved";
      const statusBadge = normStatus === "Solved"
        ? `<span class="status-badge status-present">Solved</span>`
        : normStatus === "In Progress"
          ? `<span class="status-badge status-late">In Progress</span>`
          : `<span class="status-badge status-absent">Not Solved</span>`;

      return `<tr data-concern-row="${ClassCareUI.escapeHtml(c.id)}" style="cursor:pointer;" title="Click to read confidential report">
        <td>
          <div style="font-weight:700;">${ClassCareUI.escapeHtml(c.is_anonymous ? "Anonymous Student" : (c.student_name || "Student"))}</div>
          <div class="tabular" style="font-size:0.75rem;color:var(--text-muted);">${c.is_anonymous ? "Confidential" : ClassCareUI.escapeHtml(c.student_id || "—")}</div>
        </td>
        <td>${ClassCareUI.escapeHtml(c.section || "—")}</td>
        <td><span class="status-badge status-present" style="font-size:0.75rem;">${ClassCareUI.escapeHtml(c.concern_type || "General")}</span></td>
        <td class="tabular" style="font-size:0.8rem;">${ClassCareUI.escapeHtml(dateStr)}</td>
        <td style="font-size:0.82rem;max-width:240px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ClassCareUI.escapeHtml(c.message || "—")}</td>
        <td>${statusBadge}</td>
        <td class="align-right" style="white-space:nowrap;">
          <button type="button" class="btn btn-ghost btn-sm" data-read-concern="${ClassCareUI.escapeHtml(c.id)}">Read Message</button>
          <button type="button" class="btn btn-secondary btn-sm" data-respond-concern="${ClassCareUI.escapeHtml(c.id)}" data-uid="${ClassCareUI.escapeHtml(c.student_uid || "")}" data-name="${ClassCareUI.escapeHtml(c.student_name || "Student")}" data-section="${ClassCareUI.escapeHtml(c.section || "")}">
            Action Note
          </button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("tr[data-concern-row]").forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        const c = filtered.find(item => item.id === tr.dataset.concernRow);
        if (c) openConcernViewModal(c);
      });
    });

    tbody.querySelectorAll("[data-read-concern]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const c = filtered.find(item => item.id === btn.dataset.readConcern);
        if (c) openConcernViewModal(c);
      });
    });

    tbody.querySelectorAll("[data-respond-concern]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openCareActionModal(btn.dataset.uid, btn.dataset.name, btn.dataset.section, "in_class_support", btn.dataset.respondConcern);
      });
    });
  }

  function updateCareBadges() {
    const activeConcerns = TeacherCareState.studentConcerns.filter(c => {
      const s = String(c.status || "").toLowerCase();
      return s !== "resolved" && s !== "solved";
    });
    const totalAlerts = TeacherCareState.todayNegativeCount + TeacherCareState.multiDayFlaggedCount + activeConcerns.length;
    const topbarCount = $("#topbar-alerts-count");
    const mobileBadge = $("#mobile-alerts-badge");
    const navPill = $("#nav-alerts-pill");

    if (totalAlerts > 0) {
      if (topbarCount) { topbarCount.textContent = String(totalAlerts); topbarCount.classList.remove("hidden"); }
      if (mobileBadge) { mobileBadge.textContent = String(totalAlerts); mobileBadge.classList.remove("hidden"); }
      if (navPill) { navPill.textContent = `${totalAlerts} Alert${totalAlerts > 1 ? "s" : ""}`; navPill.classList.remove("hidden"); }
    } else {
      if (topbarCount) topbarCount.classList.add("hidden");
      if (mobileBadge) mobileBadge.classList.add("hidden");
      if (navPill) navPill.classList.add("hidden");
    }
  }

  function openCareActionModal(studentUid, studentName, section, defaultCategory = "in_class_support", concernId = "") {
    const modal = $("#teacher-care-modal");
    if (!modal) return;
    if ($("#care-action-student-uid")) $("#care-action-student-uid").value = studentUid || "";
    if ($("#care-action-student-name")) $("#care-action-student-name").value = studentName || "";
    if ($("#care-action-section")) $("#care-action-section").value = section || "";
    if ($("#care-action-concern-id")) $("#care-action-concern-id").value = concernId || "";
    if ($("#care-action-category")) $("#care-action-category").value = defaultCategory;
    if ($("#care-action-note")) $("#care-action-note").value = "";

    const summary = $("#care-action-student-summary");
    if (summary) {
      summary.innerHTML = `<strong>Student:</strong> ${ClassCareUI.escapeHtml(studentName)} · <strong>Section:</strong> ${ClassCareUI.escapeHtml(section || State.section || "—")}`;
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex", "is-open");
    modal.style.display = "flex";
    $("#care-action-note")?.focus();
  }

  function closeCareActionModal() {
    const modal = $("#teacher-care-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex", "is-open");
    modal.style.display = "none";
  }

  let _isCareActionSubmitting = false;
  async function handleCareActionSubmit(ev) {
    ev.preventDefault();
    if (_isCareActionSubmitting) return;
    const studentUid = $("#care-action-student-uid")?.value || "";
    const studentName = $("#care-action-student-name")?.value || "Student";
    const section = $("#care-action-section")?.value || "";
    const concernId = $("#care-action-concern-id")?.value || "";
    const category = $("#care-action-category")?.value || "in_class_support";
    const note = ($("#care-action-note")?.value || "").trim();

    if (!note) return Toast.warn("Please enter support notes or context.");

    const btn = $("#btn-save-care-action");
    _isCareActionSubmitting = true;
    Utils.setLoading(btn, true);

    try {
      if (category === "refer_counselor") {
        await escalateToCounselor(studentUid, studentName, section, note);
      } else {
        await ClassCare.DB.logAudit(State.teacher?.uid || "", "teacher_care_action", {
          student_uid: studentUid,
          student_name: studentName,
          section: section || State.section || "",
          category,
          note,
          logged_at: new Date().toISOString()
        });
        Toast.success("Teacher support action recorded.");
      }

      if (concernId) {
        await ClassCare.DB.concern_submissions.doc(concernId).set({
          status: "In Review",
          teacher_response: note,
          teacher_uid: State.teacher?.uid || "",
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        Toast.info("Concern inquiry status updated to In Review.");
      }

      closeCareActionModal();
      loadTeacherCareAlerts();
    } catch (err) {
      console.error("[teacher-care] action save failed:", err);
      Toast.error("Could not save care action. Check permissions.");
    } finally {
      _isCareActionSubmitting = false;
      Utils.setLoading(btn, false);
    }
  }

  function renderStats() {
    const list = studentsFiltered(); let scanned = 0; let late = 0;
    list.forEach(student => { const record = State.attendance.get(student.uid); if (record) { scanned += 1; if (record.status === "Late") late += 1; } });
    const onTime = Math.max(0, scanned - late);
    const missing = Math.max(0, list.length - scanned);
    const total = list.length;

    $("#stat-total")?.replaceChildren(document.createTextNode(String(total)));
    $("#stat-scanned")?.replaceChildren(document.createTextNode(String(scanned)));
    $("#stat-late")?.replaceChildren(document.createTextNode(String(late)));
    $("#stat-missing")?.replaceChildren(document.createTextNode(String(missing)));
    $("#stat-scanned-pct")?.replaceChildren(document.createTextNode(total ? `${Math.round(scanned / total * 100)}%` : "0%"));
    $("#head-section")?.replaceChildren(document.createTextNode(State.section || "All sections"));

    // Real live data binding for reference pill filter bar (from live Firestore)
    const pillPresent = $("#pill-stat-present");
    if (pillPresent) pillPresent.textContent = `${onTime} on time`;
    const pillLate = $("#pill-stat-late");
    if (pillLate) pillLate.textContent = `${late} late`;
    const pillUnrecorded = $("#pill-stat-unrecorded");
    if (pillUnrecorded) pillUnrecorded.textContent = `${missing} not recorded`;
    const pillTotal = $("#pill-stat-total");
    if (pillTotal) pillTotal.textContent = `${total} enrolled students`;

    // Dynamic Overview Left Panel Count Synchronization
    const workspaceCountEl = $("#workspace-student-count");
    if (workspaceCountEl) workspaceCountEl.textContent = String(total);
    const workspaceFooterCountEl = $("#workspace-footer-count");
    if (workspaceFooterCountEl) workspaceFooterCountEl.textContent = `${total} enrolled student${total === 1 ? "" : "s"}`;

    const pageTitle = $("#teacher-page-title");
    if (pageTitle) pageTitle.textContent = State.section ? `Section ${State.section}` : "All Sections";
    const roomLabel = $("#teacher-room-label");
    if (roomLabel) roomLabel.textContent = State.section ? `Section ${State.section}` : (State.teacher?.preferred_section || "Classroom");

    renderAlertBadge();
    if (typeof renderDynamicReferenceHero === "function") {
      renderDynamicReferenceHero();
    }
  }
  function setTableState(type, title, message) {
    const body = $("#attendance-tbody"); if (!body) return;
    const panel = document.createElement("div"); panel.className = `state-panel state-${type}`; const strong = document.createElement("strong"); strong.textContent = title; const span = document.createElement("span"); span.textContent = message; panel.append(strong, span);
    const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 8; cell.appendChild(panel); row.appendChild(cell); body.replaceChildren(row);
  }
  function renderAttendanceTable() {
    const body = $("#attendance-tbody"); if (!body) return;
    const header = body.closest("table")?.querySelector("thead tr");
    if (header && !header.querySelector("[data-emotion-column]")) {
      const emotionHeader = document.createElement("th"); emotionHeader.dataset.emotionColumn = "true"; emotionHeader.textContent = "Emotion check"; header.appendChild(emotionHeader);
    }
    if (header && !header.querySelector("[data-alert-column]")) {
      const alertHeader = document.createElement("th"); alertHeader.dataset.alertColumn = "true"; alertHeader.textContent = "Intervention"; header.appendChild(alertHeader);
    }
    const list = studentsFiltered();
    if (!list.length) return setTableState("empty", State.section ? "No students are assigned to this section." : "No students match these filters.", "Choose another section or clear the search.");
    const today = Utils.todayIso();
    body.innerHTML = list.map(student => {
      const record = State.attendance.get(student.uid); const status = record?.status || "Not recorded";
      const emotionAnswers = surveyAnswers(record).filter(Boolean);
      const emotion = emotionAnswers.length ? `${emotionAnswers.length}/${EMOTION_QUESTIONS.length} answered` : "Not checked";
      const avatar = student.photo_data ? `<img src="${escapeAttr(student.photo_data)}" alt="" />` : escapeHtml(initialsOf(student));
      const action = record?.time_in && !record.time_out ? `<button class="btn btn-ghost btn-sm" type="button" data-timeout-uid="${escapeAttr(student.uid)}">Record time out</button>` : "—";
      return `<tr data-intervention-row="${escapeAttr(student.uid)}">
        <td>
          <div class="identity-cell" style="cursor:pointer;" data-open-emotion-uid="${escapeAttr(student.uid)}" title="Click to view emotional timeline">
            <span class="identity-avatar">${avatar}</span>
            <span>
              <span class="identity-name" style="text-decoration:underline;text-underline-offset:2px;">${escapeHtml(`${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student")}</span>
              <span class="identity-meta">${escapeHtml(student.section || "—")}</span>
            </span>
          </div>
        </td>
        <td class="tabular">${escapeHtml(student.student_id || "—")}</td>
        <td class="tabular">${escapeHtml(record?.time_in || "—")}</td>
        <td class="tabular">${escapeHtml(record?.time_out || "—")}</td>
        <td>${ClassCareUI.statusBadge(status, record?.minutes_late ? `+${record.minutes_late}m` : "")}</td>
        <td data-emo-cell="${escapeAttr(student.uid)}" style="cursor:pointer;font-weight:600;" data-open-emotion-uid="${escapeAttr(student.uid)}" title="Click to view emotional timeline">${escapeHtml(emotion)}</td>
        <td data-flag-cell="${escapeAttr(student.uid)}"><span class="status-badge not-recorded">Evaluating…</span></td>
        <td class="align-right">${action}</td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-open-emotion-uid]").forEach(el => {
      el.addEventListener("click", () => openStudentEmotionTimelineModal(el.dataset.openEmotionUid));
    });
    body.querySelectorAll("[data-timeout-uid]").forEach(button => button.addEventListener("click", () => recordTimeOut(button.dataset.timeoutUid)));
    // Async post-render intervention evaluation
    const throttleMs = 5000;
    const nowTs = Date.now();
    const skipFullEval = (nowTs - State.intervention.lastEvalAt) < throttleMs;
    if (!skipFullEval) State.intervention.lastEvalAt = nowTs;
    list.forEach(student => evaluateStudentIntervention(student, today));
  }

  function evaluateStudentIntervention(student, today) {
    const uid = student.uid, row = document.querySelector('[data-intervention-row="' + CSS.escape(uid) + '"]');
    const emoCell = document.querySelector('[data-emo-cell="' + CSS.escape(uid) + '"]');
    const flagCell = document.querySelector('[data-flag-cell="' + CSS.escape(uid) + '"]');
    const emotion = State.intervention.emotionCache.get(uid);
    if (emoCell) emoCell.textContent = emotion?.emotion ? (emotion.label || emotion.emotion) + ' · ' + emotion.date : 'Not recorded';
    const triggered = State.holisticAlerts?.has(uid);
    row?.classList.toggle('is-flagged', !!triggered);
    if (flagCell) flagCell.textContent = triggered ? 'Intervention Needed' : 'No holistic alert';
  }

  function renderEmotionReport() {
    const report=$('#emotion-report'); if(!report) return;
    const checks=(State.holisticData?.checks || []).filter(c => c.recorded_via === 'deep_kiosk' && c.date === Utils.todayIso() && studentBelongsToTeacher(c.section));
    report.innerHTML='<h2>Today’s deep emotional checks</h2><p>'+checks.length+' completed assessments</p>'+ClassCareHolistic.QUESTIONS.map(q => {
      const counts=[0,0,0,0]; checks.forEach(c => { const option=c.answers?.[q.id]?.option; if(Number.isInteger(option) && option>=1 && option<=4) counts[option-1]++; });
      return '<div class="emotion-report-item"><strong>'+escapeHtml(q.text)+'</strong><p>'+q.options.map((label,i) => escapeHtml(label)+': '+counts[i]).join(' · ')+'</p></div>';
    }).join('');
  }
  async function recordTimeOut(studentUid) {
    const record = State.attendance.get(studentUid); if (!record?.time_in || record.time_out) return;
    const timeOut = Utils.nowHhMm();
    if (timeOut < (State.settings.time_out_start || "15:00")) return Toast.warn("Time out can start at 3:00 PM.");
    const payload = { student_uid: studentUid, date: Utils.todayIso(), time_in: record.time_in, time_out: timeOut, status: record.status, section: record.section || State.students.get(studentUid)?.section || State.section, scanned_by: record.scanned_by || State.teacher?.uid };
    try {
      if (!navigator.onLine) throw Object.assign(new Error("offline"), { code: "offline" });
      await ClassCare.DB.attendance.doc(ClassCare.DB.attendanceDocId(studentUid, payload.date)).set({ time_out: timeOut, timed_out_by: State.teacher?.uid, timed_out_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      State.attendance.set(studentUid, { ...record, time_out: timeOut }); renderAttendanceTable(); Toast.success("Time out recorded.");
    } catch (error) {
      try { await OfflineSync.enqueueAttendance(payload); State.attendance.set(studentUid, { ...record, time_out: timeOut, _pending: true }); renderAttendanceTable(); Toast.info("Time out saved and waiting to sync."); }
      catch (_) { Toast.error(error?.code === "permission-denied" ? "Time out is not permitted for this account." : "Time out could not be saved."); }
    }
  }

  async function refreshOfflineBadge() {
    const badge = $("#offline-badge"); const label = $("#offline-badge-text"); const count = $("#pending-n"); if (!badge) return;
    const pending = await OfflineSync.pendingCount().catch(() => ({ attendance: 0, tickets: 0, moods: 0, emotions: 0 })); const total = (pending.attendance || 0) + (pending.tickets || 0) + (pending.moods || 0) + (pending.emotions || 0);
    badge.classList.toggle("hidden", navigator.onLine && total === 0); badge.classList.toggle("is-offline", !navigator.onLine); badge.classList.toggle("is-waiting", navigator.onLine && total > 0); badge.classList.toggle("is-syncing", OfflineSync.getState?.().status === "syncing");
    if (count) count.textContent = String(total);
    if (label) label.textContent = !navigator.onLine ? "Offline · waiting to sync" : total ? "Waiting to sync" : "All scans synced";
  }
  window.addEventListener("online", refreshOfflineBadge); window.addEventListener("offline", refreshOfflineBadge);

  function setScannerState(state, message = "") {
    const status = $("#scan-status"); const empty = $("#scanner-empty"); const start = $("#btn-start-scan"); const stop = $("#btn-stop-scan");
    const labels = { off: "Camera off", starting: "Starting camera", ready: "Camera ready", permission: "Camera permission needed", unavailable: "Camera unavailable", stopped: "Camera stopped" };
    if (status) { status.textContent = labels[state] || state; status.className = `status-badge ${state === "ready" ? "status-present" : state === "permission" || state === "unavailable" ? "status-absent" : "status-not-recorded"}`; }
    if (empty && !State.scanning) { empty.classList.remove("hidden"); empty.querySelector("strong")?.replaceChildren(document.createTextNode(labels[state] || "Camera off")); empty.querySelector("span")?.replaceChildren(document.createTextNode(message || "Choose a section, then start the camera to scan a Student ID.")); }
    if (start) start.classList.toggle("hidden", State.scanning); if (stop) stop.classList.toggle("hidden", !State.scanning);
  }
  let multiScaleScannerId = null;
  let scanOffscreenCanvas = null;
  let scanOffscreenCtx = null;
  let nativeBarcodeDetector = null;

  if (typeof window !== "undefined" && typeof window.BarcodeDetector === "function") {
    try {
      nativeBarcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch (_) {}
  }

  function stopHighSensitivityScannerLoop() {
    if (multiScaleScannerId) {
      cancelAnimationFrame(multiScaleScannerId);
      multiScaleScannerId = null;
    }
  }

  function startHighSensitivityScannerLoop(video) {
    stopHighSensitivityScannerLoop();
    if (!video) return;

    if (!scanOffscreenCanvas) {
      scanOffscreenCanvas = document.createElement("canvas");
      scanOffscreenCtx = scanOffscreenCanvas.getContext("2d", { willReadFrequently: true });
    }

    let lastScanTs = 0;
    let frameStep = 0;

    async function frameScan(now) {
      if (!State.scanning || !video || video.paused || video.ended) {
        multiScaleScannerId = null;
        return;
      }

      // High-speed scan: check every ~55ms (~18 scans/sec)
      if (now - lastScanTs >= 55 && !State.scanInFlight && !State.wellbeing?.active) {
        lastScanTs = now;
        frameStep++;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (vw >= 80 && vh >= 80) {
          let detected = null;

          // 1. Hardware-accelerated BarcodeDetector (instant GPU processing)
          if (nativeBarcodeDetector) {
            try {
              const barcodes = await nativeBarcodeDetector.detect(video);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                detected = barcodes[0].rawValue;
              }
            } catch (_) {}
          }

          // 2. High-speed jsQR multi-scale engine
          if (!detected && window.jsQR) {
            // Pass A: Center 55% Crop (2x MAGNIFIED ZOOM for small or far-away ID card QR codes)
            const cropW = Math.floor(vw * 0.55);
            const cropH = Math.floor(vh * 0.55);
            const cropX = Math.floor((vw - cropW) / 2);
            const cropY = Math.floor((vh - cropH) / 2);

            const targetDim = 440;
            scanOffscreenCanvas.width = targetDim;
            scanOffscreenCanvas.height = targetDim;

            scanOffscreenCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetDim, targetDim);
            let imgData = scanOffscreenCtx.getImageData(0, 0, targetDim, targetDim);

            let qr = window.jsQR(imgData.data, targetDim, targetDim, { inversionAttempts: "attemptBoth" });
            if (qr && qr.data) {
              detected = qr.data;
            }

            // Pass B: Full Frame pass (for close / large QR codes)
            if (!detected) {
              const fullW = 512;
              const fullH = Math.floor((vh / vw) * fullW) || 384;
              scanOffscreenCanvas.width = fullW;
              scanOffscreenCanvas.height = fullH;
              scanOffscreenCtx.drawImage(video, 0, 0, fullW, fullH);
              imgData = scanOffscreenCtx.getImageData(0, 0, fullW, fullH);
              qr = window.jsQR(imgData.data, fullW, fullH, { inversionAttempts: "dontInvert" });
              if (qr && qr.data) {
                detected = qr.data;
              }
            }

            // Pass C: Contrast & Binarization (every other frame to combat glare, reflections, and dim lighting)
            if (!detected && frameStep % 2 === 0) {
              scanOffscreenCanvas.width = targetDim;
              scanOffscreenCanvas.height = targetDim;
              scanOffscreenCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetDim, targetDim);
              imgData = scanOffscreenCtx.getImageData(0, 0, targetDim, targetDim);
              const d = imgData.data;
              for (let i = 0; i < d.length; i += 4) {
                const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
                const v = lum > 118 ? 255 : 0;
                d[i] = v; d[i + 1] = v; d[i + 2] = v;
              }
              qr = window.jsQR(d, targetDim, targetDim, { inversionAttempts: "attemptBoth" });
              if (qr && qr.data) {
                detected = qr.data;
              }
            }
          }

          if (detected) {
            onDecodedQR(detected);
          }
        }
      }

      if (State.scanning) {
        multiScaleScannerId = requestAnimationFrame(frameScan);
      }
    }

    multiScaleScannerId = requestAnimationFrame(frameScan);
  }

  function getScanner(createNew = false) {
    if (State.scanner && !createNew) return State.scanner;
    if (!$("#scanner-root")) return null;
    if (!window.Html5Qrcode) { setScannerState("unavailable", "The camera library could not load. Use manual QR entry below."); Toast.error("Camera library is unavailable. Use manual QR entry."); return null; }
    try { if (State.scanner) { try { State.scanner.stop().catch(() => {}); } catch (_) {} try { State.scanner.clear(); } catch (_) {} } } catch (_) {}
    $("#scanner-empty")?.classList.add("hidden");
    const formats = window.Html5QrcodeSupportedFormats ? [window.Html5QrcodeSupportedFormats.QR_CODE] : undefined;
    State.scanner = new Html5Qrcode("scanner-root", {
      formatsToSupport: formats,
      verbose: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    });
    return State.scanner;
  }
  function onDecodedQR(decoded) {
    if (State.wellbeing?.active || State.scanInFlight) return;
    const now = Date.now();
    if (decoded === State.lastDecodedRaw && now - (State.lastScanTs || 0) < 2500) return;
    if (now - (State.lastScanTs || 0) < 350) return;
    State.lastScanTs = now;
    State.lastDecodedRaw = decoded;
    State.scanInFlight = true;

    Promise.resolve(handleDecodedText(decoded, { fromScanner: true })).finally(() => { State.scanInFlight = false; });
  }
  async function startScanner() {
    if (State.scanning || State.transitioning) return;
    if (!State.section && State.teacher?.role !== "admin") {
      const teacherSections = getTeacherAssignedSections(State.teacher);
      if (teacherSections.length) {
        State.section = teacherSections[0];
        const secSelect = $("#section-select") || $("#kiosk-section-select");
        if (secSelect) secSelect.value = State.section;
      }
    }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return setScannerState("unavailable", "Camera access requires HTTPS or localhost. Use manual QR entry below.");
    }
    State.transitioning = true;
    const button = $("#btn-start-scan");
    Utils.setLoading(button, true);
    setScannerState("starting");

    const scanner = getScanner(true);
    if (!scanner) {
      State.transitioning = false;
      Utils.setLoading(button, false);
      return;
    }

    // High-speed wide-angle QR bounding box (92% coverage for maximum scanning surface)
    const qrbox = (w, h) => {
      const edge = Math.min(w, h);
      const size = Math.max(260, Math.floor(edge * 0.92));
      return { width: size, height: size };
    };

    let started = false;
    let finalError = null;

    // Fast attempt 1: Environment camera with balanced 720p HD sensor for distance scanning
    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox,
          disableFlip: false,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          }
        },
        onDecodedQR,
        () => {}
      );
      started = true;
    } catch (err1) {
      console.warn("[scanner] Environment attempt failed, trying flexible user camera:", err1);
      finalError = err1;
      // Fast attempt 2: Front/User camera fallback (HD target)
      try {
        await scanner.start(
          { facingMode: "user" },
          {
            fps: 15,
            qrbox,
            disableFlip: false,
            videoConstraints: {
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 }
            }
          },
          onDecodedQR,
          () => {}
        );
        started = true;
        finalError = null;
      } catch (err2) {
        console.warn("[scanner] User camera attempt failed, trying unconstrained fallback:", err2);
        finalError = err2;
        // Fast attempt 3: Minimal fallback
        try {
          await scanner.start(
            { facingMode: "environment" },
            { fps: 15, qrbox },
            onDecodedQR,
            () => {}
          );
          started = true;
          finalError = null;
        } catch (err3) {
          finalError = err3;
        }
      }
    }

    if (started) {
      applyCameraOrientation();
      applyCameraMirrorState();
      await applyCameraLightingAndFocus();

      State.scanning = true;
      setScannerState("ready");
      Toast.success("High-speed QR camera ready with auto-focus & lighting.");

      const videoEl = document.querySelector("#scanner-root video");
      if (videoEl) {
        startHighSensitivityScannerLoop(videoEl);
      }
    } else {
      console.error("[teacher-camera] ALL attempts failed:", finalError);
      try {
        if (State.scanner) {
          try { await withTimeout(Promise.resolve().then(() => State.scanner.stop()), 2500).catch(() => {}); } catch (_) {}
          try { State.scanner.clear(); } catch (_) {}
        }
      } catch (_) {}
      State.scanner = null;
      State.scanning = false;
      const permissionError = ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(finalError?.name) || finalError?.code === "camera-timeout";
      const state = permissionError ? "permission" : "unavailable";
      const message = permissionError
        ? "Allow camera access in the browser address bar, then try again. Manual QR entry remains available."
        : finalError?.name === "NotFoundError"
          ? "No camera was found. Use manual QR entry below."
          : `Camera could not start (${finalError?.name || finalError?.code || "unknown"}). Use manual QR entry below.`;
      setScannerState(state, message);
      Toast.error(permissionError ? "Camera access needs permission. Check the browser settings and try again." : `Camera could not start: ${finalError?.message || finalError?.name || "Unknown error"}`);
    }
    State.transitioning = false;
    Utils.setLoading(button, false);
  }
  async function stopScanner() {
    stopHighSensitivityScannerLoop();
    if (State.wellbeing.active || State.wellbeing.pending) teardownWellbeingSurvey();
    if (!State.scanner || State.transitioning) return;
    State.transitioning = true; const button = $("#btn-stop-scan"); Utils.setLoading(button, true);
    if (State.activeVideoTrack) {
      try { State.activeVideoTrack.stop(); } catch (_) {}
      State.activeVideoTrack = null;
    }
    try { await withTimeout(Promise.resolve().then(() => State.scanner.stop()), 2500); } catch (_) {} try { State.scanner.clear(); } catch (_) {}
    State.scanner = null; State.scanning = false; State.transitioning = false; setScannerState("stopped", "Start the camera again when you are ready."); Utils.setLoading(button, false);
  }
  function cleanupScanner() {
    clearTimeout(State.resetTimer);
    State._unsubSettings?.(); State._unsubSettings = null;
    State._unsubEnrollments?.(); State._unsubEnrollments = null;
    State.intervention.unsubAlerts?.(); State.intervention.unsubAlerts = null;
    if (typeof TeacherCareState !== 'undefined') {
      TeacherCareState.unsubEmotional?.(); TeacherCareState.unsubEmotional = null;
      TeacherCareState.unsubConcerns?.(); TeacherCareState.unsubConcerns = null;
      TeacherCareState.unsubCareAlerts?.(); TeacherCareState.unsubCareAlerts = null;
      TeacherCareState.unsubDistressAlerts?.(); TeacherCareState.unsubDistressAlerts = null;
    }
    if (typeof _unsubTalkToSomeone !== 'undefined') { _unsubTalkToSomeone?.(); _unsubTalkToSomeone = null; }
    State.unsubscribeAttendance?.(); State.unsubscribeAttendance = null;
    if (State.unsubscribeVibeCheck) { try { State.unsubscribeVibeCheck(); } catch(_) {} State.unsubscribeVibeCheck = null; }
    if (State._unsubUsers) { State._unsubUsers(); State._unsubUsers = null; }
    if (State.nextDayTimer) { clearTimeout(State.nextDayTimer); State.nextDayTimer = null; }
    stopHighSensitivityScannerLoop();
    if (State.activeVideoTrack) {
      try { State.activeVideoTrack.stop(); } catch (_) {}
      State.activeVideoTrack = null;
    }
    if (State.scanner) {
      const scanner=State.scanner; State.scanner=null;
      // stop can throw synchronously; clear must wait for shutdown.
      void Promise.resolve().then(()=>scanner.isScanning ? scanner.stop() : undefined)
        .catch(()=>{}).then(()=>{try {scanner.clear?.();}catch(_){}});
    }
    State.scanning = false; State.scanInFlight = false;
    if (activeKioskGesture) {
      try { activeKioskGesture.stop(); } catch (_) {}
      activeKioskGesture = null;
    }
    teardownWellbeingSurvey();
  }

  async function ensureHandsApi() {
    if (window.Hands && window.drawConnectors && window.drawLandmarks) return true;
    const loadScript = (src, test) => new Promise(resolve => {
      if (test()) return resolve(true);
      const script = document.createElement("script"); script.src = src;
      script.onload = () => resolve(test()); script.onerror = () => resolve(test());
      let safety = 0; const check = setInterval(() => {
        if (test()) { clearInterval(check); resolve(true); }
        if (++safety > 40) { clearInterval(check); resolve(false); }
      }, 250);
      document.head.appendChild(script);
    });
    try {
      const handsOk = await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js", () => !!window.Hands);
      const drawOk = await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js", () => !!window.drawConnectors && !!window.drawLandmarks);
      return handsOk && drawOk;
    } catch (_) {
      return !!(window.Hands && window.drawConnectors && window.drawLandmarks);
    }
  }

  async function applyNativeCameraEnhancements() {
    const video = document.querySelector("#scanner-root video");
    if (!video) return;
    const stream = video.srcObject;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
      const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
      console.log("[camera] Active sensor resolution:", settings.width, "x", settings.height);
      console.log("[camera] Native capabilities:", capabilities);

      const advanced = [];
      // 1. Force continuous native auto-focus
      if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }
      // 2. Force continuous native auto-exposure
      if (capabilities.exposureMode && capabilities.exposureMode.includes("continuous")) {
        advanced.push({ exposureMode: "continuous" });
      }
      // 3. Force continuous native white-balance
      if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes("continuous")) {
        advanced.push({ whiteBalanceMode: "continuous" });
      }

      if (advanced.length > 0 && typeof track.applyConstraints === "function") {
        await track.applyConstraints({ advanced }).catch(err => {
          console.warn("[camera] Advanced constraints warning:", err);
        });
        console.log("[camera] Continuous auto-focus & exposure active:", advanced);
      }

      State.activeVideoTrack = track;
      State.activeTrackCapabilities = capabilities;

      setupTapToFocus(video, track, capabilities);
      setupDistanceZoom(track, capabilities);
    } catch (err) {
      console.warn("[camera] applyNativeCameraEnhancements error:", err);
    }
  }

  function setupTapToFocus(video, track, capabilities) {
    const root = $("#scanner-root");
    if (!root || root._tapToFocusInit) return;
    root._tapToFocusInit = true;
    root.style.cursor = "crosshair";
    root.title = "Tap anywhere to auto-focus";

    root.addEventListener("click", async (e) => {
      if (!State.activeVideoTrack) return;
      try {
        createFocusRing(e, root);
        const adv = [];
        if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
          adv.push({ focusMode: "continuous" });
        }
        if (capabilities.exposureMode && capabilities.exposureMode.includes("continuous")) {
          adv.push({ exposureMode: "continuous" });
        }
        if (adv.length > 0) {
          await State.activeVideoTrack.applyConstraints({ advanced: adv });
        }
      } catch (err) {
        console.warn("[tap-to-focus] refocus failed:", err);
      }
    });
  }

  function createFocusRing(e, parent) {
    const rect = parent.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ring = document.createElement("div");
    ring.className = "camera-focus-ring";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    parent.appendChild(ring);
    setTimeout(() => ring.remove(), 750);
  }

  let currentZoom = 1.0;
  let currentLightingMode = "auto";

  async function applyCameraLightingAndFocus() {
    const video = document.querySelector("#scanner-root video");
    if (!video) return;
    const stream = video.srcObject;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    State.activeVideoTrack = track;
    const caps = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
    State.activeTrackCapabilities = caps;

    try {
      const advanced = [];
      // 1. Continuous Auto-Focus (dynamic focus for moving cards)
      if (caps.focusMode && caps.focusMode.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }
      // 2. Continuous Auto-Exposure (prevents glare on white QR cards & brightens dim rooms)
      if (caps.exposureMode && caps.exposureMode.includes("continuous")) {
        advanced.push({ exposureMode: "continuous" });
      }
      // 3. Continuous White-Balance
      if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes("continuous")) {
        advanced.push({ whiteBalanceMode: "continuous" });
      }

      if (advanced.length > 0 && typeof track.applyConstraints === "function") {
        await track.applyConstraints({ advanced }).catch(err => {
          console.warn("[camera] Constraints warning:", err);
        });
      }
    } catch (err) {
      console.warn("[camera] Auto-lighting/focus error:", err);
    }

    applyZoomLevel(currentZoom);
    applyLightingFilter(currentLightingMode);
    setupTapToFocus(video, track, caps);
  }

  async function applyZoomLevel(zoom) {
    currentZoom = zoom;
    const zoomBtn = $("#btn-camera-zoom");
    if (zoomBtn) zoomBtn.innerHTML = `<span>🔍 Zoom: ${zoom.toFixed(1)}x</span>`;

    const track = State.activeVideoTrack;
    const caps = State.activeTrackCapabilities || {};

    // 1. Hardware optical/digital zoom if camera driver supports it
    if (track && caps.zoom && typeof track.applyConstraints === "function") {
      try {
        const targetZoom = Math.min(caps.zoom.max || 1.0, Math.max(caps.zoom.min || 1.0, zoom));
        await track.applyConstraints({ advanced: [{ zoom: targetZoom }] }).catch(() => {});
      } catch (_) {}
    }

    // 2. CSS video scale transform — guarantees distance zoom works on 100% of all webcams and laptops
    const video = document.querySelector("#scanner-root video");
    if (video) {
      const isMirrored = localStorage.getItem("classcare_camera_mirrored") === "true";
      const scaleX = isMirrored ? -zoom : zoom;
      video.style.transform = `scale(${scaleX}, ${zoom})`;
      video.style.webkitTransform = `scale(${scaleX}, ${zoom})`;
      video.style.transformOrigin = "center center";
    }
  }

  function toggleCameraZoom() {
    const nextZoom = currentZoom === 1.0 ? 1.5 : currentZoom === 1.5 ? 2.0 : 1.0;
    applyZoomLevel(nextZoom);
    Toast.info(`Camera distance zoom: ${nextZoom.toFixed(1)}x`);
  }

  async function applyLightingFilter(mode) {
    currentLightingMode = mode;
    const lightBtn = $("#btn-camera-lighting");
    const video = document.querySelector("#scanner-root video");
    const track = State.activeVideoTrack;
    const caps = State.activeTrackCapabilities || {};

    if (mode === "auto") {
      if (lightBtn) lightBtn.innerHTML = `<span>☀️ Light: Auto</span>`;
      if (video) video.style.filter = "none";
      if (track && caps.exposureMode && caps.exposureMode.includes("continuous")) {
        try { await track.applyConstraints({ advanced: [{ exposureMode: "continuous" }] }).catch(() => {}); } catch (_) {}
      }
    } else if (mode === "boost") {
      if (lightBtn) lightBtn.innerHTML = `<span>🔆 Light: Boosted</span>`;
      if (video) video.style.filter = "brightness(1.25) contrast(1.3) saturate(1.05)";
      if (track && caps.exposureCompensation) {
        try {
          const boostVal = Math.min(caps.exposureCompensation.max || 0, (caps.exposureCompensation.step || 1) * 2);
          await track.applyConstraints({ advanced: [{ exposureCompensation: boostVal }] }).catch(() => {});
        } catch (_) {}
      }
    } else if (mode === "contrast") {
      if (lightBtn) lightBtn.innerHTML = `<span>⚡ Light: B&W Contrast</span>`;
      if (video) video.style.filter = "grayscale(1) contrast(1.9) brightness(1.2)";
    }
  }

  function toggleCameraLighting() {
    const nextMode = currentLightingMode === "auto" ? "boost" : currentLightingMode === "boost" ? "contrast" : "auto";
    applyLightingFilter(nextMode);
    Toast.info(nextMode === "auto" ? "Auto-lighting enabled" : nextMode === "boost" ? "Brightness & contrast boosted" : "High-contrast B&W active");
  }

  function applyCameraOrientation(video) {
    const target = video || document.querySelector("#scanner-root video");
    if (!target) return;
    target.style.objectFit = "cover";
    target.style.width = "100%";
    target.style.height = "100%";
    target.style.mirror = "none";
    applyZoomLevel(currentZoom);
    applyLightingFilter(currentLightingMode);
  }

  /* ---- Wellbeing: teardown ---- */
  function teardownWellbeingSurvey({ keepResumeState = false } = {}) {
    const wb = State.wellbeing;
    if (wb.autoDismissTimer) { clearTimeout(wb.autoDismissTimer); wb.autoDismissTimer = null; }
    if (wb.timerInterval) { clearInterval(wb.timerInterval); wb.timerInterval = null; }
    if (wb.startTimer) { clearTimeout(wb.startTimer); wb.startTimer = null; }
    if (wb.advanceTimer) { clearTimeout(wb.advanceTimer); wb.advanceTimer = null; }
    if (wb.handsFrameId != null) { cancelAnimationFrame(wb.handsFrameId); wb.handsFrameId = null; }
    wb.frameBusy = false;
    if (wb.hands) { try { wb.hands.close?.(); } catch (_) {} wb.hands = null; }
    if (wb.resizeObserver) { wb.resizeObserver.disconnect(); wb.resizeObserver = null; }
    if (wb.cameraStream) { wb.cameraStream.getTracks().forEach(track => track.stop()); wb.cameraStream = null; }
    if (wb.video) { try { wb.video.pause(); wb.video.srcObject = null; } catch (_) {} }
    wb.video = null; wb.canvas = null; wb.ctx = null;
    wb.active = false; wb.pending = false; wb.phase = "idle"; wb.token += 1;
    if (!keepResumeState) wb.resumeScanner = false;
    wb.studentUid = ""; wb.student = null; wb.recordId = "";
    wb.selectedEmotion = null; wb.answerInFlight = false;
    const overlay = $("#wellbeing-survey-overlay");
    overlay?.closest(".scanner-frame-wrap")?.classList.remove("is-wellbeing-active");
    if (overlay) { overlay.classList.add("hidden"); overlay.setAttribute("aria-hidden", "true"); }
    if (activeKioskGesture) {
      try { activeKioskGesture.stop(); } catch (_) {}
      activeKioskGesture = null;
    }
    const kioskOverlay = $("#emotion-overlay");
    if (kioskOverlay) {
      kioskOverlay.classList.add("hidden");
      kioskOverlay.classList.remove("flex", "is-open");
      kioskOverlay.style.display = "none";
      kioskOverlay.setAttribute("aria-hidden", "true");
    }
  }

  /* ============================================================
     KIOSK FAST 3-STEP EMOTIONAL CHECK-IN & CAMERA LIFECYCLE
     ============================================================ */

  const KIOSK_3STEP_QUESTIONS = [
    {
      step: 1,
      id: "mood",
      stepName: "Mood",
      title: "How are you feeling today?",
      subtitle: "Choose the emoji that describes your feeling right now.",
      options: [
        { key: "very_good", label: "Very good", emoji: "🤩", isNegative: false },
        { key: "good", label: "Good", emoji: "🙂", isNegative: false },
        { key: "okay", label: "Okay", emoji: "😐", isNegative: false },
        { key: "not_good", label: "Not good", emoji: "😔", isNegative: true }
      ]
    },
    {
      step: 2,
      id: "stress",
      stepName: "Stress",
      title: "How stressed do you feel today?",
      subtitle: "Check in with your stress level this morning.",
      options: [
        { key: "not_stressed", label: "Not stressed", emoji: "🎈", isNegative: false },
        { key: "a_little_stressed", label: "A little stressed", emoji: "🤏", isNegative: false },
        { key: "quite_stressed", label: "Quite stressed", emoji: "🎒", isNegative: true },
        { key: "very_stressed", label: "Very stressed", emoji: "🪨", isNegative: true }
      ]
    },
    {
      step: 3,
      id: "need",
      stepName: "Need",
      title: "What best describes what you need today?",
      subtitle: "Let your teachers know how to support you best today.",
      options: [
        { key: "encouragement", label: "Encouragement", emoji: "🫂", isNegative: false },
        { key: "rest", label: "Rest", emoji: "🛌", isNegative: false },
        { key: "someone_to_talk_to", label: "Someone to talk to", emoji: "🗣️", isNegative: true },
        { key: "time_to_focus", label: "Time to focus on myself", emoji: "🎧", isNegative: false }
      ]
    }
  ];

  /* ---- Pause Scanner & Hide Video Feed ---- */
  async function pauseQRScanner() {
    stopHighSensitivityScannerLoop();
    const scanner = State.scanner;
    try {
      // 1. Immediately shut off hardware video sensor to free device resources
      if (State.activeVideoTrack) {
        State.activeVideoTrack.enabled = false;
      }
      // 2. Hide video feed element immediately so no frozen still is visible
      const videoEl = document.querySelector("#scanner-root video");
      if (videoEl) {
        videoEl.style.opacity = "0";
      }
      // 3. Pause Html5Qrcode video processing
      if (scanner && typeof scanner.pause === "function") {
        try {
          if (scanner.getState && scanner.getState() === 2 /* SCANNING */) {
            scanner.pause(true);
          }
        } catch (_) {}
      }
      State.scanning = false;
      return true;
    } catch (e) {
      console.warn("[scanner] pause failed:", e);
    }
    return false;
  }

  /* ---- Proper Component Cleanup, Reset, Unmount & Remount ---- */
  async function resetAndRemountScanner() {
    const resetGeneration=State.generation;
    const restartCamera=State.scanning || !!State.scanner;
    console.log("[scanner] Resetting and remounting camera component for next student...");
    State.transitioning = true;
    try {
      // 1. Safely stop existing Html5Qrcode instance
      if (State.scanner) {
        try {
          if (typeof State.scanner.getState === "function" && State.scanner.getState() === 3 /* PAUSED */) {
            try { State.scanner.resume(); } catch (_) {}
          }
          await withTimeout(Promise.resolve().then(() => State.scanner.stop()), 2500).catch(() => {});
        } catch (_) {}
        try { State.scanner.clear(); } catch (_) {}
      }
    } catch (e) {
      console.warn("[scanner] Stop during reset warning:", e);
    }

    // 2. Stop and release all active MediaStreamTracks
    try {
      if (State.activeVideoTrack) {
        try { State.activeVideoTrack.stop(); } catch (_) {}
        State.activeVideoTrack = null;
      }
    } catch (_) {}

    // 3. Clean up scanner-root DOM container completely
    const scannerRoot = $("#scanner-root");
    if (scannerRoot) {
      scannerRoot.replaceChildren();
      const emptyDiv = document.createElement("div");
      emptyDiv.id = "scanner-empty";
      emptyDiv.style.cssText = "text-align:center;color:#94a3b8;";
      emptyDiv.innerHTML = `
        <div style="font-size:2.5rem;margin-bottom:8px;">📷</div>
        <strong style="display:block;font-size:1.1rem;color:#f1f5f9;">Camera Ready</strong>
        <span style="font-size:0.85rem;">Hold student ID QR code firmly inside the target guide.</span>
      `;
      scannerRoot.appendChild(emptyDiv);
    }

    // 4. Reset component state variables
    State.scanner = null;
    State.scanning = false;
    State.transitioning = false;
    State.scanInFlight = false;
    State.lastDecodedRaw = "";
    State.lastScanTs = 0;

    // 5. Reset student verification panel to idle
    const studentCard = $("#scanned-student-card");
    if (studentCard) {
      const nameEl = $("#scanned-student-name");
      const idEl = $("#scanned-student-id");
      const secEl = $("#scanned-student-section");
      const badgeEl = $("#scanned-status-badge");
      const timeInEl = $("#scanned-time-in");
      if (nameEl) nameEl.textContent = "Awaiting QR Scan";
      if (idEl) idEl.textContent = "ID: —";
      if (secEl) secEl.textContent = "Section: —";
      if (badgeEl) {
        badgeEl.className = "status-badge-lg idle";
        badgeEl.textContent = "NOT SCANNED";
      }
      if (timeInEl) timeInEl.textContent = "—";
      const photoImg = $("#scanned-photo-img");
      const avatarInit = $("#scanned-avatar-initials");
      if (photoImg) photoImg.classList.add("hidden");
      if (avatarInit) {
        avatarInit.classList.remove("hidden");
        avatarInit.textContent = "ID";
      }
    }

    // 6. Remount and start a clean camera session
    await wait(150);
    if (!restartCamera || !State.teacher || resetGeneration !== State.generation) return;
    try {
      await startScanner();
      console.log("[scanner] Camera remounted and ready for next student.");
    } catch (err) {
      console.error("[scanner] Remount failed:", err);
      setScannerState("off", "Camera ready. Click Start Camera to scan.");
    }
  }

  /* ---- Backward-compatible resumeQRScanner delegator ---- */
  async function resumeQRScanner() {
    await resetAndRemountScanner();
  }

  function surveyIsCurrent(token) {
    return State.wellbeing.active && State.wellbeing.token === token;
  }

  // Hand landmark detection helper for backwards compatibility and tests
  function detectGestureFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const thumbMcp = landmarks[2];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    const indexExtended = indexTip.y < indexPip.y;
    const middleExtended = middleTip.y < middlePip.y;
    const ringExtended = ringTip.y < ringPip.y;
    const pinkyExtended = pinkyTip.y < pinkyPip.y;

    const fingersFolded = !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
    const thumbPointingUp = thumbTip.y < thumbIp.y && thumbIp.y < thumbMcp.y && thumbTip.y < wrist.y;
    const thumbPointingDown = thumbTip.y > thumbIp.y && thumbTip.y > wrist.y;

    if (thumbPointingUp && fingersFolded) return { emotion: "happy", label: "Happy", emoji: "👍" };
    if (thumbPointingDown && fingersFolded) return { emotion: "stressed", label: "Stressed / Tired", emoji: "👎" };
    if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) return { emotion: "calm", label: "Calm", emoji: "✌️" };
    if (indexExtended && middleExtended && ringExtended && pinkyExtended) return { emotion: "excited", label: "Excited", emoji: "✋" };
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) return { emotion: "content", label: "Ready", emoji: "☝️" };
    return null;
  }

  /* ---- Fast 3-Step Emotional Check UI Entry Point ---- */
  let _isKiosk3StepSaving = false;
  async function finish3StepEmotionalCheck(student, answers, record = {}) {
    if (_isKiosk3StepSaving) return;
    _isKiosk3StepSaving = true;
    const today = Utils.todayIso();
    const payload = {
      student_uid:student.uid, student_name:`${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student',
      student_id:student.student_id || '',section:student.section || State.section || '',date:today,
      mood:answers.mood || null, stress:answers.stress || null, need:answers.need || null,
      mood_key:answers.mood_key || null,stress_key:answers.stress_key || null,need_key:answers.need_key || null,
      is_negative:!!(answers.mood_negative || answers.stress_negative || answers.need_negative),
      recorded_via:'attendance_3step',recorded_at:firebase.firestore.FieldValue.serverTimestamp(),recorded_by:State.teacher?.uid || ''
    };
    try {
      if (!navigator.onLine) throw new Error('Reconnect to save your answers.');
      const batch=ClassCare.getFirebase().db.batch();
      const id=ClassCare.DB.attendanceDocId(student.uid,today);
      batch.set(ClassCare.DB.attendance.doc(id),{mood:payload.mood,stress:payload.stress,need:payload.need,is_negative:payload.is_negative,checkin_skipped:false,emotion_checkin_3step:payload},{merge:true});
      batch.set(ClassCare.DB.emotional_checkins.doc(id+'_3step'),payload,{merge:true});
      if(answers.need_key==='someone_to_talk_to') {
        batch.set(ClassCare.DB.talkToSomeone.doc(id+'_3step'),{
          student_uid:student.uid,student_name:payload.student_name,student_id:payload.student_id,section:payload.section,date:today,
          submitted_at:firebase.firestore.FieldValue.serverTimestamp(),status:'Not Solved',
          concern_type:'Emotional / Someone to talk to',message:'Student requested someone to talk to during the optional check-in.',
          source:'attendance_kiosk',teacher_uid:State.teacher?.uid || '',is_concern:true
        },{merge:true});
      }
      await batch.commit();
    } catch(error) {
      Toast.error('Check-in not saved: '+error.message);
      const grid=$('#kiosk-choices-grid');
      if(grid) {
        grid.replaceChildren();
        const retry=document.createElement('button');retry.type='button';retry.className='btn btn-primary';retry.textContent='Retry saving these answers';
        retry.onclick=()=>finish3StepEmotionalCheck(student,answers,record);grid.append(retry);
      }
      return;
    } finally { _isKiosk3StepSaving=false; }

    // Real-time broadcast sync across tabs
    try {
      if (window.BroadcastChannel) {
        const bc = new BroadcastChannel("classcare_attendance_sync");
        bc.postMessage({
          type: "attendance_update",
          student_uid: student.uid,
          date: today,
          record: { ...(record || {}), ...payload, status: record?.status || "Present", time_in: record?.time_in || Utils.nowHhMm() }
        });
        bc.close();
      }
    } catch (_) {}

    const overlay = $("#emotion-overlay");
    const qWrap = $("#kiosk-question-wrap");
    const successScreen = $("#kiosk-success-screen");
    const gestureBar = $("#kiosk-gesture-bar");
    if (gestureBar) gestureBar.style.display = "none";
    if (qWrap) qWrap.classList.add("hidden");
    if (successScreen) {
      successScreen.classList.remove("hidden");
      const successName = $("#kiosk-success-student-name");
      if (successName) successName.textContent = student.first_name || 'Student';
    }
    SoundFeedback.play("success");
    await wait(2000);

    if (overlay) {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex", "is-open");
      overlay.style.display = "none";
    }
    if (successScreen) successScreen.classList.add("hidden");
    if (qWrap) qWrap.classList.remove("hidden");
    if (gestureBar) gestureBar.style.display = "flex";

    await resetAndRemountScanner();
  }

  let activeKioskGesture = null;

  async function skipWellbeingSurvey() {
    if (activeKioskGesture) {
      activeKioskGesture.stop();
      activeKioskGesture = null;
    }
    const overlay = $("#emotion-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex", "is-open");
      overlay.style.display = "none";
    }
    await resetAndRemountScanner();
  }

  async function startWellbeingSurvey(student, record = {}) {
    const overlay = $("#emotion-overlay");
    if (!overlay) {
      await resetAndRemountScanner();
      return;
    }
    await pauseQRScanner();
    overlay.classList.remove("hidden");
    overlay.classList.add("flex", "is-open");
    overlay.style.display = "flex";
    const qWrap = $("#kiosk-question-wrap");
    const successScreen = $("#kiosk-success-screen");
    const gestureBar = $("#kiosk-gesture-bar");
    if (successScreen) successScreen.classList.add("hidden");
    if (qWrap) qWrap.classList.remove("hidden");
    if (gestureBar) gestureBar.style.display = "flex";

    const sName = $("#kiosk-student-name");
    if (sName) sName.textContent = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';

    let currentStep = 0;
    const collectedAnswers = {};

    // Auto-mount and initialize Hand Gesture camera immediately without user click
    if (activeKioskGesture) {
      activeKioskGesture.stop();
      activeKioskGesture = null;
    }
    const gestureVideo = $("#scanner-gesture-video");
    if (gestureVideo && window.ClassCareGestureCamera) {
      activeKioskGesture = new ClassCareGestureCamera(
        gestureVideo,
        choiceIndex => {
          // Automatic selection via hand gesture dwell
          const btns = document.querySelectorAll("#kiosk-choices-grid .kiosk-choice-btn");
          if (btns && btns[choiceIndex]) {
            btns[choiceIndex].click();
          }
        },
        statusText => {
          const st = $("#scanner-gesture-status");
          if (st) st.textContent = statusText;
        },
        (count, progress) => {
          const pr = $("#scanner-gesture-progress");
          if (pr) pr.value = progress;
          document.querySelectorAll("#kiosk-choices-grid .kiosk-choice-btn").forEach((btn, idx) => {
            btn.classList.toggle("ring-2", idx === count - 1 && progress > 0);
            btn.classList.toggle("ring-indigo-500", idx === count - 1 && progress > 0);
          });
        }
      );
      activeKioskGesture.start().catch(err => {
        console.warn("[scanner] auto gesture camera start:", err);
        const st = $("#scanner-gesture-status");
        if (st) st.textContent = "Tap a card below to answer";
      });
    }

    function renderStep() {
      const q = KIOSK_3STEP_QUESTIONS[currentStep];
      if (!q) {
        if (activeKioskGesture) {
          activeKioskGesture.stop();
          activeKioskGesture = null;
        }
        return finish3StepEmotionalCheck(student, collectedAnswers, record);
      }
      const titleEl = $("#kiosk-step-title");
      const descEl = $("#kiosk-step-desc");
      const stepBadge = $("#kiosk-step-indicator");
      const grid = $("#kiosk-choices-grid");
      if (titleEl) titleEl.textContent = q.title;
      if (descEl) descEl.textContent = q.subtitle;
      if (stepBadge) stepBadge.textContent = `Step ${q.step} of 3: ${q.stepName}`;
      if (grid) {
        grid.innerHTML = q.options.map((opt, optIndex) => `
          <button type="button" class="btn btn-secondary kiosk-choice-btn ${opt.isNegative ? 'choice-negative' : ''}" data-choice-key="${opt.key}" data-choice-label="${opt.label}" data-choice-emoji="${opt.emoji}" data-choice-neg="${opt.isNegative}" style="position:relative;border-radius:18px;padding:16px;text-align:center;">
            <span style="position:absolute;top:8px;left:12px;font-size:0.75rem;font-weight:800;color:var(--text-muted);">${optIndex + 1}</span>
            <span class="choice-emoji" style="font-size:2.2rem;display:block;margin-bottom:6px;">${opt.emoji}</span>
            <strong style="display:block;font-size:1.02rem;">${opt.label}</strong>
          </button>
        `).join("");
        grid.querySelectorAll(".kiosk-choice-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            if (_isKiosk3StepSaving) return;
            grid.querySelectorAll(".kiosk-choice-btn").forEach(b => b.disabled = true);
            SoundFeedback.play("tap");
            activeKioskGesture?.lock();
            const key = btn.dataset.choiceKey;
            const label = btn.dataset.choiceLabel;
            const emoji = btn.dataset.choiceEmoji;
            const isNeg = btn.dataset.choiceNeg === "true";
            if (q.id === "mood") {
              collectedAnswers.mood = label;
              collectedAnswers.mood_key = key;
              collectedAnswers.mood_emoji = emoji;
              collectedAnswers.mood_negative = isNeg;
            } else if (q.id === "stress") {
              collectedAnswers.stress = label;
              collectedAnswers.stress_key = key;
              collectedAnswers.stress_emoji = emoji;
              collectedAnswers.stress_negative = isNeg;
            } else if (q.id === "need") {
              collectedAnswers.need = label;
              collectedAnswers.need_key = key;
              collectedAnswers.need_emoji = emoji;
              collectedAnswers.need_negative = isNeg;
            }
            currentStep += 1;
            renderStep();
          });
        });
      }
    }
    renderStep();
  }

  async function verifyStudentBelongsToTeacher(student, teacher) {
    return ClassCareKioskData.canScan(teacher, student);
  }

  async function handleDecodedText(raw) {
    clearTimeout(State.resetTimer);
    let student;
    try {
      student = await ClassCareKioskData.lookup(raw, State.teacher);
    } catch (error) {
      showResultError('Cannot scan student', error.message);
      SoundFeedback.play("error");
      return;
    }

    // Valid student found: pause camera feed for attendance recording / survey
    pauseQRScanner().catch(() => {});

    const overlay = $("#emotion-overlay");
    if (overlay) {
      try {
        const result = await ClassCareKioskData.saveAttendance(student,State.teacher,null,State.settings,getActiveTeacherAssignment());
        const rec = result.record;
        State.attendance.set(student.uid,rec);
        showResult(student,result.kind === 'time_out' ? 'Time Out' : rec.status,rec.time_in,rec.minutes_late || 0,result.kind === 'duplicate' ? 'duplicate' : 'saved',rec);
        if (result.kind === 'saved') await startWellbeingSurvey(student,rec);
        else { Toast.info(result.kind === 'time_out' ? 'Time out recorded.' : 'Attendance already recorded today.'); State.resetTimer=setTimeout(() => {void resetAndRemountScanner();},2500); }
      } catch (error) {
        showResultError('Attendance not saved',error.message + ' Retry the scan.');
        Toast.error('Attendance not saved. Reconnect and retry.');
        await resumeQRScanner();
      }
    } else {
      State.wellbeing.active = true;
      try {
        const result = await ClassCareKioskData.fastMood(student, State.teacher, State.settings, getActiveTeacherAssignment());
        if (result) {
          const record = result.record;
          State.attendance.set(student.uid, record);
          renderAttendanceTable(); renderStats(); updateChooser();
          showResult(student, record.status, record.time_in, record.minutes_late || 0, result.kind === 'duplicate' ? 'duplicate' : 'saved', record);
          Toast.success(result.kind === 'duplicate' ? 'Attendance already recorded.' : result.kind === 'time_out' ? 'Time out saved.' : record.checkin_skipped ? 'Attendance saved; check-in skipped.' : 'Attendance and mood saved.');
          SoundFeedback.play("success");
        }
      } finally {
        State.wellbeing.active = false; State.scanInFlight = false;
        await resumeQRScanner();
      }
    }
  }

  async function lookupStudent(uid) {
    try {
      const snapshot = await ClassCare.DB.users.doc(uid).get();
      if (!snapshot.exists) return null;
      return studentFromDoc(snapshot);
    } catch (_) {
      return null;
    }
  }

  function showResult(student, status, timeIn, minutesLate, kind = "saved", record = {}) {
    currentScanKey = `${student.uid || ""}_${timeIn}`;
    const line = $("#scan-status-strip");
    const icon = $("#scan-emoji");
    const label = $("#scan-status-label");
    const sub = $("#scan-status-sub");
    const isPresent = String(status).toLowerCase() === "present";
    const isLate = String(status).toLowerCase() === "late";
    const isTimeOut = String(status).toLowerCase() === "time out";

    if (line) line.className = `scan-status-line status-${isPresent ? "present" : isLate ? "late" : isTimeOut ? "present" : "error"}`;
    if (icon) icon.replaceChildren(document.createTextNode(isPresent || isTimeOut ? "✓" : isLate ? "!" : "i"));
    if (label) label.textContent = kind === "duplicate" ? "Already recorded" : status;

    const quotaInfo = record?.quota_source ? ` [${record.quota_source}]` : "";
    if (sub) {
      sub.textContent = kind === "duplicate"
        ? `Already recorded at ${timeIn}.`
        : kind === "queued"
        ? "Saved locally and waiting to sync."
        : isTimeOut
        ? `Time Out recorded at ${timeIn}.${quotaInfo}`
        : `Attendance recorded.${quotaInfo}`;
    }

    setStudentResult(student);
    if ($("#scan-time")) $("#scan-time").textContent = timeIn || "—";
    if ($("#scan-late-by")) {
      $("#scan-late-by").textContent = isTimeOut
        ? "Departure logged"
        : status === "Late" && minutesLate
        ? `Late by ${minutesLate} minutes`
        : kind === "duplicate"
        ? "No new record created"
        : "Within expected arrival window";
    }
    const alert = $("#scan-alert-row");
    if (alert) alert.className = `scan-alert ${kind === "queued" ? "alert-warning" : ""}`;
    if ($("#scan-alert-text")) {
      $("#scan-alert-text").textContent = kind === "queued"
        ? "Waiting to sync. Parent alert will be attempted when connected."
        : kind === "duplicate"
        ? "No parent alert sent for a duplicate scan."
        : "Parent alert status will appear here.";
    }
    if (kind === "duplicate") {
      $("#scan-alert-icon")?.replaceChildren(document.createTextNode("i"));
      if (alert) alert.className = "scan-alert";
      if ($("#scan-alert-text")) $("#scan-alert-text").textContent = "Attendance already recorded. Parent alert delivery is being retried.";
    }

    // --- Synchronize Dedicated Kiosk Side Panel (scanner.html) ---
    const studentFullName = `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.name || "Student";
    const kName = $("#scanned-student-name");
    if (kName) kName.textContent = studentFullName;
    const kId = $("#scanned-student-id");
    if (kId) kId.textContent = student.student_id ? `ID: ${student.student_id}` : "ID: —";
    const kSec = $("#scanned-student-section");
    if (kSec) kSec.textContent = student.section ? `Section: ${student.section}` : "Section: —";
    const kBadge = $("#scanned-status-badge");
    if (kBadge) {
      kBadge.textContent = (kind === "duplicate" ? "ALREADY RECORDED" : status).toUpperCase();
      kBadge.className = `status-badge-lg ${isPresent || isTimeOut ? "present" : isLate ? "late" : "idle"}`;
    }
    const kTime = $("#scanned-time-in");
    if (kTime) kTime.textContent = timeIn || Utils.nowHhMm();
    const kNote = $("#scanned-arrival-note");
    if (kNote) {
      kNote.textContent = isTimeOut
        ? "Time Out logged"
        : status === "Late" && minutesLate
        ? `Late by ${minutesLate}m`
        : kind === "duplicate"
        ? "Duplicate scan"
        : "On-time arrival";
    }
    const kParent = $("#scanned-parent-text");
    if (kParent) {
      kParent.textContent = "Dispatching parent attendance notification...";
    }
    const kImg = $("#scanned-photo-img");
    const kInit = $("#scanned-avatar-initials");
    if (student.photo_data) {
      if (kImg) { kImg.src = student.photo_data; kImg.classList.remove("hidden"); }
      if (kInit) kInit.classList.add("hidden");
    } else {
      if (kImg) kImg.classList.add("hidden");
      if (kInit) { kInit.textContent = initialsOf(student); kInit.classList.remove("hidden"); }
    }
    const kCount = $("#kiosk-session-count");
    if (kCount) {
      const current = parseInt(kCount.textContent, 10) || 0;
      kCount.textContent = `${kind === "duplicate" ? current : current + 1} Recorded`;
    }

    if (record?.status) renderAttendanceTable();

    // Send parent email alert on initial record AND re-scans/duplicates
    if (kind === "saved" || kind === "duplicate") {
      void fireTelegramAlert(student, status, {
        date: record?.date || Utils.todayIso(),
        time_in: timeIn || record?.time_in || Utils.nowHhMm(),
        time_out: isTimeOut ? (timeIn || record?.time_out || "") : (record?.time_out || "")
      });
    }
  }
  function setStudentResult(student) {
    const avatar = $("#scan-avatar");
    if (avatar) {
      avatar.replaceChildren();
      if (student.photo_data) {
        const image = document.createElement("img");
        image.src = student.photo_data;
        image.alt = `${student.first_name || "Student"} photo`;
        avatar.appendChild(image);
      } else {
        avatar.appendChild(document.createTextNode(initialsOf(student)));
      }
    }
    if ($("#scan-name")) $("#scan-name").textContent = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
    if ($("#scan-id")) $("#scan-id").textContent = `Student ID ${student.student_id || "—"}`;
    if ($("#scan-section")) $("#scan-section").textContent = `Section ${student.section || "—"}`;
  }
  function showResultError(title, message, student = null, sound = "error") {
    if (sound) SoundFeedback.play(sound);
    teardownWellbeingSurvey();
    const line = $("#scan-status-strip");
    if (line) line.className = "scan-status-line status-error";
    $("#scan-emoji")?.replaceChildren(document.createTextNode("!"));
    if ($("#scan-status-label")) $("#scan-status-label").textContent = title;
    if ($("#scan-status-sub")) $("#scan-status-sub").textContent = message;
    if (student) {
      setStudentResult(student);
    } else {
      if ($("#scan-name")) $("#scan-name").textContent = "No attendance recorded";
      if ($("#scan-id")) $("#scan-id").textContent = "Student ID —";
      if ($("#scan-section")) $("#scan-section").textContent = "Section —";
    }
    if ($("#scan-time")) $("#scan-time").textContent = Utils.nowHhMm();
    if ($("#scan-late-by")) $("#scan-late-by").textContent = student ? "Not in your class roster" : "Try another code";
    const alert = $("#scan-alert-row");
    if (alert) alert.className = "scan-alert alert-warning";
    if ($("#scan-alert-text")) $("#scan-alert-text").textContent = "No attendance record was created.";

    // Update Kiosk error state
    const kName = $("#scanned-student-name");
    if (kName) kName.textContent = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : title;
    const kBadge = $("#scanned-status-badge");
    if (kBadge) {
      kBadge.textContent = "INVALID / ERROR";
      kBadge.className = "status-badge-lg error";
    }
    const kNote = $("#scanned-arrival-note");
    if (kNote) kNote.textContent = message;
    const kParent = $("#scanned-parent-text");
    if (kParent) kParent.textContent = "No attendance recorded. Parent alert skipped.";

    setTimeout(() => {
      State.scanInFlight = false;
      resumeQRScanner();
    }, 1800);
  }
  async function fireTelegramAlert(student, status, meta) {
    if (!window.TelegramAlert) return;
    const email = await Promise.resolve(TelegramAlert.sendEmailAttendanceAlert ? TelegramAlert.sendEmailAttendanceAlert(student, status, meta) : { ok: false, queued: false, reason: "not-configured" }).catch(error => ({ ok: false, queued: false, reason: "request-failed", error }));
    const telegram = email.ok ? { ok: false, queued: false, reason: "skipped" } : await TelegramAlert.sendAttendanceAlert(student, status, meta).catch(error => ({ ok: false, queued: false, reason: "request-failed", error }));

    const sName = `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "Student";
    if (email.ok) {
      Toast?.success(`✅ Parent email sent to ${email.recipient || "parent"}`);
    } else if (email.reason === "no-email") {
      Toast?.warn(`⚠️ Walang parent email na naka-save para kay ${sName}. Paki-update sa Student Profile o Admin.`);
    } else if (email.reason === "request-failed") {
      Toast?.error(`⚠️ EmailJS error: ${email.error?.text || email.error?.message || "Could not send email"}`);
    }

    const alert = $("#scan-alert-row"); const text = $("#scan-alert-text");
    const kParent = $("#scanned-parent-text");
    if (email.ok) {
      if (alert) alert.className = "scan-alert alert-success";
      if (text) text.textContent = `Parent alert sent to ${email.recipient}.`;
      if (kParent) kParent.textContent = `Parent alert delivered to ${email.recipient}`;
    } else if (email.reason === "no-email") {
      if (alert) alert.className = "scan-alert alert-warning";
      if (text) text.textContent = `No parent email configured for ${sName}.`;
      if (kParent) kParent.textContent = `⚠️ No parent email on file. Update in student profile.`;
    } else if (telegram.ok) {
      if (alert) alert.className = "scan-alert alert-warning";
      if (text) text.textContent = "Email skipped/failed; parent alert sent by Telegram.";
      if (kParent) kParent.textContent = "Parent alert delivered via Telegram.";
    } else {
      if (alert) alert.className = "scan-alert alert-warning";
      if (text) text.textContent = email.reason === "no-email" ? "No parent email is configured." : "Parent email delivery failed. Check EmailJS settings.";
      if (kParent) kParent.textContent = email.reason === "no-email" ? "No parent email on student file." : "Parent email delivery attempted.";
    }
  }
  function updateChooser() { window.dispatchEvent(new CustomEvent("classcare:roster-updated", { detail: { students: studentsPresent() } })); }

  // ---------- Reference UI Interactive Controller (Dynamic Firestore Binding) ----------
  let _referenceHeroSelectedUid = null;

  async function renderDynamicReferenceHero() {
    const carousel = $("#reference-student-carousel");
    if (!carousel) return;

    const list = studentsFiltered();
    const students = list.length ? list : Array.from(State.students.values());

    if (!students.length) {
      carousel.innerHTML = `
        <div class="student-pill-card" style="flex:1;cursor:default;">
          <div class="student-pill-avatar avatar-blue">?</div>
          <div>
            <div class="student-pill-name">No students loaded</div>
            <div class="student-pill-meta">Waiting for enrolled student roster…</div>
          </div>
        </div>
      `;
      const countEl = $("#workspace-student-count");
      if (countEl) countEl.textContent = "0";
      const footerCountEl = $("#workspace-footer-count");
      if (footerCountEl) footerCountEl.textContent = "0 enrolled students";

      const titleEl = $("#record-card-title");
      if (titleEl) titleEl.textContent = "Student records overview";
      const attEl = $("#metric-attendance-text");
      if (attEl) attEl.textContent = "Waiting for student check-in…";
      return;
    }

    // Dynamic Overview Left Panel Count Synchronization
    const countEl = $("#workspace-student-count");
    if (countEl) countEl.textContent = String(students.length);
    const footerCountEl = $("#workspace-footer-count");
    if (footerCountEl) footerCountEl.textContent = `${students.length} enrolled student${students.length === 1 ? "" : "s"}`;

    const rosterStudents = students;
    const avatarClasses = ["avatar-blue", "avatar-mint", "avatar-sky"];

    if (!_referenceHeroSelectedUid || !rosterStudents.some(s => s.uid === _referenceHeroSelectedUid)) {
      _referenceHeroSelectedUid = rosterStudents[0].uid;
    }

    const cardsHtml = rosterStudents.map((student, idx) => {
      const isSelected = student.uid === _referenceHeroSelectedUid;
      const initials = initialsOf(student) || "ST";
      const name = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
      const avatarClass = avatarClasses[idx % avatarClasses.length];

      const record = State.attendance.get(student.uid);
      const attStatus = record?.status || "Not recorded";
      const emoInfo = State.intervention.emotionCache.get(student.uid);
      const gradeInfo = State.intervention.gradeCache.get(student.uid);

      let metaText = attStatus;
      if (gradeInfo?.average != null) {
        metaText += ` • ${Math.round(gradeInfo.average)}%`;
      }
      if (emoInfo?.label) {
        metaText += ` • ${emoInfo.label}`;
      }

      return `
        <div class="student-pill-card ${isSelected ? 'is-selected' : ''}" data-student-uid="${escapeAttr(student.uid)}" role="button" tabindex="0">
          <div class="student-pill-avatar ${avatarClass}">${escapeHtml(initials)}</div>
          <div>
            <div class="student-pill-name">${escapeHtml(name)}</div>
            <div class="student-pill-meta">${escapeHtml(metaText)}</div>
          </div>
        </div>
      `;
    }).join("");

    carousel.innerHTML = cardsHtml;

    carousel.querySelectorAll(".student-pill-card[data-student-uid]").forEach(card => {
      card.addEventListener("click", () => {
        const uid = card.getAttribute("data-student-uid");
        _referenceHeroSelectedUid = uid;
        carousel.querySelectorAll(".student-pill-card").forEach(c => {
          c.classList.toggle("is-selected", c === card);
        });
        const selectedStudent = State.students.get(uid);
        if (selectedStudent) {
          updateRecordOverviewCard(selectedStudent);
        }
      });
    });

    const activeStudent = State.students.get(_referenceHeroSelectedUid) || rosterStudents[0];
    if (activeStudent) {
      updateRecordOverviewCard(activeStudent);
    }
  }

  async function updateRecordOverviewCard(student) {
    if (!student) return;
    const uid = student.uid;
    const name = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
    const firstName = student.first_name || name.split(" ")[0] || "Student";

    const titleEl = $("#record-card-title");
    if (titleEl) titleEl.textContent = `Looking at ${firstName}’s recent records`;

    const dateRangeEl = $("#record-card-date");
    if (dateRangeEl) {
      const now = new Date();
      dateRangeEl.textContent = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    const avatarEl = $("#record-student-avatar");
    if (avatarEl) {
      if (student.photo_data) {
        avatarEl.innerHTML = `<img src="${Utils.escapeAttr(student.photo_data)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else {
        avatarEl.textContent = initialsOf(student);
      }
    }
    const subtitleEl = $("#record-student-subtitle");
    if (subtitleEl) {
      subtitleEl.textContent = `ID: ${student.student_id || "—"} • Section: ${student.section || "—"}`;
    }

    const data = State.holisticData || {};
    const recent = records => records.slice().sort((a,b) => String(b.assessmentDate || b.date).localeCompare(String(a.assessmentDate || a.date)) || ((b.updatedAt?.seconds || b.created_at?.seconds || b.submitted_at?.seconds || 0)-(a.updatedAt?.seconds || a.created_at?.seconds || a.submitted_at?.seconds || 0)));
    
    // Attendance records with prioritized today's real-time check-in
    const todayAtt = State.attendance.get(uid);
    const attList = (data.attendance || []).filter(r => r.student_uid === uid && (!todayAtt || r.date !== todayAtt.date));
    if (todayAtt) {
      attList.unshift(todayAtt);
    }
    const attendance = recent(attList);

    // Score records
    const scList = (data.scores || []).filter(r => r.studentId === uid);
    const cachedGrade = State.intervention?.gradeCache?.get(uid);
    if (cachedGrade && !scList.length) {
      scList.push({
        score: cachedGrade.score,
        maxScore: cachedGrade.maxScore || 100,
        subject: cachedGrade.subject || "Subject",
        assessmentDate: cachedGrade.date || Utils.todayIso()
      });
    }
    const scores = recent(scList);

    // Checks / emotion records
    const chkList = (data.checks || []).filter(r => r.student_uid === uid);
    (TeacherCareState?.recentCheckins || []).forEach(rc => {
      if (rc.student_uid === uid && !chkList.some(c => c.id === rc.id || (c.date === rc.date && c.time === rc.time))) {
        chkList.push(rc);
      }
    });
    const checks = recent(chkList);

    const put = (id,text) => { const el = document.getElementById(id); if(el) el.textContent=text; };
    put('col-earlier-date',attendance[1]?.date || '—'); put('col-latest-date',todayAtt?.date || attendance[0]?.date || '—');
    put('metric-att-earlier', attendance[1] ? attendance[1].status+' · '+(attendance[1].time_in || '—') : 'Not recorded');
    put('metric-attendance-text', todayAtt ? (todayAtt.status + ' · ' + (todayAtt.time_in || '—')) : (attendance[0] ? attendance[0].status+' · '+(attendance[0].time_in || '—') : 'Not recorded'));
    ['late','early'].forEach((side,i) => {
      const score=scores[i], check=checks[i];
      put('metric-score-'+side,score ? ClassCareHolistic.percent(score.score,score.maxScore)?.toFixed(1) || '—' : '—');
      put('metric-score-'+side+'-meta',score ? score.subject+' · '+score.assessmentDate+' ('+score.score+'/'+score.maxScore+')' : 'Not recorded');
      put('metric-support-'+side,check ? (check.emotion_label || check.emotion)+' · '+check.date : 'Not recorded');
    });

    const btnAction = $("#btn-review-records-action");
    if (btnAction) {
      btnAction.textContent = `Review ${firstName}’s records`;
      btnAction.onclick = () => openStudentEmotionTimelineModal(uid);
    }

    const attCard = document.querySelector(".pastel-data-card.card-green");
    if (attCard) {
      attCard.style.cursor = "pointer";
      attCard.title = `Click to view ${firstName}’s attendance in table`;
      attCard.onclick = () => {
        window.location.hash = "#teacher-attendance";
        setTimeout(() => {
          const row = document.querySelector(`tr[data-intervention-row="${escapeAttr(uid)}"]`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.style.outline = "2px solid #0A4479";
            setTimeout(() => { row.style.outline = ""; }, 2500);
          }
        }, 300);
      };
    }

    const scoreCard = document.querySelector(".pastel-data-card.card-yellow");
    if (scoreCard) {
      scoreCard.style.cursor = "pointer";
      scoreCard.title = `Click to view scores in grading tab`;
      scoreCard.onclick = () => {
        window.location.hash = "#teacher-grades";
      };
    }

    const voluntaryCard = document.querySelector(".pastel-data-card.card-blue");
    if (voluntaryCard) {
      voluntaryCard.style.cursor = "pointer";
      voluntaryCard.title = `Click to view ${firstName}’s emotional timeline`;
      voluntaryCard.onclick = () => openStudentEmotionTimelineModal(uid);
    }
  }

  async function openStudentEmotionTimelineModal(studentUid) {
    if (!studentUid) return;
    const modal = $("#student-emotion-timeline-modal");
    const body = $("#emotion-timeline-body");
    if (!modal || !body) return;

    modal.classList.remove("hidden");
    modal.classList.add("flex", "is-open");
    modal.style.display = "flex";
    body.innerHTML = `<div class="state-panel state-loading"><strong>Loading student emotional history…</strong><span>Retrieving traceable mood check-in records.</span></div>`;

    let student = State.students.get(studentUid);
    if (!student) {
      try {
        const snap = await ClassCare.DB.users.doc(studentUid).get();
        if (snap.exists) student = studentFromDoc(snap);
      } catch (_) {}
    }
    const studentName = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.name || "Student" : "Student";
    const studentSec = student?.section || State.section || "—";
    const studentId = student?.student_id || "—";
    const avatar = student?.photo_data
      ? `<img src="${Utils.escapeAttr(student.photo_data)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" />`
      : `<div style="width:48px;height:48px;border-radius:50%;background:#dbeafe;color:#1e40af;display:flex;align-items:center;justify-content:center;font-weight:750;font-size:1.1rem;">${Utils.escapeHtml(initialsOf(student || {}))}</div>`;

    function closeModal() {
      if (_unsubTimelineModal) {
        try { _unsubTimelineModal(); } catch (_) {}
        _unsubTimelineModal = null;
      }
      modal.classList.add("hidden");
      modal.classList.remove("flex", "is-open");
      modal.style.display = "none";
    }

    // Attach close listener immediately to header close button and backdrop
    modal.querySelectorAll("[data-close-emotion-timeline]").forEach(btn => {
      btn.onclick = closeModal;
    });
    window.closeStudentEmotionTimelineModal = closeModal;

    function renderTimelineContent(checkins) {
      // If no standalone emotional_checkin documents, also check holistic attendance for kiosk arrivals
      if (!checkins.length && State.holisticData) {
        const attRecords = (State.holisticData.attendance || []).filter(a => a.student_uid === studentUid && (a.mood || a.emotion_checkin_3step));
        attRecords.forEach(att => {
          checkins.push({
            student_uid: att.student_uid,
            date: att.date,
            time: att.time_in,
            emotion: att.mood_key || att.mood || "calm",
            emotion_label: att.mood || "Checked in",
            emotion_emoji: att.emotion_checkin_3step?.mood_emoji || "🙂",
            is_negative: !!(att.emotion_checkin_3step?.mood_negative || String(att.mood || "").toLowerCase().includes("not good")),
            recorded_via: "qr_scanner"
          });
        });
      }

      const total = checkins.length;
      let posCount = 0;
      let negCount = 0;
      const moodCounts = {};

      checkins.forEach(c => {
        const emoKey = String(c.emotion || "").toLowerCase();
        const isNeg = c.is_negative === true || ["tired", "stressed", "anxious", "sad", "angry", "scared", "lonely"].includes(emoKey);
        if (isNeg) negCount++; else posCount++;
        const label = c.emotion_label || c.emotion || "Calm";
        moodCounts[label] = (moodCounts[label] || 0) + 1;
      });

      let topMood = "—";
      let topMoodCount = 0;
      Object.entries(moodCounts).forEach(([m, cnt]) => {
        if (cnt > topMoodCount) { topMood = m; topMoodCount = cnt; }
      });
      const posPct = total ? Math.round((posCount / total) * 100) : 100;

      body.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;background:var(--bg-muted);padding:14px 18px;border-radius:12px;border:1px solid var(--border);">
          ${avatar}
          <div style="flex:1;">
            <div style="font-size:1.15rem;font-weight:750;color:var(--text-primary);">${Utils.escapeHtml(studentName)}</div>
            <div style="font-size:0.82rem;color:var(--text-muted);display:flex;gap:12px;margin-top:2px;">
              <span>Student ID: <strong class="tabular">${Utils.escapeHtml(studentId)}</strong></span>
              <span>Section: <strong>${Utils.escapeHtml(studentSec)}</strong></span>
            </div>
          </div>
          <span class="status-badge ${posPct >= 70 ? 'status-present' : 'status-late'}">${posPct}% Positive</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-top:12px;">
          <div style="background:var(--panel-muted);padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);text-align:center;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Total Check-ins</div>
            <div style="font-size:1.35rem;font-weight:800;color:var(--text-primary);margin-top:2px;" class="tabular">${total}</div>
          </div>
          <div style="background:var(--panel-muted);padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);text-align:center;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Frequent Mood</div>
            <div style="font-size:1.05rem;font-weight:750;color:var(--text-primary);margin-top:2px;">${Utils.escapeHtml(topMood)}</div>
          </div>
          <div style="background:var(--panel-muted);padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);text-align:center;">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Distress Flags</div>
            <div style="font-size:1.35rem;font-weight:800;color:${negCount > 0 ? '#dc2626' : 'var(--text-primary)'};margin-top:2px;" class="tabular">${negCount}</div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <h4 style="font-size:0.92rem;font-weight:750;margin:0 0 10px;color:var(--text-secondary);display:flex;align-items:center;justify-content:space-between;">
            <span>Chronological Check-in History (Live Sync)</span>
            <span style="font-size:0.78rem;font-weight:500;color:var(--text-muted);">Newest First</span>
          </h4>

          ${!checkins.length ? `
            <div class="state-panel state-empty" style="text-align:center;padding:24px;background:var(--bg-muted);border-radius:12px;">
              <strong>No emotional check-ins recorded yet</strong>
              <p style="margin:4px 0 0;font-size:0.85rem;color:var(--text-muted);">Check-ins completed via Kiosk arrival or the Student Portal will appear here.</p>
            </div>
          ` : `
            <div style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding-right:4px;">
              ${checkins.map(c => {
                const dateStr = c.date || (c.created_at?.toDate ? c.created_at.toDate().toISOString().slice(0, 10) : "—");
                const timeStr = c.created_at?.toDate ? c.created_at.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (c.time || "");
                const isNeg = c.is_negative === true || ["tired", "stressed", "anxious", "sad", "angry", "scared", "lonely"].includes(String(c.emotion || "").toLowerCase());
                const emoji = c.emotion_emoji || (isNeg ? "😰" : "😊");
                const label = c.emotion_label || c.emotion || "Mood check";
                const source = c.recorded_via === "qr_scanner" ? "📷 Kiosk Arrival" : "💻 Student Portal";

                return `
                  <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-card);border:1px solid ${isNeg ? '#fecaca' : 'var(--border-subtle)'};border-left:4px solid ${isNeg ? '#dc2626' : '#22c55e'};border-radius:8px;">
                    <span style="font-size:1.6rem;">${Utils.escapeHtml(emoji)}</span>
                    <div style="flex:1;">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <strong style="font-size:0.92rem;color:var(--text-primary);">${Utils.escapeHtml(label)}</strong>
                        <span class="status-badge ${isNeg ? 'status-absent' : 'status-present'}" style="font-size:0.7rem;padding:2px 6px;">${isNeg ? 'Needs Support' : 'Positive'}</span>
                      </div>
                      <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
                        ${Utils.escapeHtml(dateStr)} ${timeStr ? `• ${Utils.escapeHtml(timeStr)}` : ''} • Recorded via ${Utils.escapeHtml(source)}
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `}
        </div>

        <div class="form-actions" style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:12px;border-top:1px solid var(--border);">
          <button type="button" class="btn btn-secondary" data-close-emotion-timeline style="font-weight:700;">
            &larr; Back to Classroom Climate
          </button>
          <button type="button" class="btn btn-primary" data-close-emotion-timeline style="font-weight:700;padding:8px 20px;">
            Done
          </button>
        </div>
      `;

      body.querySelectorAll("[data-close-emotion-timeline]").forEach(btn => {
        btn.onclick = closeModal;
      });
    }

    try {
      if (_unsubTimelineModal) {
        try { _unsubTimelineModal(); } catch (_) {}
        _unsubTimelineModal = null;
      }

      if (ClassCare?.DB?.emotional_checkins) {
        _unsubTimelineModal = ClassCare.DB.emotional_checkins
          .where("student_uid", "==", studentUid)
          .limit(100)
          .onSnapshot(snap => {
            let checkins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            checkins.sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || "")));
            renderTimelineContent(checkins);
          }, err => {
            console.warn("[emotion-timeline] realtime error, falling back to local:", err);
            renderTimelineContent([]);
          });
      } else {
        renderTimelineContent([]);
      }
    } catch (err) {
      console.warn("[emotion-timeline] fetch error, falling back to local:", err);
      renderTimelineContent([]);
    }
  }

  function initReferenceHeroControls() {
    const dateEl = $("#hero-current-date");
    if (dateEl) {
      try {
        const d = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = d.toLocaleDateString('en-US', options);
      } catch (e) {}
    }

    renderDynamicReferenceHero();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReferenceHeroControls);
  } else {
    initReferenceHeroControls();
  }

  window.openStudentEmotionTimelineModal = openStudentEmotionTimelineModal;
  window.addEventListener('classcare:live-data', event => {
    const data = event.detail; State.holisticData = data;
    if (data.grades) {
      State.intervention.gradeCache.clear(); ClassCare.DB._gradeCache.clear();
      State.students.forEach(student => {
        const grades = data.grades.filter(g => g.student_uid === student.uid).flatMap(g => [g.term1,g.term2,g.term3,g.term4]).filter(v => v != null && v !== '').map(Number).filter(Number.isFinite);
        const average = grades.length ? grades.reduce((a,b) => a+b,0)/grades.length : null;
        State.intervention.gradeCache.set(student.uid, { average });
      });
    }
    if (data.checks) {
      State.intervention.emotionCache.clear();
      [...data.checks, ...(data.attendance || [])].sort((a,b) => String(a.date).localeCompare(String(b.date))).forEach(c => {
        if (c.student_uid && c.emotion) State.intervention.emotionCache.set(c.student_uid, { emotion:c.emotion, label:c.emotion_label || c.emotion, emoji:c.emotion_emoji || '', date:c.date });
      });
    }
    if (data.users) ClassCare.DB._studentProfileCache.clear();
    State.holisticAlerts = new Set((data.alerts || []).filter(a => a.status !== 'Resolved').map(a => a.studentId));
    renderAttendanceTable(); renderStats(); renderEmotionReport();
    const modal = $("#student-emotion-timeline-modal");
    if (modal?.classList.contains("is-open") && modal.dataset.studentUid) openStudentEmotionTimelineModal(modal.dataset.studentUid);
  });
  window.stopTeacherScanner = stopScanner;
  window.pauseTeacherScanner = () => { if (State.scanning) stopScanner(); };
  window.TeacherScannerState = State;
})();
