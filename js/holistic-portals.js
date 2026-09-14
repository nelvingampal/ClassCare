/* Real-time schedule, score, and care surfaces for the existing portals. */
(function () {
  'use strict';
  const H = ClassCareHolistic, db = () => ClassCare.getFirebase().db;
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  let stops = [], generation = 0, timer, root;
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
  function cleanup() { generation++; stops.forEach(stop => stop()); stops = []; clearInterval(timer); root?.remove(); root = null; }
  function mount(title) {
    const host = document.getElementById('teacher-care-alerts') || document.getElementById('summative-content') || document.getElementById('view-dashboard');
    if (!host) return null;
    root = node('section', null, 'cc-card'); root.id = 'holistic-live'; root.append(node('h2', title)); host.prepend(root); return root;
  }
  function syncOverviewStatus(title, detail) {
    const status = document.getElementById('overview-care-status');
    const copy = document.getElementById('overview-care-status-detail');
    if (status) status.textContent = title;
    if (copy) copy.textContent = detail;
  }
  function studentView(user) {
    const card = mount('Assessment schedule'); if (!card) return;
    const state = node('p', 'Connecting…', 'cc-live'), list = node('div'); card.append(state, list);
    if (!user.section) { state.textContent = 'Your section has not been assigned yet.'; return; }
    stops.push(ClassCare.collection('summativeAssessments').where('section','==',user.section).onSnapshot({includeMetadataChanges:true}, snap => {
      state.textContent = snap.metadata.fromCache ? 'Cached schedule' : 'Assessment schedule'; list.replaceChildren();
      snap.docs.map(d => d.data()).sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).forEach(a => {
        list.append(node('p', a.scheduledDate + ' · ' + a.subject + ' · ' + a.title));
      });
      if (snap.empty) list.append(node('p','No assessments scheduled yet.'));
    }, () => { state.textContent = 'Schedule unavailable. Please reconnect and try again.'; }));
  }
  function staffView(user) {
    const card = mount('Holistic Care Alerts'); if (!card) return;
    const intro = node('p', 'Recent summative performance below its threshold, combined with a negative emotional flag in the last 14 days.');
    const state = node('p', 'Connecting…', 'cc-live'), list = node('div'); list.setAttribute('aria-live', 'polite');
    card.append(intro, state, list);
    const token = generation, data = {}, ready = new Map(), failures = new Set();
    const ownScores = ClassCare.collection('summativeScores').where('teacherId', '==', user.uid);
    const ownAlerts = ClassCare.collection('careAlerts').where('teacherId', '==', user.uid);
    const names = () => new Map((data.users || []).map(s => [s.id, `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.student_id || 'Student']));
    function render() {
      const students = names(); list.replaceChildren();
      const rows = (data.alerts || []).filter(a => a.status !== 'Resolved');
      if (failures.size) syncOverviewStatus('Care alerts unavailable', 'Reconnect before treating the current alert state as confirmed.');
      else if (ready.size < 6 || ![...ready.values()].every(Boolean)) syncOverviewStatus('Care alerts awaiting confirmed records', 'Open Care Alerts for the current connection status.');
      else syncOverviewStatus(
        rows.length ? `${rows.length} holistic care alert${rows.length === 1 ? ' needs' : 's need'} review` : 'No active holistic care alerts',
        rows.length ? 'Open Care Alerts to review the evidence and available actions.' : 'Open Care Alerts to review confirmed records and student requests.'
      );

      // Dispatch live data for listeners without clobbering teacher scanner DOM elements

      if (!rows.length) list.append(node('p', failures.size
        ? 'Care alerts unavailable. Reconnect before checking for active alerts.'
        : ready.size < 6 || ![...ready.values()].every(Boolean)
          ? 'Waiting for confirmed records before checking for active alerts.'
          : 'No active holistic care alerts.'));
      rows.forEach(alert => {
        const item = node('article', null, 'cc-alert');
        item.append(node('strong', `Intervention Needed: ${students.get(alert.studentId) || alert.studentName || 'Student'} has low performance and recent negative emotional flags.`));
        item.append(node('p', `${alert.section || ''} · ${alert.status}`));
        if (alert.reason) item.append(node('p', alert.reason));
        (alert.evidence || []).forEach(e => item.append(node('p', `${e.date}: ${e.score}/${e.maxScore}, below ${e.thresholdPercent}% threshold.`)));
        if (alert.status === 'Open') {
          const button = node('button', 'Acknowledge', 'btn btn-secondary'); button.type = 'button';
          button.onclick = async () => {
            button.disabled = true;
            try { await ClassCare.collection('careAlerts').doc(alert.id).update({ status: 'Acknowledged', updatedAt: stamp() }); }
            catch (error) { state.textContent = `Could not acknowledge: ${error.message}`; button.disabled = false; }
          };
          // Admins observe other teachers' alerts; their owner acknowledges them.
          if (alert.teacherId === user.uid) item.append(button);
        }
        list.append(item);
      });
    }
    const listen = (query, name) => {
      ready.set(name, false);
      stops.push(query.onSnapshot({ includeMetadataChanges: true }, snapshot => {
        if (token !== generation) return;
        failures.delete(name);
        ready.set(name, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
        data[name] = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        const confirmed = [...ready.values()].every(Boolean);
        state.textContent = confirmed ? 'Live · care alerts monitoring active' : 'Waiting for confirmed records; correlation paused';
        render();
        window.dispatchEvent(new CustomEvent('classcare:live-data', { detail: data }));
      }, error => { if (token !== generation) return; failures.add(name); ready.set(name, false); state.textContent = `${name} unavailable: ${error.message}. Correlation paused.`; render(); }));
    };
    listen(ownScores, 'scores');
    const cutoff = H.schoolDate(new Date(Date.now() - 14 * 86400000));
    listen(ClassCare.DB.emotional_checkins.where('date', '>=', cutoff), 'checks');
    listen(ClassCare.DB.attendance.where('date', '>=', cutoff), 'attendance');
    listen(ClassCare.DB.users, 'users');
    listen(ClassCare.DB.grades, 'grades');
    listen(user.role === 'admin' ? ClassCare.collection('careAlerts') : ownAlerts, 'alerts');
  }
  const stopAuth = ClassCare.onCurrentUser(user => {
    cleanup(); if (!user || user.__profileError || user.disabled || (user.role === 'teacher' && user.pending_approval !== false)) return;
    if (user.role === 'student') studentView(user);
    else if (['teacher', 'admin'].includes(user.role)) staffView(user);
  });
  window.addEventListener('pagehide', () => { cleanup(); stopAuth(); });
})();
