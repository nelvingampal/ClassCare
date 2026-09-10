/* ============================================================
   shell.js — shared responsive navigation for signed-in portals
   ============================================================ */
(function () {
  "use strict";

  function init() {
    const sidebar = document.querySelector(".app-sidebar");
    const backdrop = document.querySelector(".sidebar-backdrop");
    const menu = document.querySelector("[data-mobile-menu]");
    const close = document.querySelector("[data-sidebar-close]");

    const setOpen = (open) => {
      sidebar?.classList.toggle("is-open", open);
      backdrop?.classList.toggle("is-visible", open);
      menu?.setAttribute("aria-expanded", open ? "true" : "false");
    };

    menu?.addEventListener("click", () => setOpen(!sidebar?.classList.contains("is-open")));
    close?.addEventListener("click", () => setOpen(false));
    backdrop?.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

    document.querySelectorAll("[data-tab-link]").forEach(link => {
      link.addEventListener("click", (event) => {
        const tab = link.dataset.tabLink;
        const trigger = document.querySelector(`[data-tab="${CSS.escape(tab)}"]:not([data-tab-link])`);
        if (trigger) {
          event.preventDefault();
          trigger.click();
          history.replaceState(null, "", `#tab-${tab}`);
        } else if (window.AdminUI?.showTab) {
          event.preventDefault();
          window.AdminUI.showTab(tab);
          history.replaceState(null, "", `#tab-${tab}`);
        }
        setOpen(false);
      });
    });

    document.querySelectorAll(".app-sidebar .nav-link").forEach(link => {
      link.addEventListener("click", () => {
        setOpen(false);
        if (!link.dataset.tabLink) {
          document.querySelectorAll(".app-sidebar .nav-link").forEach(l => l.classList.remove("active"));
          link.classList.add("active");
        }
      });
    });

    const updateActive = () => {
      const hash = location.hash.replace(/^#tab-/, "");
      document.querySelectorAll("[data-tab-link]").forEach(link => {
        const active = hash && link.dataset.tabLink === hash;
        link.classList.toggle("active", !!active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    };
    window.addEventListener("hashchange", updateActive);
    updateActive();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
