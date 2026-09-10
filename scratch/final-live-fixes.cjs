const fs = require('node:fs');
const read = p => fs.readFileSync(p, 'utf8'), write = (p, s) => fs.writeFileSync(p, s);
let settings = read('admin/settings.js');
settings = settings.replace('  async function loadEnrollmentRequests() {', '  let stopEnrollmentRequests;\n  async function loadEnrollmentRequests() {');
settings = settings.replace(/      const snap = await ClassCare\.DB\.enrollment_requests\s*\.orderBy\("submitted_at", "desc"\)\s*\.limit\(50\)\s*\.get\(\);/, '      stopEnrollmentRequests?.();\n      stopEnrollmentRequests = ClassCare.DB.enrollment_requests.onSnapshot(snap => {');
const c = settings.indexOf('    } catch (err) {', settings.indexOf('  async function loadEnrollmentRequests'));
if (!settings.includes('stopEnrollmentRequests = ClassCare.DB')) throw Error('Query target missing');
settings = settings.slice(0,c) + `      }, error => { tbody.textContent = 'Enrollment requests unavailable: ' + error.message; });\n` + settings.slice(c);
settings = settings.replace('})();', `  ClassCare.onCurrentUser(user => { if (!user || user.role !== 'admin') { stopEnrollmentRequests?.(); stopEnrollmentRequests = null; } });\n})();`);
write('admin/settings.js', settings);
let scanner = read('teacher/scanner.js');
const a = scanner.indexOf('  async function evaluateStudentIntervention'), b = scanner.indexOf('  function renderEmotionReport', a);
scanner = scanner.slice(0,a) + `  function evaluateStudentIntervention(student, today) {
    const uid = student.uid, row = document.querySelector('[data-intervention-row="' + CSS.escape(uid) + '"]');
    const emoCell = document.querySelector('[data-emo-cell="' + CSS.escape(uid) + '"]');
    const flagCell = document.querySelector('[data-flag-cell="' + CSS.escape(uid) + '"]');
    const emotion = State.intervention.emotionCache.get(uid);
    if (emoCell) emoCell.textContent = emotion?.emotion ? (emotion.label || emotion.emotion) + ' · ' + emotion.date : 'Not recorded';
    const triggered = State.holisticAlerts?.has(uid);
    row?.classList.toggle('is-flagged', !!triggered);
    if (flagCell) flagCell.textContent = triggered ? 'Intervention Needed' : 'No holistic alert';
  }

` + scanner.slice(b);
scanner = scanner.replace('// Summative correlation is maintained by holistic-portals.js.', 'list.forEach(student => evaluateStudentIntervention(student, today));');
const handle = scanner.indexOf('  async function handleDecodedText'), lookup = scanner.indexOf('    State.wellbeing.active = true;', handle);
scanner = scanner.slice(0,handle) + `  async function handleDecodedText(raw) {
    let student;
    try { student = await ClassCareKioskData.lookup(raw, State.teacher); }
    catch (error) { showResultError('Cannot scan student', error.message); await resumeQRScanner(); return; }
` + scanner.slice(lookup);
scanner = scanner.replace('section: sectionValue(data.section)', 'section: data.section || ""');
scanner = scanner.replace('  function showGuest(message = "") {', '  function showGuest(message = "") {\n    cleanupScanner(); State.generation++; State.students.clear(); State.attendance.clear(); State.teacher = null;');
scanner = scanner.replace('    const generation = ++State.generation;', '    cleanupScanner();\n    const generation = ++State.generation;');
scanner = scanner.replace('      ClassCare.DB.settings.onSnapshot(doc => {', '      State._unsubSettings = ClassCare.DB.settings.onSnapshot(doc => {');
scanner = scanner.replace('  function cleanupScanner() {', `  function cleanupScanner() {
    State._unsubSettings?.(); State._unsubSettings = null;
    State._unsubEnrollments?.(); State._unsubEnrollments = null;
    State.intervention.unsubAlerts?.(); State.intervention.unsubAlerts = null;
    if (typeof TeacherCareState !== 'undefined') { TeacherCareState.unsubEmotional?.(); TeacherCareState.unsubConcerns?.(); }
    if (typeof _unsubTalkToSomeone !== 'undefined') _unsubTalkToSomeone?.();`);
scanner = scanner.replace('.limit(500)', '');
scanner = scanner.replace('  window.TeacherScannerState = State;', `  window.addEventListener('classcare:live-data', event => {
    const data = event.detail;
    if (data.grades) {
      State.intervention.gradeCache.clear(); ClassCare.DB._gradeCache.clear();
      State.students.forEach(student => {
        const grades = data.grades.filter(g => g.student_uid === student.uid).flatMap(g => [g.term1,g.term2,g.term3,g.term4]).filter(v => v != null && v !== '').map(Number).filter(Number.isFinite);
        const average = grades.length ? grades.reduce((a,b) => a+b,0)/grades.length : null;
        State.intervention.gradeCache.set(student.uid, { average });
      });
    }
    if (data.checks) {
      State.intervention.emotionCache.clear();
      [...data.checks, ...(data.attendance || [])].sort((a,b) => String(a.date).localeCompare(String(b.date))).forEach(c => {
        if (c.student_uid && c.emotion) State.intervention.emotionCache.set(c.student_uid, { emotion:c.emotion, label:c.emotion_label || c.emotion, emoji:c.emotion_emoji || '', date:c.date });
      });
    }
    if (data.users) ClassCare.DB._studentProfileCache.clear();
    State.holisticAlerts = new Set((data.alerts || []).filter(a => a.status !== 'Resolved').map(a => a.studentId));
    renderAttendanceTable();
  });
  window.TeacherScannerState = State;`);
write('teacher/scanner.js', scanner);
// Remove the index-dependent fallback that could display an arbitrary subset of emotional history.
let emotion = read('student/emotional-checkin.js');
const e1 = emotion.indexOf('  function startTimelineListener()'), e2 = emotion.indexOf('  function renderCheckinPanel', e1);
emotion = emotion.slice(0,e1) + `  function startTimelineListener() {
    if (!cachedUser) return;
    _unsubTimeline = ClassCare.DB.emotional_checkins.where('student_uid','==',cachedUser.uid).onSnapshot(snap => {
      const now = new Date(); now.setDate(now.getDate()-13);
      const cutoff = ClassCareHolistic.schoolDate(now);
      _recentCheckins = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(c => c.date >= cutoff)
        .sort((a,b) => String(b.date).localeCompare(String(a.date)) || ((b.created_at?.seconds || b.submitted_at?.seconds || 0) - (a.created_at?.seconds || a.submitted_at?.seconds || 0)));
      renderTimeline();
    }, error => { _recentCheckins = []; renderTimeline(); Toast.error('Emotional history unavailable: ' + error.message); });
  }

` + emotion.slice(e2);
const optimistic = emotion.indexOf('    // Immediate UI feedback'), tryStart = emotion.indexOf('    try {', optimistic);
if (optimistic >= 0) emotion = emotion.slice(0,optimistic) + emotion.slice(tryStart);
const alertStart = emotion.indexOf('      if (norm.is_negative &&'), alertEnd = emotion.indexOf('    } catch (err)', alertStart);
if (alertStart >= 0) emotion = emotion.slice(0,alertStart) + emotion.slice(alertEnd);
const catchStart = emotion.indexOf('    } catch (err)', emotion.indexOf('await ClassCare.DB.emotional_checkins.doc(docId).set(payload'));
const catchEnd = emotion.indexOf('\n  // ', catchStart);
if (catchStart >= 0 && catchEnd > catchStart) emotion = emotion.slice(0,catchStart) + `    } catch (err) {
      Toast.error('Feeling not saved: ' + err.message + '. Please try again.');
    }
  }
` + emotion.slice(catchEnd);
write('student/emotional-checkin.js', emotion);
// Avoid loading the same shared core twice on the teacher page.
let html = read('teacher/index.html');
const core = '<script src="../js/holistic-core.js" defer></script>';
const second = html.indexOf(core, html.indexOf(core)+core.length); if (second >= 0) html = html.slice(0,second) + html.slice(second+core.length);
write('teacher/index.html', html);
console.log('Completed live dashboard joins and removed stale emotional fallbacks.');
