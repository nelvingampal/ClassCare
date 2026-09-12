/* Static app shell only. Authenticated foreground pages own all data and queue writes. */
const CACHE = 'classcare-shell-stabilize-1';
const ASSETS = ["./admin/dashboard.js", "./admin/grades.js", "./admin/helpdesk.js", "./admin/index.html", "./admin/settings.js", "./admin/users.js", "./assets/brand/svg/classcare-symbol-color.svg", "./config/firebase-config.js", "./index.html", "./js/ai-knowledge.js", "./js/app.js", "./js/chatbot.js", "./js/config.js", "./js/holistic-core.js", "./js/holistic-portals.js", "./js/holistic.css", "./js/kiosk-data.js", "./js/offline-sync.js", "./js/register-sw.js", "./js/shell.js", "./js/styles.css", "./js/telegram-alert.js", "./js/theme.js", "./js/toast.js", "./js/ui.js", "./js/utils.js", "./manifest.json", "./student/concern.js", "./student/dashboard.js", "./student/emotional-checkin.js", "./student/enrollment.js", "./student/grades.js", "./student/index.html", "./student/register.js", "./teacher/analytics.js", "./teacher/assignments.js", "./teacher/deep-check.html", "./teacher/enrollment.js", "./teacher/export.js", "./teacher/grades.js", "./teacher/hand-gestures.js", "./teacher/hand-worker.js", "./teacher/index.html", "./teacher/overview-v3.css", "./teacher/kiosk.js", "./teacher/register.js", "./teacher/scanner.html", "./teacher/scanner.js", "./teacher/summative.html", "./teacher/summative.js", "./teacher/wheel.js"];
const urls = new Set(ASSETS.map(p => new URL(p,self.location.href).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => /^(classcare-|campus-)/.test(k) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !urls.has(event.request.url)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request,copy))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
