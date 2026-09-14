(function () {
  'use strict';
  const H = ClassCareHolistic;
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  const name = student => `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.student_id || 'Student';

  function normalizeSectionStr(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_–—-]+/g, ' ');
  }

  function sectionMatches(secA, secB) {
    const a = normalizeSectionStr(secA);
    const b = normalizeSectionStr(secB);
    if (!a || !b) return false;
    if (a === b) return true;
    const cleanA = a.replace(/[^a-z0-9]/g, '');
    const cleanB = b.replace(/[^a-z0-9]/g, '');
    if (!cleanA || !cleanB) return false;
    if (cleanA === cleanB) return true;
    if (cleanA.length >= 3 && cleanB.length >= 3) {
      if (cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) return true;
    }
    return false;
  }

  function canScanSync(user, student) {
    return !!user && !user.disabled && !!student && (user.role === 'admin' || (user.role === 'teacher' && user.pending_approval === false));
  }
  async function canScan(user, student) {
    if (canScanSync(user, student)) return true;
    try {
      const auth = ClassCare?.getFirebase?.()?.auth;
      const currentUser = typeof auth === 'function' ? auth().currentUser : auth?.currentUser;
      if (currentUser?.uid) {
        let snap = null;
        try {
          snap = await ClassCare.DB.users.doc(currentUser.uid).get({ source: 'server' });
        } catch (_) {
          snap = await ClassCare.DB.users.doc(currentUser.uid).get().catch(() => null);
        }
        if (snap?.exists) {
          const u = { ...snap.data(), uid: currentUser.uid };
          if (canScanSync(u, student)) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  async function lookup(raw, user) {
    let uid, sid;
    const text = String(raw || '').trim();
    if (!text || text.length > 2048) throw new Error('Enter or scan a valid student ID.');
    try {
      const data = JSON.parse(text);
      uid = data.uid || data.student_uid || data.user_id || data.id;
      sid = data.sid || data.student_id;
    } catch (_) {
      sid = text;
      uid = text;
    }
    let doc;
    if (typeof uid === 'string' && !uid.includes('/')) {
      try {
        const direct = await ClassCare.DB.users.doc(uid).get({ source: 'server' });
        if (direct.exists) doc = direct;
      } catch (_) {
        const cached = await ClassCare.DB.users.doc(uid).get().catch(() => null);
        if (cached?.exists) doc = cached;
      }
    }
    if (!doc && typeof sid === 'string') {
      try {
        const query = await ClassCare.DB.users.where('role', '==', 'student').where('student_id', '==', sid).limit(2).get({ source: 'server' });
        if (query.size > 1) throw new Error('This ID is assigned to multiple profiles. Ask administration to correct it.');
        if (!query.empty) doc = query.docs[0];
      } catch (err) {
        if (err.message && err.message.includes('multiple profiles')) throw err;
        const query = await ClassCare.DB.users.where('role', '==', 'student').where('student_id', '==', sid).limit(2).get().catch(() => null);
        if (query && !query.empty) doc = query.docs[0];
      }
    }

    let student = doc ? { ...doc.data(), uid: doc.id } : null;
    if (!student && typeof window !== 'undefined' && window.State?.students) {
      if (uid && window.State.students.has(uid)) student = window.State.students.get(uid);
      else if (sid) {
        for (const s of window.State.students.values()) {
          if (s.student_id === sid) { student = s; break; }
        }
      }
    }

    if (!student || String(student.role).toLowerCase() !== 'student') throw new Error('Student ID was not found.');
    if (sid && sid !== text && student.student_id && student.student_id !== sid) throw new Error('QR student ID does not match the profile.');
    if (student.disabled) throw new Error('Student account has been disabled.');
    if (student.pending_approval === true || student.enrollment_status === 'pending' || !student.section) {
      throw new Error('Student account is pending administrator approval. Please approve the student and assign a section in the Admin portal first.');
    }
    if (!(await canScan(user, student))) throw new Error('Approved staff access is required.');
    return student;
  }

  async function saveAttendance(student, user, mood, settings = {}, assignment = null) {
    if (!navigator.onLine) throw new Error('You are offline. Reconnect and retry; attendance has not been saved.');
    if (!user) {
      try {
        const auth = ClassCare?.getFirebase?.()?.auth;
        const currentUser = typeof auth === 'function' ? auth().currentUser : auth?.currentUser;
        if (currentUser?.uid) {
          const snap = await ClassCare.DB.users.doc(currentUser.uid).get().catch(() => null);
          if (snap?.exists) user = { ...snap.data(), uid: currentUser.uid };
        }
      } catch (_) {}
    }
    if (!(await canScan(user, student))) throw new Error('Approved staff access is required.');
    const emotion = H.MOODS.find(m => m.key === mood);
    if (mood !== null && !emotion) throw new Error('Choose a mood or skip the optional check-in.');
    const date = H.schoolDate(), time = H.schoolTime();
    const ref = ClassCare.DB.attendance.doc(ClassCare.DB.attendanceDocId(student.uid, date));
    return ClassCare.getFirebase().db.runTransaction(async tx => {
      const existing = await tx.get(ref);
      const old = existing.exists ? existing.data() : null;
      const evaluation = Utils.computeHierarchicalAttendance(time, settings, assignment, old);
      if (old?.time_in) {
        if (evaluation.action === 'time_out' && !old.time_out) {
          tx.update(ref, { studentId: student.uid, time_out: time, time_out_scanned_by: user?.uid || '', time_out_scanned_at: stamp() });
          return { record: { ...old, time_out: time }, kind: 'time_out' };
        }
        return { record: old, kind: 'duplicate' };
      }
      const record = {
        studentId: student.uid,
        student_uid: student.uid,
        student_id: student.student_id || '',
        student_name: name(student),
        photo_data: student.photo_data || '',
        section: student.section || '',
        date,
        time_in: time,
        status: evaluation.status,
        minutes_late: evaluation.minutes_late || 0,
        scanned_by: user.uid,
        recorded_via: 'attendance_kiosk', checkin_skipped: mood === null,
        emotion: mood,
        mood,
        emotion_label: emotion?.label || 'Not provided',
        emotion_emoji: emotion?.emoji || '',
        is_negative: !!emotion?.negative,
        subject: assignment?.subject || '',
        scanned_at: stamp()
      };
      tx.set(ref, record);
      return { record, kind: 'saved' };
    });
  }

  function fastMood(student, user, settings, assignment) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'cc-mood-dialog';
      dialog.innerHTML = '<h2>How are you feeling today?</h2><p class="cc-student"></p><p style="text-align:center;font-size:0.88rem;color:var(--text-muted);margin:-12px 0 18px;">You may answer or skip this optional check-in.</p><div class="cc-options"></div><p role="status" aria-live="polite" class="cc-status" style="width:100%;text-align:center;"></p><button type="button" class="btn cc-cancel">Cancel check-in</button>';
      dialog.querySelector('.cc-student').textContent = name(student);
      let saving = false;
      const finish = result => { dialog.close(); dialog.remove(); resolve(result); };
      [...H.MOODS, {key:null, emoji:'',label:'Skip check-in and record attendance'}].forEach(mood => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = `cc-option cc-mood-btn cc-mood-${mood.key}`;
        button.setAttribute('data-mood', mood.key);
        button.textContent = `${mood.emoji} ${mood.label}`;
        button.onclick = async () => {
          if (saving) return; saving = true;
          dialog.querySelectorAll('button').forEach(b => b.disabled = true);
          dialog.querySelector('[role=status]').textContent = 'Saving to school records…';
          try { finish(await saveAttendance(student, user, mood.key, settings, assignment)); }
          catch (error) { dialog.querySelector('[role=status]').textContent = `Not saved: ${error.message} You can retry.`; }
          finally { saving = false; dialog.querySelectorAll('button').forEach(b => b.disabled = false); }
        };
        dialog.querySelector('.cc-options').append(button);
      });
      dialog.querySelector('.cc-cancel').onclick = () => { if (!saving) finish(null); };
      dialog.addEventListener('click', event => {
        if (event.target === dialog && !saving) finish(null);
      });
      const identity = ClassCare.getFirebase().auth.currentUser?.uid;
      const authStop = ClassCare.getFirebase().auth.onAuthStateChanged(current => {
        if (current?.uid !== identity) { dialog.close(); dialog.remove(); resolve(null); authStop(); }
      });
      dialog.addEventListener('close', () => authStop(), { once: true });
      dialog.addEventListener('cancel', event => { event.preventDefault(); if (!saving) finish(null); });
      document.body.append(dialog); dialog.showModal();
    });
  }

  async function saveDeep(student, user, answers, id) {
    if (!navigator.onLine) throw new Error('Reconnect before saving this assessment.');
    if (!user) {
      try {
        const auth = ClassCare?.getFirebase?.()?.auth;
        const currentUser = typeof auth === 'function' ? auth().currentUser : auth?.currentUser;
        if (currentUser?.uid) {
          const snap = await ClassCare.DB.users.doc(currentUser.uid).get().catch(() => null);
          if (snap?.exists) user = { ...snap.data(), uid: currentUser.uid };
        }
      } catch (_) {}
    }
    if (!(await canScan(user, student))) throw new Error('Approved staff access is required.');
    const result = H.summarize(answers);
    await ClassCare.DB.emotional_checkins.doc(id).set({
      ...result,
      studentId: student.uid,
      student_uid: student.uid,
      student_id: student.student_id || '',
      student_name: name(student),
      photo_data: student.photo_data || '',
      section: student.section || '',
      teacherId: user?.uid || '',
      recorded_by: user?.uid || '',
      recorded_via: 'deep_kiosk',
      questionnaire_version: 1,
      date: H.schoolDate(),
      created_at: stamp(),
      emotion_label: result.emotion.replace(/_/g, ' '),
      emotion_emoji: result.is_negative ? '😟' : '🙂'
    });
  }

  window.ClassCareKioskData = { lookup, canScan, canScanSync, saveAttendance, fastMood, saveDeep, name };
})();
