/* ============================================================
   ui.js — shared, framework-free UI helpers
   MODIFIED: Rebranded CampusUI → ClassCareUI
   ============================================================ */
(function () {
  "use strict";

  const ICONS = {
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    message: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-3.7-.8L4 20l1.8-3.6A7.1 7.1 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/>',
    pencil: '<path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.2 2.2 0 0 0-3.1-3.1L4 16.5Z"/><path d="m14.5 5.5 3 3"/>',
    qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2h-2zM18 18h2v2h-2z"/>'
  };

  function escapeHtml(value) {
    const node = document.createElement("div");
    node.textContent = value ?? "";
    return node.innerHTML;
  }

  function icon(name, className = "icon", label = "") {
    const hidden = label ? "" : ' aria-hidden="true"';
    const accessible = label ? ` role="img" aria-label="${escapeHtml(label)}"` : "";
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${hidden}${accessible}>${ICONS[name] || ""}</svg>`;
  }

  function normalizeStatus(value) {
    return ["Present", "Late", "Absent"].includes(value) ? value : "Not recorded";
  }

  function statusBadge(value, detail = "") {
    const status = normalizeStatus(value);
    const tone = status.toLowerCase().replace(/\s+/g, "-");
    const suffix = detail ? ` <span class="status-detail">${escapeHtml(detail)}</span>` : "";
    return `<span class="status-badge status-${tone}">${escapeHtml(status)}${suffix}</span>`;
  }

  function roleBadge(value) {
    const role = String(value || "").toLowerCase();
    const label = ({ student: "Student", teacher: "Teacher", admin: "IT Administrator" })[role] || "Unknown role";
    return `<span class="role-badge role-${escapeHtml(role)}">${escapeHtml(label)}</span>`;
  }

  function setState(container, { type = "empty", title, message = "", action = "" } = {}) {
    if (!container) return;
    container.className = `state-panel state-${type}`;
    container.innerHTML = `<strong>${escapeHtml(title || "Nothing to show")}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}${action}`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function setAuthState(authenticated) {
    document.body.dataset.auth = authenticated ? "signed-in" : "guest";
  }

  // MODIFIED: Renamed from CampusUI → ClassCareUI
  window.ClassCareUI = { ICONS, escapeHtml, icon, normalizeStatus, statusBadge, roleBadge, setState, formatDate, setAuthState };
  // MODIFIED: Backward-compatibility alias
  // window.ClassCareUI is the global UI helper
})();
