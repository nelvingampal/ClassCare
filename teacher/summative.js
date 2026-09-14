(function () {
  'use strict';
  const $ = id => document.getElementById(id), H = ClassCareHolistic, db = () => ClassCare.getFirebase().db;
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  let user, assessments = [], scores = new Map(), roster = [], stops = [], stopRoster, selected = '', generation = 0, saving = false;
  const drafts = new Map(), baseValues = new Map(), readiness = new Map();
  const say = text => { const el = $('score-status'); if (el) el.textContent = text; };
  const assessment = () => assessments.find(a => a.id === selected);
  const key = uid => `${selected}_${uid}`;
  function updateStats(a) {
    const statRoster = $('stat-roster-count');
    const statGraded = $('stat-graded-count');
    const statAvg = $('stat-average-score');
    const statAlerts = $('stat-care-alerts');
    if (!statRoster && !statGraded && !statAvg && !statAlerts) return;
    if (!a || !roster.length) {
      if (statRoster) statRoster.textContent = roster.length;
      if (statGraded) statGraded.textContent = '0';
      if (statAvg) statAvg.textContent = '—';
      if (statAlerts) statAlerts.textContent = '0';
      return;
    }
    let graded = 0, sumPercent = 0, belowCount = 0;
    roster.forEach(s => {
      const id = key(s.uid);
      const val = drafts.has(id) ? drafts.get(id) : scores.get(id)?.score;
      if (val !== undefined && val !== null && val !== '' && val !== 'invalid') {
        const p = H.percent(val, a.maxScore);
        if (p !== null) {
          graded++;
          sumPercent += p;
          if (p < a.thresholdPercent) belowCount++;
        }
      }
    });
    if (statRoster) statRoster.textContent = roster.length;
    if (statGraded) statGraded.textContent = `${graded} / ${roster.length}`;
    if (statAvg) statAvg.textContent = graded > 0 ? `${(sumPercent / graded).toFixed(1)}%` : '—';
    if (statAlerts) statAlerts.textContent = belowCount;
  }
  function listen(query, name, next) {
    return query.onSnapshot({ includeMetadataChanges: true }, snapshot => {
      readiness.set(name, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites);
      const liveEl = $('score-live');
      if (liveEl) liveEl.textContent = [...readiness.values()].every(Boolean) ? 'Live · confirmed by Firestore' : 'Connecting or showing cached / pending records';
      next(snapshot);
    }, error => { readiness.set(name, false); const liveEl = $('score-live'); if (liveEl) liveEl.textContent = `${name} unavailable`; say(`Cannot load ${name}: ${error.message}`); });
  }
  function renderAssessments() {
    const select = $('assessment-select');
    if (!select) return;
    select.replaceChildren(new Option('Choose an assessment', ''));
    assessments.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)).forEach(a => select.add(new Option(`${a.scheduledDate} · ${a.section} · ${a.subject} · ${a.title}`, a.id)));
    select.value = selected;
    if (selected && !assessment()) { selected = ''; drafts.clear(); select.value = ''; }
    renderGrid();
  }
  function renderGrid() {
    const a = assessment(), body = $('score-rows');
    if (!body) return;
    const activeUid = document.activeElement?.dataset.student;
    body.replaceChildren();
    const desc = $('score-description');
    if (desc) desc.textContent = a ? `${a.subject} · ${a.scheduledDate} · Out of ${a.maxScore} · Care threshold below ${a.thresholdPercent}%` : 'Select a scheduled assessment to load its section roster.';
    updateStats(a);
    if (!a) return;
    roster.forEach((s, i) => {
      const row = document.createElement('tr'), saved = scores.get(key(s.uid));
      if (i % 2 === 1) row.classList.add('cc-row-alt');
      [i + 1, ClassCareKioskData.name(s), s.student_id || '—'].forEach(value => { const cell = row.insertCell(); cell.textContent = value; });
      const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = a.maxScore; input.step = 'any';
      input.dataset.student = s.uid; input.dataset.dirty = String(drafts.has(key(s.uid))); input.disabled = saving;
      input.setAttribute('aria-label', `Score for ${ClassCareKioskData.name(s)}, out of ${a.maxScore}`);
      input.value = drafts.has(key(s.uid)) ? drafts.get(key(s.uid)) : (saved?.score ?? '');
      row.insertCell().append(input);
      const pctCell = row.insertCell();
      if (saved) {
        const pctVal = H.percent(saved.score, saved.maxScore);
        const pctStr = pctVal != null ? `${pctVal.toFixed(1)}%` : '—%';
        const isBelow = pctVal != null && pctVal < a.thresholdPercent;
        const badge = document.createElement('span');
        badge.className = `cc-badge ${isBelow ? 'cc-badge-alert' : 'cc-badge-pass'}`;
        badge.textContent = pctStr;
        pctCell.append(badge);
      } else {
        const badge = document.createElement('span');
        badge.className = 'cc-badge cc-badge-none';
        badge.textContent = 'Not recorded';
        pctCell.append(badge);
      }
      const stateCell = row.insertCell();
      const stateBadge = document.createElement('span');
      if (drafts.has(key(s.uid))) {
        stateBadge.className = 'cc-badge cc-badge-draft';
        stateBadge.textContent = 'Unsaved edit';
      } else if (saved) {
        stateBadge.className = 'cc-badge cc-badge-saved';
        stateBadge.textContent = 'Saved';
      } else {
        stateBadge.className = 'cc-badge cc-badge-none';
        stateBadge.textContent = 'Not recorded';
      }
      stateCell.append(stateBadge);
      input.oninput = () => {
        const id = key(s.uid);
        if (!drafts.has(id)) baseValues.set(id, scores.get(id)?.score ?? null);
        drafts.set(id, input.validity.badInput ? 'invalid' : input.value); input.dataset.dirty = 'true';
        stateBadge.className = 'cc-badge cc-badge-draft';
        stateBadge.textContent = 'Unsaved edit';
        input.setAttribute('aria-invalid', String(input.validity.badInput || (input.value !== '' && H.percent(input.value, a.maxScore) === null)));
        updateStats(a);
      };
      input.onkeydown = event => {
        if (['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault(); const inputs = [...body.querySelectorAll('input')];
          inputs[i + (event.key === 'ArrowUp' || event.shiftKey ? -1 : 1)]?.focus();
        }
      };
      input.onpaste = event => {
        const text = event.clipboardData.getData('text/plain'); if (!/[\r\n\t]/.test(text)) return;
        event.preventDefault();
        const values = text.trim().split(/\r?\n/);
        if (values.some(v => v.includes('\t')) || values.length > roster.length - i || values.some(v => v.trim() && H.percent(v.trim(), a.maxScore) === null)) return say('Paste one score column only, within the roster and assessment maximum. No cells changed.');
        const inputs = [...body.querySelectorAll('input')];
        values.forEach((value, offset) => { inputs[i + offset].value = value.trim(); inputs[i + offset].dispatchEvent(new Event('input')); });
        say(`${values.length} score cells pasted. Review and Save scores.`);
        updateStats(a);
      };
      body.append(row);
    });
    if (!roster.length) { const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 6; cell.textContent = 'No students found in this section.'; }
    if (activeUid) [...body.querySelectorAll('input')].find(input => input.dataset.student === activeUid)?.focus();
  }
  function selectAssessment() {
    const next = $('assessment-select').value;
    if (saving) { $('assessment-select').value = selected; return; }
    if (drafts.size) { $('assessment-select').value = selected; say('Save scores or discard edits before switching assessments.'); return; }
    selected = next; stopRoster?.(); roster = []; renderGrid();
    const a = assessment(); if (!a) return;
    stopRoster = listen(ClassCare.DB.users.where('section', '==', a.section), 'Roster', snapshot => {
      roster = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })).filter(s => String(s.role).toLowerCase() === 'student')
        .sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.trim().localeCompare(`${b.last_name || ""} ${b.first_name || ""}`.trim()));
      renderGrid();
    });
  }
  $('assessment-select').onchange = selectAssessment;
  $('discard-edits').onclick = () => { if (saving) return; drafts.clear(); baseValues.clear(); renderGrid(); say('Unsaved edits discarded. Showing saved scores.'); };
  $('assessment-form').onsubmit = async event => {
    event.preventDefault(); if (!user || saving) return;
    const values = new FormData(event.target), data = Object.fromEntries(values);
    data.title = data.title.trim(); data.subject = data.subject.trim(); data.maxScore = Number(data.maxScore); data.thresholdPercent = Number(data.thresholdPercent);
    if (!data.title || !data.subject || data.maxScore <= 0 || data.maxScore > 10000 || !Number.isFinite(data.thresholdPercent) || data.thresholdPercent < 0 || data.thresholdPercent > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(data.scheduledDate)) return say('Enter a title, subject, valid date, maximum score, and threshold from 0–100%.');
    if (!navigator.onLine) return say('Reconnect before publishing an assessment.');
    const button = $('publish-assessment'); button.disabled = true;
    try {
      const docRef = db().collection('summativeAssessments').doc();
      const batch = db().batch();
      batch.set(docRef,{ ...data, teacherId:user.uid,createdAt:stamp(),updatedAt:stamp() });
      // Requirement 2: Save notification to global notifications and scheduledTests collections
      const passingScore = Number(((data.maxScore * data.thresholdPercent) / 100).toFixed(1));
      const notifData = {
        type: 'summative_scheduled',
        assessmentId: docRef.id,
        title: data.title,
        subject: data.subject,
        section: data.section,
        scheduledDate: data.scheduledDate,
        maxScore: data.maxScore,
        passingScore: passingScore,
        thresholdPercent: data.thresholdPercent,
        teacherId: user.uid,
        teacherName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Teacher",
        message: `Upcoming Summative Test: ${data.title} (${data.subject}) scheduled for ${data.scheduledDate}. Passing score: ${passingScore.toFixed(0)}/${data.maxScore}.`,
        is_global: false,
        createdAt: stamp(),
        updatedAt: stamp()
      };
      batch.set(db().collection('notifications').doc(docRef.id),notifData);
      batch.set(db().collection('scheduledTests').doc(docRef.id),notifData);
      await batch.commit();

      say('Assessment published. Students in this section can see the schedule now.');
      if (typeof Toast !== 'undefined' && Toast.success) Toast.success('Assessment and in-app schedule saved.');
    } catch (error) { say(`Assessment not published: ${error.message}`); }
    finally { button.disabled = false; }
  };

  // Requirement 1: Holistic Correlation Engine
  async function runHolisticCorrelationCheck(savedEntries, a, currentRoster) {
    if (!user || !a || !savedEntries.length) return;
    const passingScore = (a.maxScore * a.thresholdPercent) / 100;
    const belowEntries = savedEntries.filter(([id, val]) => val !== '' && val !== 'invalid' && Number(val) < passingScore);
    if (!belowEntries.length) return;

    for (const [id, val] of belowEntries) {
      const s = currentRoster.find(item => key(item.uid) === id);
      if (!s || !s.uid) continue;
      const numericScore = Number(val);

      try {
        // A. Check student's recent Emotional Check-in
        let hasNegativeEmotion = false;
        let emotionFound = null;
        try {
          const emoSnap = await db().collection('emotional_checkins')
            .where('student_uid', '==', s.uid)
            .limit(10)
            .get();
          const emoDocs = emoSnap.docs.map(d => d.data() || {}).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
          const latestEmo = emoDocs[0];
          if (latestEmo) {
            const rawEmo = String(latestEmo.emotion || '').toLowerCase();
            const isNeg = latestEmo.is_negative === true
              || ['sad', 'not_good', 'not good', 'stressed', 'tired', 'down', 'lonely', 'anxious', 'scared', 'angry'].includes(rawEmo)
              || (Array.isArray(latestEmo.flags) && latestEmo.flags.some(f => ['not_good', 'stressed', 'needs_support', 'not_motivated'].includes(f)));
            if (isNeg) {
              hasNegativeEmotion = true;
              emotionFound = latestEmo.emotion_label || latestEmo.emotion || 'Negative';
            }
          }
        } catch (err) {
          console.warn('[correlation-engine] emotion query error:', err);
        }

        // B. Check student's consecutive absences
        let hasConsecutiveAbsences = false;
        let consecutiveCount = 0;
        try {
          const attSnap = await db().collection('attendance')
            .where('student_uid', '==', s.uid)
            .limit(15)
            .get();
          const attDocs = attSnap.docs.map(d => d.data() || {}).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
          for (const doc of attDocs) {
            const st = String(doc.status || '').toLowerCase();
            if (st === 'absent') {
              consecutiveCount++;
            } else if (st === 'present' || st === 'late') {
              break;
            }
          }
          if (consecutiveCount >= 2) {
            hasConsecutiveAbsences = true;
          }
        } catch (err) {
          console.warn('[correlation-engine] attendance query error:', err);
        }

        // C. The Logic Trigger:
        // IF (Student's Summative Score < Passing Score) AND (Recent Emotion == 'Sad'/'Not Good' OR consecutive absences)
        // THEN -> Auto-generate document in careAlerts collection
        if (hasNegativeEmotion || hasConsecutiveAbsences) {
          const studentName = ClassCareKioskData.name(s);
          const alertDocId = `${user.uid}_${s.uid}`;
          const triggerReason = `Summative Score (${numericScore}/${a.maxScore}) is below passing threshold (${passingScore.toFixed(0)}), correlated with ${hasNegativeEmotion ? 'recent negative emotional check-in ("' + emotionFound + '")' : 'consecutive absences (' + consecutiveCount + ' days absent)'}. Immediate academic and emotional support required.`;

          await db().collection('careAlerts').doc(alertDocId).set({
            teacherId: user.uid,
            studentId: s.uid,
            student_uid: s.uid,
            studentName: studentName,
            section: a.section,
            subject: a.subject,
            assessmentTitle: a.title,
            assessmentId: a.id,
            score: numericScore,
            maxScore: a.maxScore,
            passingScore: Number(passingScore.toFixed(1)),
            status: 'Open',
            priority: 'High',
            type: 'holistic_correlation',
            reason: triggerReason,
            recentEmotion: emotionFound || null,
            consecutiveAbsences: consecutiveCount || 0,
            updatedAt: stamp()
          });

          // Instant dashboard notification
          if (typeof Toast !== 'undefined' && Toast.warn) {
            Toast.warn(`🚨 Care Alert: ${studentName} scored ${numericScore}/${a.maxScore} (Failing) with ${hasNegativeEmotion ? 'negative emotion ("' + emotionFound + '")' : 'consecutive absences'}! Care alert generated.`);
          }
          if (typeof SoundFeedback !== 'undefined' && SoundFeedback.play) {
            SoundFeedback.play('tap');
          }
          if (window.BroadcastChannel) {
            const bc = new BroadcastChannel('classcare_attendance_sync');
            bc.postMessage({
              type: 'care_alert_created',
              studentId: s.uid,
              teacherId: user.uid,
              studentName: studentName,
              reason: triggerReason
            });
            bc.close();
          }
        }
      } catch (err) {
        console.warn('[correlation-engine] error for student', s.uid, err);
      }
    }
  }

  $('save-scores').onclick = async () => {
    if (saving || !drafts.size || !assessment()) return;
    if (!navigator.onLine || ![...readiness.values()].every(Boolean)) return say('Wait for live records before saving scores.');
    const a = assessment(), entries = [...drafts.entries()], ids = new Set(roster.map(s => key(s.uid)));
    if (entries.length > 200) return say('Save at most 200 changed rows at a time.');
    if (entries.some(([id, value]) => !ids.has(id) || (value !== '' && H.percent(value, a.maxScore) === null))) return say('Correct invalid scores or discard edits for students who moved sections. Nothing was saved.');
    const token = generation; saving = true; renderGrid(); $('save-scores').disabled = true;
    try {
      // A transaction gets one roster profile per row in the security rules.
      // Keep chunks below Firestore's 20 rule-document-access limit.
      for (let offset = 0; offset < entries.length; offset += 5) {
        const chunk = entries.slice(offset, offset + 5);
        await db().runTransaction(async tx => {
        const refs = chunk.map(([id]) => db().collection('summativeScores').doc(id));
        const current = await Promise.all(refs.map(ref => tx.get(ref)));
        if (token !== generation) throw new Error('Your session changed. Reload before saving.');
        current.forEach((doc, i) => {
          if ((doc.exists ? doc.data().score : null) !== baseValues.get(chunk[i][0])) throw new Error('A score was changed in another session. Discard edits to load the latest scores, then re-enter your changes.');
        });
        chunk.forEach(([id, value], i) => {
          if (value === '') { if (current[i].exists) tx.delete(refs[i]); return; }
          const s = roster.find(s => key(s.uid) === id);
          tx.set(refs[i], { assessmentId: a.id, studentId: s.uid, student_uid: s.uid, teacherId: user.uid, section: a.section,
            score: Number(value), maxScore: a.maxScore, thresholdPercent: a.thresholdPercent, assessmentDate: a.scheduledDate,
            subject: a.subject, updatedAt: stamp() });
        });
        });
        chunk.forEach(([id]) => { drafts.delete(id); baseValues.delete(id); });
      }
      say(`${entries.length} score changes saved.`);

      // Trigger the Holistic Correlation Engine in background
      runHolisticCorrelationCheck(entries, a, roster).catch(err => console.warn('[correlation-engine] execution warning:', err));
    } catch (error) { say(`Save stopped: ${error.message} ${drafts.size} unsaved edits remain; completed rows are already saved.`); }
    finally { saving = false; $('save-scores').disabled = false; renderGrid(); }
  };
  function cleanup() { stops.forEach(stop => stop()); stops = []; stopRoster?.(); stopRoster = null; generation++; }
  const stopAuth = ClassCare.onCurrentUser(next => {
    cleanup(); drafts.clear(); baseValues.clear(); readiness.clear(); selected = ''; scores.clear(); roster = []; assessments = [];
    if (next && !['teacher', 'admin'].includes(next.role)) {
      try { Toast.warn("Summative scores workspace is for teachers and IT administration."); } catch (_) {}
      setTimeout(() => location.replace("../index.html"), 700);
      return;
    }
    user = next && !next.__profileError && ['teacher', 'admin'].includes(next.role) && !next.disabled && (next.role === 'admin' || next.pending_approval === false) ? next : null;
    if ($('summative-content')) $('summative-content').hidden = !user;
    if ($('auth-required')) $('auth-required').hidden = !!user;
    if (!user) return;
    const sectionSelect = $('assessment-section');
    if (sectionSelect) {
      sectionSelect.replaceChildren();
      const userSections = [user.section, ...(user.assigned_sections || [])];
      if (Array.isArray(user.teaching_assignments)) {
        user.teaching_assignments.forEach(a => {
          const s = typeof a === "object" ? a?.section : a;
          if (s) userSections.push(s);
        });
      }
      if (window.TeacherScannerState?.sections) {
        const secSet = window.TeacherScannerState.sections;
        (secSet instanceof Set ? Array.from(secSet) : (Array.isArray(secSet) ? secSet : [])).forEach(s => userSections.push(s));
      }
      [...new Set(userSections.filter(Boolean))].forEach(section => sectionSelect.add(new Option(section, section)));
      if (user.role === 'admin') stops.push(listen(ClassCare.DB.users, 'Sections', snap => {
        const old = sectionSelect.value; sectionSelect.replaceChildren();
        [...new Set(snap.docs.map(d => d.data().section).filter(Boolean))].sort().forEach(section => sectionSelect.add(new Option(section, section)));
        if ([...sectionSelect.options].some(o => o.value === old)) sectionSelect.value = old;
      }));
    }
    stops.push(listen(db().collection('summativeAssessments').where('teacherId', '==', user.uid), 'Assessments', snap => { assessments = snap.docs.map(d => ({ ...d.data(), id: d.id })); renderAssessments(); }));
    stops.push(listen(db().collection('summativeScores').where('teacherId', '==', user.uid), 'Scores', snap => { scores = new Map(snap.docs.map(d => [d.id, d.data()])); renderGrid(); }));
    if ($('assessment-date')) $('assessment-date').value = H.schoolDate();
  });
  window.addEventListener('beforeunload', event => { if (drafts.size) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { cleanup(); stopAuth(); });
})();
