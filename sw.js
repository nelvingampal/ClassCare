/* ============================================================
   sw.js  —  Service Worker for ClassCare (PWA)
   ------------------------------------------------------------
   Strategies used:
     • Precache  —  the 3 core HTML shells + shared JS libs
                     (installed via cache.addAll on 'install')
     • RUNTIME
        – Same-origin static assets (HTML/CSS/JS/PNG/JPG…) →
          Stale-While-Revalidate (fast offline, keeps up-to-date)
        – CDN 3rd-party (tailwind, gstatic, jsdelivr, unpkg, fonts) →
          CacheFirst with 7d expiration (big perf win on re-open)
        – FIREBASE REST calls (firestore.googleapis etc.) →
          NetworkFirst, fall back offline if we have it.
     • Background Sync  —  `sync:classcare-sync` event replays the
       IndexedDB OfflineSync queues (attendance/tickets/moods),
       so even if the user closes the tab while offline the SW
       flushes the moment connectivity returns.
     • SkipWaiting / claimClients  —  updates take effect on next
       navigation (safer than forcing reload of active pages that
       may be mid-scan / mid-form).

   NOTE: The SW must live at the APP ROOT (it controls everything
   under it via its scope).  This file is /sample/sw.js → scope /sample/.
   ============================================================ */

const APP_VERSION = "v2.0.0";
// MODIFIED: Cache names rebranded from campus- → classcare-
const CORE_CACHE   = `classcare-core-${APP_VERSION}`;
const CDN_CACHE    = `classcare-cdn-${APP_VERSION}`;
const DATA_CACHE   = `classcare-data-${APP_VERSION}`;
const CDN_MAX_AGE  = 7 * 24 * 60 * 60;     // 7 days, seconds

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./student/index.html",
  "./teacher/index.html",
  "./admin/index.html",
  "./manifest.json",
  "./js/config.js",
  "./js/styles.css",
  "./config/firebase-config.js",
  "./js/theme.js",
  "./js/toast.js",
  "./js/utils.js",
  "./js/ui.js",
  "./js/shell.js",
  "./js/telegram-alert.js",
  "./js/offline-sync.js",
  "./student/register.js",
  "./student/dashboard.js",
  "./teacher/scanner.js",
  "./teacher/register.js",
  "./teacher/wheel.js",
  "./teacher/export.js",
  "./admin/dashboard.js",
  "./admin/users.js",
  "./admin/settings.js",
  "./admin/helpdesk.js"
];

/* ════════════════════════════════════════════════════════════
   INSTALL — Precache our core shell.  Self-skip waiting so a
   newly installed SW takes over as soon as possible.
   ════════════════════════════════════════════════════════════ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(
        /* Graceful: ignore 404s on optional files (e.g. admin/ may not be uploaded yet
           on small deployments).  cache.addAll is all-or-nothing so we use Promise.allSettled
           equivalent via individual fetch + put with OK check. */
        CORE_ASSETS.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((resp) => {
              if (resp.ok) return cache.put(url, resp);
            })
            .catch(() => { /* optional asset failed; don't fail install */ })
        )
      ))
      .then(() => self.skipWaiting())
  );
});

/* ════════════════════════════════════════════════════════════
   ACTIVATE — Clean up old-version caches, then claim clients so
   open tabs immediately route through the new SW.
   ════════════════════════════════════════════════════════════ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) =>
            k.startsWith("campus-") && !k.startsWith("classcare-") ||
            k.startsWith("classcare-") &&
            k !== CORE_CACHE && k !== CDN_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ════════════════════════════════════════════════════════════
   FETCH — Route each request to the right strategy.
   ════════════════════════════════════════════════════════════ */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* SW only handles GETs (Firestore uses GET for reads, but writes
     are done via the JS SDK via websocket / POST and are handled by
     our OfflineSync layer — we leave those to the network). */
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* ---- 1) Navigation requests (e.g. user clicks into /student) ->
           SWR: always try network, fall back to cached shell. ---- */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  /* ---- 2) Firebase / Google API data calls -> NetworkFirst, cache reads ---- */
  if (isDataRequest(url)) {
    event.respondWith(fetch(req));
    return;
  }

  /* ---- 3) 3rd-party CDNs -> CacheFirst with expiration ---- */
  if (isCDNRequest(url)) {
    event.respondWith(cacheFirstWithExpiry(req, CDN_CACHE, CDN_MAX_AGE));
    return;
  }

  /* ---- 4) Our own same-origin core / static assets -> Stale-While-Revalidate ---- */
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, CORE_CACHE));
    return;
  }

  /* ---- 5) Other (unlikely) cross-origin GETs -> network as-is ---- */
});

/* ============================================================
   STRATEGY HELPERS
   ============================================================ */

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((resp) => {
      if (resp && resp.ok && resp.type !== "opaque") {
        cache.put(req, resp.clone());
      }
      return resp;
    }).catch(() => cached);
    return cached || fetchPromise;
  });
}

function networkFirst(req, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    try {
      const resp = await fetch(req);
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch (_) {
      const cached = await cache.match(req);
      if (cached) return cached;
      // Fallback response (useful for first open offline without cache)
      return new Response(JSON.stringify({ offline: true }), {
        status: 503, statusText: "Offline",
        headers: { "Content-Type": "application/json" }
      });
    }
  });
}

/**
 * Cache-first with a lightweight in-cache timestamp header.
 * (Real Service Workers don't have Expires for arbitrary synthetic entries,
 * so we store the response together with a timestamp via a tiny trick:
 * re-wrap the response body with a custom header when putting, and strip
 * it back out when reading.)
 */
function cacheFirstWithExpiry(req, cacheName, maxAgeSec) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(req);
    if (cached) {
      const ts = Number(cached.headers.get("X-SW-Cached-At") || "0");
      if (ts && (Date.now() / 1000 - ts) < maxAgeSec) {
        // Strip the helper header before handing to the page
        return stripHeader(cached, "X-SW-Cached-At");
      }
    }
    try {
      let resp = await fetch(req);
      if (resp && resp.ok) {
        // Store with our synthetic timestamp header
        const nowTs = String(Math.floor(Date.now() / 1000));
        const newHeaders = new Headers(resp.headers);
        newHeaders.set("X-SW-Cached-At", nowTs);
        const toCache = new Response(await resp.arrayBuffer(), {
          status: resp.status, statusText: resp.statusText, headers: newHeaders
        });
        await cache.put(req, toCache);
        // Re-read original response (need a fresh one since we consumed body)
        resp = await fetch(req);
      }
      return resp;
    } catch (err) {
      if (cached) return stripHeader(cached, "X-SW-Cached-At");
      throw err;
    }
  });
}

function stripHeader(resp, name) {
  const h = new Headers(resp.headers);
  h.delete(name);
  return new Response(resp.body, {
    status: resp.status, statusText: resp.statusText, headers: h
  });
}

/* ============================================================
   REQUEST CLASSIFIER HELPERS
   ============================================================ */
function isDataRequest(url) {
  return /firestore|googleapis|firebaseio|\.firebase/.test(url.hostname);
}
function isCDNRequest(url) {
  const cdnHosts = [
    "cdn.tailwindcss.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "cdn.jsdelivr.net",
    "unpkg.com",
    "www.gstatic.com"
  ];
  return cdnHosts.includes(url.hostname);
}

/* ============================================================
   BACKGROUND SYNC  — the real "holy grail" for offline scans.
   When teacher/index.html calls:
       OfflineSync.enqueueAttendance({ ... })
   it also registers a `sync:classcare-sync` BackgroundSync event
   (if supported).  Chrome/brave/safari (some) will wake the SW
   the moment connectivity is back — even if the user closed the
   tab — to run the flushers in here.
   ============================================================ */
self.addEventListener("sync", (event) => {
  // MODIFIED: campus-sync → classcare-sync
  if (event.tag !== "classcare-sync") return;

  /* IMPORTANT: We can't call window.* / OfflineSync directly from
     inside the SW (it's a different global).  Instead we re-implement
     the same IndexedDB flushers the tab-side OfflineSync module uses.
     These are IDENTICAL LOGIC (same stores, same records, same
     Firestore write paths) so flushing from SW is equivalent. */
  event.waitUntil(flushAllFromSW().then((r) => {
    // Notify all windows (in case user happens to still have one open)
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => clients.forEach((c) => {
        // MODIFIED: CAMPUS_SYNC_DONE → CLASSCARE_SYNC_DONE
        try { c.postMessage({ type: "CLASSCARE_SYNC_DONE", result: r }); } catch (_){}
      }));
    return r;
  }));
});

/* ============================================================
   SW-SIDE INDEXEDDB HELPERS (duplicate of tab-side, intentionally
   — avoids importing the same script across two globals).
   ============================================================ */
const IDB = {
  open() {
    return new Promise((resolve, reject) => {
      // MODIFIED: CampusOfflineSync → ClassCareOfflineSync
      const req = indexedDB.open("ClassCareOfflineSync", 3);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        ["pending_attendance", "pending_tickets", "pending_moods", "pending_emotions"].forEach((s) => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: "id", autoIncrement: true });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },
  tx(db, store, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try { out = fn(s); } catch (e) { return rej(e); }
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror    = () => rej(t.error);
      t.onabort    = () => rej(t.error || new Error("abort"));
    });
  },
  async getAll(store) { const db = await this.open(); return this.tx(db, store, "readonly", s => s.getAll()); },
  async remove(store, id) { const db = await this.open(); return this.tx(db, store, "readwrite", s => s.delete(id)); }
};

async function flushAllFromSW() {
  // NOTE: Inside SW we don't have Firebase SDK loaded.  The approach:
  // for each record we make a REST call to Firestore:
  //    POST https://firestore.googleapis.com/v1/projects/{proj}/databases/(default)/documents/...
  // This avoids bundling the entire Firebase SDK into the SW.
  const cfg = (await readConfigFromAppScope()) || {};
  const projectId = cfg.projectId;
  if (!projectId) {
    // Without a projectId we can't flush; leave records for the tab to do on next load.
    return { skipped: true, reason: "no_projectId" };
  }

  const [attCount, ticCount, moodCount, emotionCount] = await Promise.all([
    flushCollection("pending_attendance", projectId, (rec) => ({
      path: `attendance`,
      docId: `${rec.student_uid}_${rec.date}`,
      fields: {
        student_uid:    stringValue(rec.student_uid),
        date:           stringValue(rec.date),
        time_in:        stringValue(rec.time_in || ""),
        status:         stringValue(rec.status || ""),
        minutes_late:   integerValue(rec.minutes_late || 0),
        synced_from_offline_sw: booleanValue(true),
        synced_at: timestampValue(new Date())
      }
    })),
    flushCollection("pending_tickets", projectId, (rec) => ({
      path: "helpdesk_tickets",
      fields: {
        sender_uid:  stringValue(rec.sender_uid || ""),
        sender_name: stringValue(rec.sender_name || ""),
        sender_id:   stringValue(rec.sender_id || ""),
        section:     stringValue(rec.section || ""),
        message:     stringValue(rec.message || ""),
        status:      stringValue("Open"),
        synced_from_offline_sw: booleanValue(true),
        timestamp: timestampValue(new Date())
      }
    })),
    flushCollection("pending_moods", projectId, (rec) => ({
      path: `users/${rec.sender_uid || rec.student_uid}/moods`,
      docId: rec.date,
      fields: {
        mood: stringValue(rec.mood || ""),
        synced_from_offline_sw: booleanValue(true),
        timestamp: timestampValue(new Date())
      }
    })),
    flushCollection("pending_emotions", projectId, (rec) => {
      const answers = rec.wellbeing_data || rec.answers || {};
      const wellbeingData = {};
      ["q1", "q2", "q3", "q4", "q5"].forEach(key => {
        if (["A", "B", "C", "D"].includes(String(answers[key] || "").toUpperCase())) {
          wellbeingData[key] = stringValue(String(answers[key]).toUpperCase());
        }
      });
      return {
        path: "attendance",
        docId: `${rec.student_uid}_${rec.date}`,
        fields: {
          wellbeing_data: mapValue(wellbeingData),
          wellbeing_surveyed_by: stringValue(rec.surveyed_by || rec.checked_by || ""),
          wellbeing_surveyed_at: timestampValue(new Date()),
          wellbeing_synced_from_offline_sw: booleanValue(true)
        }
      };
    })
  ]);
  return { attendance: attCount, tickets: ticCount, moods: moodCount, emotions: emotionCount };
}

/**
 * Get FIREBASE_CONFIG.projectId by fetching firebase-config.js source
 * from the app scope and regex-extracting the projectId.  Lightweight
 * (the file is small and likely cached by our SW already).
 */
async function readConfigFromAppScope() {
  try {
    const url = "./config/firebase-config.js";
    const resp = await fetch(url);
    const text = await resp.text();
    const m = /projectId\s*:\s*["'`]([^"'`]+)["'`]/.exec(text);
    return m ? { projectId: m[1] } : null;
  } catch (_) { return null; }
}

async function flushCollection(store, projectId, toPayload) {
  const list = await IDB.getAll(store);
  if (!list.length) return 0;
  let ok = 0;
  for (const rec of list) {
    try {
      const p = toPayload(rec);
      const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
      let url;
      if (p.docId) url = `${base}/${p.path}/${p.docId}`;
      else          url = `${base}/${p.path}`;
      const method = p.docId ? "PATCH" : "POST";
      const body = JSON.stringify({ fields: p.fields });
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await IDB.remove(store, rec.id);
      ok++;
    } catch (e) {
      // Keep for retry next time
      console.warn(`[SW sync] ${store}/${rec.id} failed:`, e);
    }
  }
  return ok;
}

/* ============================================================
   FIRESTORE REST TYPE HELPERS
   ============================================================ */
function stringValue(v)  { return { stringValue: String(v ?? "") }; }
function integerValue(v) { return { integerValue: String(Math.floor(Number(v || 0))) }; }
function booleanValue(v) { return { booleanValue: !!v }; }
function mapValue(fields) { return { mapValue: { fields } }; }
function timestampValue(d) {
  const s = Math.floor((d instanceof Date ? d : new Date(d)).getTime() / 1000);
  return { timestampValue: `${s}s` };
}

/* ============================================================
   PUSH (OPTIONAL) — future: if we ever enable web push for
   parents, this handler will surface notifications.
   ============================================================ */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch (_) { payload = { title: "ClassCare", body: event.data.text() }; }
  const opts = {
    body: payload.body || "",
    data: payload.data || {},
    tag: payload.tag || "classcare-default",
    requireInteraction: !!payload.requireInteraction
  };
  event.waitUntil(self.registration.showNotification(payload.title || "ClassCare", opts));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data?.url || "./index.html")
  );
});
