/* Real-time schedule, score, and care surfaces for the existing portals. */
(function () {
  'use strict';
  const H = ClassCareHolistic, db = () => ClassCare.getFirebase().db;
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  let stops = [], generation = 0, timer, root;
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
  function cleanup() { generation++; stops.forEach(stop => stop()); stops = []; clearInterval(timer); root?.remove(); root = null; }
  function mount(title) {
    const host = document.getElementById('view-dashboard') || document.getElementById('summative-content');
    if (!host) return null;
    root = node('section', null, 'cc-card'); root.id = 'holistic-live'; root.append(node('h2', title)); host.prepend(root); return root;
  }
  function studentView(user) {
    const card = mount('Summative assessments'); if (!card) return;
    const state = node('p', 'Connecting…', 'cc-live'), list = node('div'); card.append(state, list);
    let assessments = [], scores = [], readiness = new Map();
    function render() {
      list.replaceChildren(); state.textContent = [...readiness.values()].every(Boolean) && readiness.size === 2 ? 'Live · confirmed by Firestore' : 'Connecting or showing cached / pending records';
      const table = node('table', null, 'cc-grid'), head = table.createTHead().insertRow();
      ['Date', 'Assessment', 'Subject', 'Score'].forEach(label => head.append(node('th', label)));
      const body = table.createTBody(), scoreMap = new Map(scores.map(s => [s.assessmentId, s]));
      const all = new Map(assessments.map(a => [a.id, a]));
      // Preserve a student's historical scores after they move sections.
      scores.forEach(s => { if (!all.has(s.assessmentId)) all.set(s.assessmentId, { id: s.assessmentId, scheduledDate: s.assessmentDate, subject: s.subject, title: 'Previous section assessment' }); });
      [...all.values()].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)).forEach(a => {
        const score = scoreMap.get(a.id), row = body.insertRow();
        [a.scheduledDate, a.title, a.subject, score ? `${score.score} / ${score.maxScore} (${H.percent(score.score, score.maxScore)?.toFixed(1) ?? '—'}%)` : 'Not graded'].forEach(value => row.insertCell().textContent = value);
      });
      if (!all.size) list.append(node('p', user.section ? 'No summative assessments scheduled yet.' : 'Your section has not been assigned yet.'));
      else { const wrap = node('div', null, 'cc-table-wrap'); wrap.append(table); list.append(wrap); }
    }
    const listen = (query, name, next) => stops.push(query.onSnapshot({ includeMetadataChanges: true }, snapshot => {
      readiness.set(name, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites); next(snapshot.docs.map(d => ({ ...d.data(), id: d.id }))); render();
    }, error => { readiness.set(name, false); state.textContent = `${name} unavailable: ${error.message}`; list.replaceChildren(); }));
    readiness.set('Schedules', false); readiness.set('Scores', false);
    if (user.section) listen(db().collection('summativeAssessments').where('section', '==', user.section), 'Schedules', rows => { assessments = rows; });
    else readiness.set('Schedules', true);
    listen(db().collection('summativeScores').where('studentId', '==', user.uid), 'Scores', rows => { scores = rows; });
  }
  function staffView(user) {
    const card = mount('Holistic Care Alerts'); if (!card) return;
    const intro = node('p', 'Recent summative performance below its threshold, combined with a negative emotional flag in the last 14 days.');
    const state = node('p', 'Connecting…', 'cc-live'), list = node('div'); list.setAttribute('aria-live', 'polite');
    card.append(intro, state, list);
    const token = generation, data = {}, ready = new Map(); let running = false, revision = 0, evaluated = -1;
    const ownScores = db().collection('summativeScores').where('teacherId', '==', user.uid);
    const ownAlerts = db().collection('careAlerts').where('teacherId', '==', user.uid);
    const names = () => new Map((data.users || []).map(s => [s.id, `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.student_id || 'Student']));
    function render() {
      const students = names(); list.replaceChildren();
      const rows = (data.alerts || []).filter(a => a.status !== 'Resolved');
      const openCount = rows.filter(a => a.status === 'Open').length;
      const totalCount = rows.length;

      // Dispatch live data for listeners without clobbering teacher scanner DOM elements

      if (!rows.length) list.append(node('p', 'No active holistic care alerts.'));
      rows.forEach(alert => {
        const item = node('article', null, 'cc-alert');
        item.append(node('strong', `Intervention Needed: ${students.get(alert.studentId) || alert.studentName || 'Student'} has low performance and recent negative emotional flags.`));
        item.append(node('p', `${alert.section || ''} · ${alert.status}`));
        (alert.evidence || []).forEach(e => item.append(node('p', `${e.date}: ${e.score}/${e.maxScore}, below ${e.thresholdPercent}% threshold.`)));
        if (alert.status === 'Open') {
          const button = node('button', 'Acknowledge', 'btn btn-secondary'); button.type = 'button';
          button.onclick = async () => {
            button.disabled = true;
            try { await db().collection('careAlerts').doc(alert.id).update({ status: 'Acknowledged', updatedAt: stamp() }); }
            catch (error) { state.textContent = `Could not acknowledge: ${error.message}`; button.disabled = false; }
          };
          // Admins observe other teachers' alerts; their owner acknowledges them.
          if (alert.teacherId === user.uid) item.append(button);
        }
        list.append(item);
      });
    }
    async function evaluate() {
      if (running || token !== generation || !navigator.onLine || ready.size < 5 || ![...ready.values()].every(Boolean)) return;
      running = true;
      try {
        while (evaluated !== revision && token === generation && [...ready.values()].every(Boolean)) {
          evaluated = revision;
          const students = names(), targets = H.correlate(data.scores || [], [...(data.checks || []), ...(data.attendance || [])], H.schoolDate());
          const existing = (data.alerts || []).filter(a => a.teacherId === user.uid);
          const uids = new Set([...targets.keys(), ...existing.filter(a => a.status !== 'Resolved').map(a => a.studentId)]);
          for (const uid of uids) {
            if (token !== generation) return;
            const target = targets.get(uid), ref = db().collection('careAlerts').doc(`${user.uid}_${uid}`);
            await db().runTransaction(async tx => {
              const snap = await tx.get(ref); if (token !== generation) return;
              const old = snap.exists ? snap.data() : null;
              if (!target) { if (old && old.status !== 'Resolved') tx.update(ref, { status: 'Resolved', updatedAt: stamp() }); return; }
              if (old && old.fingerprint === target.fingerprint && old.status !== 'Resolved') return;
              tx.set(ref, { ...target, studentName: students.get(uid) || 'Student', status: 'Open',
                reason: 'Low summative performance and recent negative emotional flags', createdAt: old?.createdAt || stamp(), updatedAt: stamp() });
            });
          }
        }
      } catch (error) { state.textContent = `Care engine needs attention: ${error.message}. It will retry when records reconnect.`; evaluated = -1; }
      finally { running = false; }
    }
    const listen = (query, name, affectsEngine = true) => {
      ready.set(name, false);
      stops.push(query.onSnapshot({ includeMetadataChanges: true }, snapshot => {
        if (token !== generation) return;
        ready.set(name, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
        data[name] = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        state.textContent = [...ready.values()].every(Boolean) ? 'Live · correlation listener active in this staff session' : 'Waiting for confirmed records; correlation paused';
        render();
        window.dispatchEvent(new CustomEvent('classcare:live-data', { detail: data }));
        if (affectsEngine) revision++; void evaluate();
      }, error => { ready.set(name, false); state.textContent = `${name} unavailable: ${error.message}. Correlation paused.`; }));
    };
    listen(ownScores, 'scores');
    const cutoff = H.schoolDate(new Date(Date.now() - 14 * 86400000));
    listen(ClassCare.DB.emotional_checkins.where('date', '>=', cutoff), 'checks');
    listen(ClassCare.DB.attendance.where('date', '>=', cutoff), 'attendance');
    listen(ClassCare.DB.users, 'users');
    listen(ClassCare.DB.grades, 'grades', false);
    listen(user.role === 'admin' ? db().collection('careAlerts') : ownAlerts, 'alerts', false);
    timer = setInterval(() => { revision++; void evaluate(); }, 60000); // Expire old evidence even if no document changes.
  }
  const stopAuth = ClassCare.onCurrentUser(user => {
    cleanup(); if (!user || user.__profileError) return;
    if (user.role === 'student') studentView(user);
    else if (['teacher', 'admin'].includes(user.role)) staffView(user);
  });
  window.addEventListener('pagehide', () => { cleanup(); stopAuth(); });
})();
