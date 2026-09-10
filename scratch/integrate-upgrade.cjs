const fs = require('node:fs');
const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
function replace(p, old, value) { const s = read(p); if (!s.includes(old)) throw Error(`Missing target in ${p}: ${old.slice(0,70)}`); write(p, s.replace(old, value)); }
const head = title => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ClassCare</title><link rel="stylesheet" href="../js/styles.css"><link rel="stylesheet" href="../js/holistic.css">
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js" defer></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js" defer></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js" defer></script>
<script src="../js/config.js" defer></script><script src="../config/firebase-config.js" defer></script>
<script src="../js/theme.js" defer></script><script src="../js/utils.js" defer></script>
<script src="../js/holistic-core.js" defer></script><script src="../js/kiosk-data.js" defer></script>`;
const links = `<nav class="cc-links" aria-label="Teacher tools"><a class="btn btn-secondary" href="index.html">Teacher portal</a><a class="btn btn-secondary" href="scanner.html">Daily Attendance</a><a class="btn btn-secondary" href="deep-check.html">Deep Emotional Check</a><a class="btn btn-secondary" href="summative.html">Summative Scores</a></nav>`;
for (const [path, mode] of [['teacher/scanner.html', 'attendance'], ['teacher/deep-check.html', 'deep']]) {
  write(path, head(mode === 'deep' ? 'Deep Emotional Check' : 'Daily Attendance') + `
<script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js" defer></script>
${mode === 'deep' ? '<script src="hand-gestures.js" defer></script>' : ''}<script src="kiosk.js" defer></script></head>
<body data-kiosk="${mode}"><main class="cc-page"><header class="cc-header"><div><p class="cc-kicker">ClassCare · Student care</p><h1 id="kiosk-title">Kiosk</h1><p id="kiosk-description"></p></div>${links}</header>
<div id="auth-required" class="cc-card">Sign in with an approved teacher or administrator account in the <a href="index.html">Teacher portal</a>.</div>
<div id="kiosk-content" hidden><p class="cc-status" id="kiosk-status" role="status" aria-live="polite"></p>
<section id="scan-panel" class="cc-card"><h2>Scan student ID</h2><div id="qr-camera" style="max-width:540px;margin:auto"></div>
<div class="cc-toolbar"><button id="start-camera" class="btn btn-primary" type="button">Start QR camera</button><button id="stop-camera" class="btn btn-secondary" type="button">Stop camera</button></div>
<form id="manual-form" class="cc-form"><label for="manual-id">Student ID or QR text<input id="manual-id" required autocomplete="off" maxlength="2048"></label><button id="manual-submit" class="btn btn-primary" type="submit">Find student</button></form></section>
<section id="deep-assessment" class="cc-card" hidden><h2 id="student-name"></h2><div class="cc-assessment">
<div><div class="cc-camera"><video id="gesture-video" muted autoplay playsinline aria-label="Mirrored student camera preview"></video><span class="cc-camera-caption">Show 1–4 fingers. Hold to select, then lower your hand.</span></div>
<button id="enable-gestures" class="btn btn-secondary" type="button">Enable / restart gestures</button><p id="gesture-status" class="cc-status" role="status">Touch and keyboard are always available.</p><progress id="gesture-progress" max="1" value="0" aria-label="Gesture hold progress"></progress></div>
<div><p id="question-step" class="cc-kicker"></p><h2 id="question-title" aria-live="polite"></h2><div id="question-options" class="cc-options"></div>
<div id="review" hidden><ol id="review-answers"></ol><button id="save-check" class="btn btn-primary" type="button">Save assessment</button><button id="restart-check" class="btn btn-secondary" type="button">Change answers</button></div>
<button id="cancel-check" class="btn btn-secondary" type="button">Cancel check</button></div></div></section></div></main></body></html>`);
}
write('teacher/summative.html', head('Summative Scores') + `
<script src="summative.js" defer></script><script src="../js/holistic-portals.js" defer></script></head><body data-role="teacher"><main class="cc-page">
<header class="cc-header"><div><p class="cc-kicker">ClassCare · Weekly learning</p><h1>Summative Scores</h1></div>${links}</header>
<p id="auth-required" class="cc-card">Sign in to the <a href="index.html">Teacher portal</a> with an approved staff account.</p>
<div id="summative-content" hidden><section class="cc-card"><h2>Schedule an assessment</h2><p>Students see published dates immediately. The date, section, maximum score, and care threshold are fixed after publishing.</p>
<form id="assessment-form" class="cc-form"><label>Title<input name="title" required maxlength="150"></label><label>Subject<input name="subject" required maxlength="100"></label>
<label>Section<select id="assessment-section" name="section" required></select></label><label>Assessment date<input type="date" id="assessment-date" name="scheduledDate" required></label>
<label>Maximum score<input type="number" name="maxScore" min="1" max="10000" value="100" required></label><label>Care threshold (%)<input type="number" name="thresholdPercent" min="0" max="100" step="any" value="75" required></label>
<button id="publish-assessment" class="btn btn-primary" type="submit">Publish assessment</button></form></section>
<section class="cc-card"><h2>Section score sheet</h2><p id="score-live" class="cc-live" role="status">Connecting…</p><div class="cc-toolbar"><label>Assessment <select id="assessment-select"><option value="">Choose an assessment</option></select></label><div><button id="save-scores" class="btn btn-primary" type="button">Save scores</button><button id="discard-edits" class="btn btn-secondary" type="button">Discard edits</button></div></div>
<p id="score-description"></p><p>Use Tab, Enter, or ↑/↓ to move between scores. Paste one column from Excel. A blank means not graded; clearing a saved score removes it when you save.</p>
<div class="cc-table-wrap"><table class="cc-grid"><caption class="u-sr-only">Student summative scores</caption><thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">Student ID</th><th scope="col">Score</th><th scope="col">Saved percent</th><th scope="col">Status</th></tr></thead><tbody id="score-rows"></tbody></table></div>
<p id="score-status" class="cc-status" role="status" aria-live="polite"></p></section></div></main></body></html>`);
for (const p of ['teacher/index.html', 'student/index.html', 'admin/index.html']) {
  replace(p, '</head>', '<link rel="stylesheet" href="../js/holistic.css">\n<script src="../js/holistic-core.js" defer></script>\n<script src="../js/holistic-portals.js" defer></script>\n</head>');
}
replace('teacher/index.html', '<script src="./scanner.js" defer></script>', '<script src="../js/holistic-core.js" defer></script>\n<script src="../js/kiosk-data.js" defer></script>\n<script src="./scanner.js" defer></script>');
// Remove heavyweight unused face and gesture models from the ordinary teacher dashboard.
write('teacher/index.html', read('teacher/index.html').split('\n').filter(line => !/@tensorflow\/tfjs|@vladmandic\/face-api|@mediapipe\/(camera_utils|drawing_utils|hands)/.test(line)).join('\n'));
replace('teacher/index.html', '<section id="view-dashboard" class="section-stack hidden" aria-labelledby="teacher-page-title">', '<section id="view-dashboard" class="section-stack hidden" aria-labelledby="teacher-page-title">\n<div class="cc-banner">'+links+'</div>');
// Replace the legacy attendance path, including its synthetic timeout answers.
let scanner = read('teacher/scanner.js');
const begin = scanner.indexOf('    State.students.set(student.uid, student);', scanner.indexOf('  async function handleDecodedText'));
const end = scanner.indexOf('\n  async function lookupStudent', begin);
if (begin < 0 || end < 0) throw Error('Attendance integration target missing');
scanner = scanner.slice(0, begin) + `    State.wellbeing.active = true;
    try {
      const result = await ClassCareKioskData.fastMood(student, State.teacher, State.settings, getActiveTeacherAssignment());
      if (result) {
        const record = result.record;
        State.attendance.set(student.uid, record);
        renderAttendanceTable(); renderStats(); updateChooser();
        showResult(student, record.status, record.time_in, record.minutes_late || 0, result.kind === 'duplicate' ? 'duplicate' : 'saved', record);
        Toast.success(result.kind === 'duplicate' ? 'Attendance already recorded.' : result.kind === 'time_out' ? 'Time out saved.' : 'Attendance and mood saved.');
      }
    } finally {
      State.wellbeing.active = false; State.scanInFlight = false;
      await resumeQRScanner();
    }
  }
` + scanner.slice(end);
// Old three-step flow is unreachable; remove it instead of leaving timeout-generated records in the app.
const startSurvey = scanner.indexOf('  async function startWellbeingSurvey(');
const endSurvey = scanner.indexOf('  async function verifyStudentBelongsToTeacher', startSurvey);
if (startSurvey >= 0 && endSurvey > startSurvey) scanner = scanner.slice(0, startSurvey) + scanner.slice(endSurvey);
// Do not let caches from the old academic/emotional heuristic compete with the new correlation engine.
scanner = scanner.replace('list.forEach(student => evaluateStudentIntervention(student, today, skipFullEval));', '// Summative correlation is maintained by holistic-portals.js.');
scanner = scanner.replace('if (!belongs) return;', 'if (!belongs) { State.students.delete(student.uid); return; }');
write('teacher/scanner.js', scanner);
// School-local dates are shared by all kiosk and portal records.
replace('student/emotional-checkin.js', 'function todayIso() { return new Date().toISOString().slice(0, 10); }', 'function todayIso() { return Utils.todayIso(); }');
// Service worker must never cache authenticated API responses or return stale application code.
replace('sw.js', 'const APP_VERSION = "v1.1.5";', 'const APP_VERSION = "v2.0.0";');
replace('sw.js', 'event.respondWith(networkFirst(req, DATA_CACHE));', 'event.respondWith(fetch(req));');
replace('sw.js', 'event.respondWith(staleWhileRevalidate(req, CORE_CACHE));', 'event.respondWith(networkFirst(req, CORE_CACHE));');
console.log('Integrated dual kiosks, score page, portal listeners, and cache updates.');
