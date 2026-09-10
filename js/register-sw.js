/* ============================================================
   register-sw.js  —  Register the Service Worker + BackgroundSync
   ------------------------------------------------------------
   This file is tiny and loaded from every HTML page at the END
   of <body>.  Because SWs only work over HTTPS (or localhost),
   we skip registration when served from file:// or http:// URLs
   that aren't localhost to avoid noisy console errors.
   ============================================================ */

(function () {
  // This file is loaded as a classic script, so do not use import.meta here.
  // Resolve the service worker from the page-provided app-root marker. This
  // works at /, /student/, /teacher/, and /admin/ without assuming a domain.
  const rootMarker = document.querySelector('meta[name="sw-root"]')?.content || "./";
  const rootUrl = new URL(rootMarker, document.baseURI);
  const relativeSwPath = new URL("sw.js", rootUrl).pathname;
  const scopePath = rootUrl.pathname;

  function isSecureContext() {
    if (location.protocol === "https:") return true;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return true;
    if (location.hostname.endsWith(".localhost")) return true;
    return false;
  }

  if (!("serviceWorker" in navigator) || !isSecureContext()) {
    console.info("[sw] Service Worker skipped (not supported or non-secure context).");
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(relativeSwPath, {
        scope: scopePath,
        updateViaCache: "none"    // always check for SW updates; tiny SW payload
      });

      /* Update found → prompt?  For this app we silently take the update
         via skipWaiting/claimClients already in sw.js. */
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            // Soft notify the user — don't reload mid-scan.
            if (window.Toast) Toast.info("App updated — refresh when you're free. ✨");
          }
        });
      });

      /* Listen for messages from SW — currently CLASSCARE_SYNC_DONE
         (Background Sync has flushed pending queues). */
      navigator.serviceWorker.addEventListener("message", (ev) => {
        const d = ev.data || {};
        // MODIFIED: CAMPUS_SYNC_DONE → CLASSCARE_SYNC_DONE
        if (d.type === "CLASSCARE_SYNC_DONE" && window.Toast) {
          const r = d.result || {};
          const total = (r.attendance||0) + (r.tickets||0) + (r.moods||0) + (r.emotions||0);
          if (total > 0) Toast.success(`Synced ${total} pending items (background). ✅`);
          if (window.OfflineSync?._emit) window.OfflineSync._emit();   // refresh pending badge
        }
      });

      console.info("[sw] Registered:", reg.scope);
    } catch (err) {
      console.warn("[sw] Registration failed:", err);
    }
  });

  /* ---- Expose a helper so offline-sync.js can register a
          BackgroundSync task after writing a pending record. ---- */
  // MODIFIED: CampusSW → ClassCareSW
  window.ClassCareSW = {
    async requestSync(tag = "classcare-sync") {
      if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return false;
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register(tag);
        return true;
      } catch (err) {
        console.info("[sw] BackgroundSync registration failed (normal in Firefox):", err);
        return false;
      }
    },
    async postMessage(msg) {
      try {
        const ctrl = navigator.serviceWorker.controller;
        if (ctrl) ctrl.postMessage(msg);
        return !!ctrl;
      } catch (_) { return false; }
    }
  };
})();
