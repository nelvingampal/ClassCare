const fs = require('node:fs');
const read = p => fs.readFileSync(p, 'utf8'), write = (p, s) => fs.writeFileSync(p, s);
function replace(p, old, value) { const s = read(p); if (!s.includes(old)) throw Error(`Missing target ${p}: ${old.slice(0,50)}`); write(p, s.replace(old, value)); }
let config = read('config/firebase-config.js');
const start = config.indexOf('function onCurrentUser(callback) {'), end = config.indexOf('// MODIFIED: Renamed from CampusApp', start);
config = config.slice(0, start) + `// A single live identity subscription is shared by all portal modules.
const _profileCallbacks = new Set();
let _profileAuthStop = null, _profileDocStop = null, _profileValue, _profileFingerprint = '', _profileGeneration = 0;
function onCurrentUser(callback) {
  _profileCallbacks.add(callback);
  if (_profileValue !== undefined) queueMicrotask(() => { if (_profileCallbacks.has(callback)) callback(_profileValue); });
  if (!_profileAuthStop) {
    const services = getFirebase();
    const emit = value => {
      const fingerprint = JSON.stringify(value);
      if (fingerprint === _profileFingerprint) return;
      _profileFingerprint = fingerprint; _profileValue = value;
      _profileCallbacks.forEach(cb => queueMicrotask(() => { if (_profileCallbacks.has(cb)) cb(value); }));
    };
    if (!services?.auth) queueMicrotask(() => emit({ __profileError: _initError?.code || 'service-unavailable' }));
    else _profileAuthStop = services.auth.onAuthStateChanged(fbUser => {
      _profileDocStop?.(); _profileDocStop = null; const token = ++_profileGeneration;
      if (!fbUser) return emit(null);
      _profileDocStop = DB.users.doc(fbUser.uid).onSnapshot(snapshot => {
        if (token !== _profileGeneration) return;
        if (!snapshot.exists) return emit({ uid: fbUser.uid, email: fbUser.email, __profileError: 'profile-not-found' });
        const data = snapshot.data();
        emit({ ...data, uid: fbUser.uid, email: fbUser.email, role: normalizeRole(data.role), section: data.section || '' });
      }, error => emit({ uid: fbUser.uid, __profileError: error.code || 'profile-read-failed' }));
    });
  }
  return () => {
    _profileCallbacks.delete(callback);
    if (!_profileCallbacks.size) {
      _profileAuthStop?.(); _profileDocStop?.(); _profileAuthStop = _profileDocStop = null;
      _profileValue = undefined; _profileFingerprint = ''; _profileGeneration++;
    }
  };
}

` + config.slice(end);
config = config.replace('_gradeCacheTTL: 60000', '_gradeCacheTTL: 0').replace('_studentProfileTTL: 120000', '_studentProfileTTL: 0');
config = config.replace('[d.term1, d.term2, d.term3, d.term4].map(v => Number(v)).filter(v => !isNaN(v))', '[d.term1, d.term2, d.term3, d.term4].filter(v => v !== null && v !== undefined && v !== "").map(Number).filter(Number.isFinite)');
config = config.replace('"sad", "stressed", "angry"', '"sad", "stressed", "not_good", "not_motivated", "angry"');
config = config.replace('happy: { label:', 'okay: { label: "Okay", emoji: "😐", is_negative: false },\n    not_good: { label: "Not Good", emoji: "😟", is_negative: true },\n    not_motivated: { label: "Not Motivated", emoji: "😞", is_negative: true },\n    happy: { label:');
write('config/firebase-config.js', config);
let student = read('student/dashboard.js');
const a = student.indexOf('  async function loadAttendanceStats'), b = student.indexOf('  function closeHelpdesk', a);
const renderStart = student.indexOf('      const rows =', a), renderEnd = student.indexOf('    } catch (error)', renderStart);
const render = student.slice(renderStart, renderEnd);
student = student.slice(0,a) + `  let unsubscribeAttendance = null;
  function loadAttendanceStats(user) {
    unsubscribeAttendance?.();
    const request = ++attendanceRequest;
    showTableState('loading', 'Loading attendance', 'Connecting to school records.');
    unsubscribeAttendance = ClassCare.DB.attendance.where('student_uid', '==', user.uid)
      .onSnapshot({ includeMetadataChanges: true }, snapshot => {
        if (request !== attendanceRequest) return;
${render}
        const label = document.querySelector('#stat-present-pct');
        if (label && (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)) label.textContent += ' · awaiting sync';
      }, error => {
        showTableState('error', 'Attendance unavailable', error.message);
        ['stat-total','stat-present','stat-late','stat-absent'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
      });
  }

` + student.slice(b);
student = student.replace('    if (cachedUser) loadAttendanceStats(cachedUser);', '    unsubscribeAttendance?.(); attendanceRequest++;\n    if (cachedUser) loadAttendanceStats(cachedUser);\n    else { renderRows([]); renderStrip([]); }');
student = student.replace('        const unsubscribe = ClassCare.onCurrentUser', '        let unsubscribe; unsubscribe = ClassCare.onCurrentUser');
student = student.replace('})();', '  window.addEventListener("pagehide", () => unsubscribeAttendance?.());\n})();');
write('student/dashboard.js', student);
let utils = read('js/utils.js');
const d1 = utils.indexOf('  function todayIso()'), d2 = utils.indexOf('  function computeStatus', d1);
utils = utils.slice(0,d1) + `  function todayIso() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function nowHhMm() { return new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date()); }
` + utils.slice(d2); write('js/utils.js', utils);
// Queries displayed as aggregates must not silently truncate at an arbitrary 500 rows.
let admin = read('admin/dashboard.js').replaceAll('.limit(500)', '');
admin = admin.replace('ClassCare.DB.helpdesk_tickets.where("status", "==", "Open").get().then(snapshot => { $("#stat-tickets")?.replaceChildren(document.createTextNode(String(snapshot.size))); }).catch(error => { console.warn("[admin] ticket count failed:", error); $("#stat-tickets")?.replaceChildren(document.createTextNode("—")); });', '');
admin = admin.replace('    listenUsers(); listenAttendance(); listenGlobalConcerns();', `    listenUsers(); listenAttendance(); listenGlobalConcerns();
    State._unsubTickets?.();
    State._unsubTickets = ClassCare.DB.helpdesk_tickets.where('status', '==', 'Open').onSnapshot(snap => {
      $('#stat-tickets')?.replaceChildren(document.createTextNode(String(snap.size)));
    }, () => $('#stat-tickets')?.replaceChildren(document.createTextNode('Unavailable')));`);
const dailyStart = admin.indexOf('    if (forceRefresh || !dailyCache.has(date))'), dailyEnd = admin.indexOf('\n    const dayRecords', dailyStart);
admin = admin.slice(0,dailyStart) + `    if (State._dailyDate !== date) {
      State._unsubDaily?.(); State._dailyDate = date;
      State._unsubDaily = ClassCare.DB.attendance.where('date', '==', date).onSnapshot(snap => {
        const records = new Map();
        snap.forEach(doc => { const d = { ...doc.data(), id: doc.id }; if (d.student_uid) records.set(d.student_uid, d); });
        dailyCache.set(date, records); renderDailyAttendanceLog();
      }, error => { tbody.textContent = 'Attendance unavailable: ' + error.message; });
    }
` + admin.slice(dailyEnd);
// Tear down per-account listeners, including when signing out in a different tab.
admin = admin.replace('    if (!user) return showGuest();', `    if (!user || user.__profileError || user.role !== 'admin') {
      ['_unsubUsers','_unsubAttendance','_unsubTickets','_unsubDaily','unsubscribeConcerns','unsubscribeReferrals'].forEach(key => { State[key]?.(); State[key] = null; });
      State.initialized = false; State.students.clear(); State.attendance.clear(); State._dailyDate = null;
    }
    if (!user) return showGuest();`);
write('admin/dashboard.js', admin);
// Enrollment requests are a live administrative table.
let settings = read('admin/settings.js');
settings = settings.replace('  async function loadEnrollmentRequests() {', '  let stopEnrollmentRequests;\n  async function loadEnrollmentRequests() {');
settings = settings.replace('      const snap = await ClassCare.DB.enrollment_requests\r\n        .orderBy("submitted_at", "desc")\r\n        .limit(50)\r\n        .get();', '      stopEnrollmentRequests?.();\n      stopEnrollmentRequests = ClassCare.DB.enrollment_requests.onSnapshot(snap => {');
const catchPos = settings.indexOf('    } catch (err) {', settings.indexOf('  async function loadEnrollmentRequests'));
if (!settings.includes('stopEnrollmentRequests = ClassCare.DB')) throw Error('Settings query target missing');
settings = settings.slice(0,catchPos) + `      }, error => { tbody.textContent = 'Enrollment requests unavailable: ' + error.message; });\n` + settings.slice(catchPos);
write('admin/settings.js', settings);
console.log('Updated live identity, student attendance, administrative tables, missing-grade handling, and school timezone.');
