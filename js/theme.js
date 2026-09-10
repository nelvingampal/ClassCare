/* ============================================================
   theme.js — dark/light preference
   MODIFIED: Rebranded storage key campus-theme → classcare-theme
   ============================================================ */
(function () {
  "use strict";
  // MODIFIED: Updated localStorage key from "campus-theme" to "classcare-theme"
  const STORAGE_KEY = "classcare-theme";
  const root = document.documentElement;

  function initialTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    // NEW: Migrate old key if present
    if (!stored) {
      const legacy = localStorage.getItem("campus-theme");
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem("campus-theme");
        return legacy;
      }
    }
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }
  function syncIcons(theme) {
    document.querySelectorAll("[data-theme-icon]").forEach(icon => {
      icon.classList.toggle("hidden", icon.dataset.themeIcon !== theme);
    });
  }
  function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    root.classList.toggle("dark", next === "dark");
    root.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
    syncIcons(next);
  }
  function toggleTheme() {
    const next = root.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    return next;
  }

  applyTheme(initialTheme());
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-toggle='theme']");
    if (!trigger) return;
    toggleTheme();
    if (navigator.vibrate) navigator.vibrate(8);
  });
  document.addEventListener("DOMContentLoaded", () => syncIcons(root.classList.contains("dark") ? "dark" : "light"));
  window.Theme = { toggle: toggleTheme, get: () => root.classList.contains("dark") ? "dark" : "light" };
})();
