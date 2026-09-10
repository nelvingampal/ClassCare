/* ============================================================
   toast.js — shared, dependency-free notifications
   ============================================================ */
(function () {
  "use strict";
  const ICONS = {
    success: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    error: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    warn: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
    info: '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v5m0-8h.01"/></svg>'
  };
  let container = null;
  function escape(value) { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML; }
  function ensureContainer() { if (container) return container; container = document.createElement("div"); container.id = "toast-container"; container.className = "toast-container"; document.body.appendChild(container); return container; }
  function show(message, options = {}) {
    const type = options.type || "info"; const duration = options.duration || 3200; const toast = document.createElement("div"); toast.className = `toast toast-${type}`; toast.setAttribute("role", type === "error" ? "alert" : "status"); toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite"); toast.innerHTML = `<span class="toast-icon">${ICONS[type] || ICONS.info}</span><span class="toast-message">${escape(message)}</span><button class="toast-close" type="button" aria-label="Dismiss notification">×</button>`; ensureContainer().appendChild(toast); requestAnimationFrame(() => toast.classList.add("is-visible"));
    const remove = () => { toast.classList.remove("is-visible"); setTimeout(() => toast.remove(), 180); }; const timer = setTimeout(remove, duration); toast.querySelector(".toast-close")?.addEventListener("click", () => { clearTimeout(timer); remove(); }); return remove;
  }
  window.Toast = { show, success: (message, duration) => show(message, { type: "success", duration }), error: (message, duration) => show(message, { type: "error", duration }), warn: (message, duration) => show(message, { type: "warn", duration }), info: (message, duration) => show(message, { type: "info", duration }) };
})();
