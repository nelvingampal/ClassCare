/* ============================================================
   student/dashboard.js — attendance summary and help
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  let cachedUser = null;
  let attendanceRequest = 0;

  function lastNDays(count) {
    const days = []; const today = new Date();
    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(today); date.setDate(today.getDate() - index);
      days.push([date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"));
    }
    return days;
  }
  function formatDay(iso) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00`));
  }
  function statusClass(status) { return String(status || "").toLowerCase() === "present" ? "present" : String(status || "").toLowerCase() === "late" ? "late" : String(status || "").toLowerCase() === "absent" ? "absent" : "not-recorded"; }

  function renderStrip(rows) {
    const strip = $("#attendance-strip"); if (!strip) return;
    const byDate = new Map(rows.map(row => [row.date, row]));
    strip.innerHTML = lastNDays(14).map(date => {
      const row = byDate.get(date); const status = row?.status || "Not recorded"; const tone = statusClass(status);
      return `<div class="attendance-day"><span class="attendance-day-label">${ClassCareUI.escapeHtml(formatDay(date))}</span><span class="attendance-day-cell ${tone}" title="${ClassCareUI.escapeHtml(`${formatDay(date)}: ${status}`)}"></span><span class="u-sr-only">${ClassCareUI.escapeHtml(status)}</span></div>`;
    }).join("");
  }

  function showTableState(type, title, message) {
    const body = $("#recent-tbody"); if (!body) return;
    const panel = document.createElement("div"); panel.className = `state-panel state-${type}`;
    const heading = document.createElement("strong"); heading.textContent = title;
    const copy = document.createElement("span"); copy.textContent = message;
    panel.append(heading, copy);
    const cell = document.createElement("td"); cell.colSpan = 4; cell.appendChild(panel);
    body.replaceChildren(document.createElement("tr")); body.firstElementChild.appendChild(cell);
  }

  function statusBadge(status) { return ClassCareUI.statusBadge(status); }
  function renderRows(rows) {
    const body = $("#recent-tbody"); if (!body) return;
    if (!rows.length) return showTableState("empty", "No attendance has been recorded yet.", "Your teacher will scan your QR code during class.");
    body.innerHTML = rows.slice(0, 14).map(row => `<tr><td class="tabular">${ClassCareUI.escapeHtml(row.date || "—")}</td><td class="tabular">${ClassCareUI.escapeHtml(row.time_in || "—")}</td><td class="tabular">${ClassCareUI.escapeHtml(row.time_out || "—")}</td><td>${statusBadge(row.status)}</td></tr>`).join("");
  }

  let unsubscribeAttendance = null;
  function loadAttendanceStats(user) {
    unsubscribeAttendance?.();
    const request = ++attendanceRequest;
    showTableState('loading', 'Loading attendance', 'Connecting to school records.');
    unsubscribeAttendance = ClassCare.DB.attendance.where('student_uid', '==', user.uid)
      .onSnapshot({ includeMetadataChanges: true }, snapshot => {
        if (request !== attendanceRequest) return;
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const counts = { Present: 0, Late: 0, Absent: 0 };
      rows.forEach(row => { if (counts[row.status] != null) counts[row.status] += 1; });
      $("#stat-total").textContent = rows.length;
      $("#stat-present").textContent = counts.Present;
      $("#stat-late").textContent = counts.Late;
      $("#stat-absent").textContent = counts.Absent;
      $("#stat-present-pct").textContent = rows.length ? `${Math.round((counts.Present / rows.length) * 100)}% of records` : "—";
      $("#legend-present").textContent = `Present ${counts.Present}`;
      $("#legend-late").textContent = `Late ${counts.Late}`;
      $("#legend-absent").textContent = `Absent ${counts.Absent}`;
      renderRows(rows); renderStrip(rows);

        const label = document.querySelector('#stat-present-pct');
        if (label && (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)) label.textContent += ' · awaiting sync';
      }, error => {
        showTableState('error', 'Attendance unavailable', error.message);
        ['stat-total','stat-present','stat-late','stat-absent'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
      });
  }

  function closeHelpdesk() { const modal = $("#helpdesk-modal"); modal?.classList.add("hidden"); modal?.classList.remove("flex"); }
  function openHelpdesk() { const modal = $("#helpdesk-modal"); modal?.classList.remove("hidden"); modal?.classList.add("flex"); setTimeout(() => $("#helpdesk-message")?.focus(), 30); }
  $("#btn-helpdesk")?.addEventListener("click", () => openHelpdesk());
  document.addEventListener("click", event => { if (event.target.closest("[data-close-hd]")) closeHelpdesk(); });
  document.addEventListener("keydown", event => { if (event.key !== "Escape") return; closeHelpdesk(); });

  $("#form-helpdesk")?.addEventListener("submit", async event => {
    event.preventDefault();
    const user = cachedUser || await getCurrentUser();
    if (!user) return Toast.error("Please sign in first.");
    if (!Utils.rateLimit(`hd_${user.uid}`, 1, 5 * 60 * 1000)) return Toast.warn("Please wait a few minutes before sending another request.");
    const message = Utils.sanitizeText(new FormData(event.target).get("message"), { max: 500 });
    if (!message) return Toast.error("Describe the issue before sending the request.");
    const button = $("#btn-send-ticket"); Utils.setLoading(button, true);
    try {
      await ClassCare.DB.helpdesk_tickets.add({ sender_uid: user.uid, sender_name: `${user.first_name || ""} ${user.last_name || ""}`.trim(), sender_id: user.student_id || "", section: user.section || "", message, status: "Open", timestamp: firebase.firestore.FieldValue.serverTimestamp() });
      event.target.reset(); closeHelpdesk(); Toast.success("Your request was sent. Replies will appear here.");
    } catch (error) {
      try {
        await OfflineSync.queueTicket({ sender_uid: user.uid, sender_name: `${user.first_name || ""} ${user.last_name || ""}`.trim(), sender_id: user.student_id || "", section: user.section || "", message });
        event.target.reset(); closeHelpdesk(); Toast.info("Your request is saved and waiting to sync.");
      } catch (queueError) { console.error(queueError); Toast.error("The request could not be saved. Keep the form open and try again."); }
    } finally { Utils.setLoading(button, false); }
  });

  let authInitPromise = null;
  function ensureUserLoaded() {
    if (cachedUser) return Promise.resolve(cachedUser);
    if (!authInitPromise) {
      authInitPromise = new Promise(resolve => {
        let finished = false;
        let unsubscribe; unsubscribe = ClassCare.onCurrentUser(user => {
          if (!finished) {
            finished = true;
            cachedUser = (user?.uid && !user.__profileError) ? user : null;
            if (typeof unsubscribe === "function") unsubscribe();
            resolve(cachedUser);
          }
        });
        setTimeout(() => {
          if (!finished) {
            finished = true;
            if (typeof unsubscribe === "function") unsubscribe();
            resolve(cachedUser);
          }
        }, 3000);
      });
    }
    return authInitPromise;
  }

  async function getCurrentUser() {
    if (cachedUser) return cachedUser;
    return ensureUserLoaded();
  }

  ClassCare.onCurrentUser(user => {
    cachedUser = (user?.uid && !user.__profileError) ? user : null;
    unsubscribeAttendance?.(); attendanceRequest++;
    if (cachedUser) loadAttendanceStats(cachedUser);
    else { renderRows([]); renderStrip([]); }
  });
  window.addEventListener("pagehide", () => unsubscribeAttendance?.());
})();
