/**
 * Holistic Correlation Engine - Alert Engine Module
 * Evaluates care alert conditions deterministically based on academic scores and emotional check-in patterns.
 */
(function (root) {
  'use strict';

  const NEGATIVE_EMOTIONS = new Set([
    'sad', 'stressed', 'angry', 'not_good', 'not good',
    'down', 'anxious', 'scared', 'tired', 'not_motivated',
    'overwhelmed', 'lonely', 'worried'
  ]);

  const NEGATIVE_FLAGS = new Set([
    'not_good', 'stressed', 'needs_support', 'not_motivated'
  ]);

  const MIN_NEGATIVE_DAYS = 2;

  /**
   * Helper to determine whether an emotional check-in entry is considered negative.
   */
  function isNegativeCheckin(entry) {
    if (!entry) return false;
    if (entry.is_negative === true) return true;
    const raw = String(entry.emotion || entry.mood || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (NEGATIVE_EMOTIONS.has(raw)) return true;
    if (Array.isArray(entry.flags) && entry.flags.some(f => NEGATIVE_FLAGS.has(String(f).trim().toLowerCase()))) return true;
    return false;
  }

  /**
   * Evaluates whether a student strictly requires a Care Alert based on the Holistic Correlation rule:
   * Condition 1: Failing Summative Score (< threshold%, e.g. < 75%)
   * Condition 2: Sustained pattern of negative emotions in the last 3-5 days
   * Condition 3: No pre-existing 'Open' alert for this student & teacher
   *
   * @param {string} studentId - Unique UID of the student
   * @param {string} section - Section name of the student
   * @param {object} [teacherUser] - The authenticated teacher user object
   * @returns {Promise<{created: boolean, reason?: string, alertId?: string}>}
   */
  async function evaluateCareAlert(studentId, section, teacherUser) {
    if (!studentId || !section) {
      return { created: false, reason: 'Missing required studentId or section' };
    }

    const authUser = teacherUser
      || (typeof ClassCare !== 'undefined' && ClassCare.getFirebase ? ClassCare.getFirebase().auth().currentUser : null)
      || (typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null);

    if (!authUser || !authUser.uid) {
      return { created: false, reason: 'Teacher must be authenticated to evaluate care alerts' };
    }

    if (typeof ClassCare === 'undefined' || !ClassCare.collection) {
      return { created: false, reason: 'ClassCare Firestore API unavailable' };
    }

    // 1. Fetch most recent summative score
    let latestScore = null;
    try {
      const scoresSnap = await ClassCare.collection('summativeScores')
        .where('studentId', '==', studentId)
        .where('section', '==', section)
        .get();

      if (scoresSnap.empty) {
        return { created: false, reason: 'No summative scores found for student in section' };
      }

      const scores = scoresSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.score !== '' && s.score !== null && Number.isFinite(Number(s.score)) && Number(s.maxScore) > 0)
        .sort((a, b) => String(b.assessmentDate || '').localeCompare(String(a.assessmentDate || '')));

      latestScore = scores[0];
    } catch (err) {
      console.warn('[alertEngine] Error querying summativeScores:', err);
      return { created: false, reason: `Failed to query scores: ${err.message}` };
    }

    if (!latestScore) {
      return { created: false, reason: 'No valid numeric score records found' };
    }

    const numericScore = Number(latestScore.score);
    const maxScore = Number(latestScore.maxScore);
    const thresholdPercent = Number(latestScore.thresholdPercent != null ? latestScore.thresholdPercent : 75);
    const scorePercent = (numericScore / maxScore) * 100;
    const passingScore = (maxScore * thresholdPercent) / 100;

    // RULE 1: Strictly requires a failing grade (< threshold)
    if (scorePercent >= thresholdPercent) {
      return { created: false, reason: `Score is passing (${scorePercent.toFixed(1)}% >= ${thresholdPercent}%)` };
    }

    // 2. Query student's emotional check-ins over the last 3-5 days
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));
    const minDateStr = (typeof ClassCareHolistic !== 'undefined' && ClassCareHolistic.schoolDate)
      ? ClassCareHolistic.schoolDate(fiveDaysAgo)
      : fiveDaysAgo.toISOString().split('T')[0];
    const todayStr = (typeof ClassCareHolistic !== 'undefined' && ClassCareHolistic.schoolDate)
      ? ClassCareHolistic.schoolDate(now)
      : now.toISOString().split('T')[0];

    let emoRecords = [];
    try {
      const emoSnap = await ClassCare.collection('emotional_checkins')
        .where('student_uid', '==', studentId)
        .where('date', '>=', minDateStr)
        .where('date', '<=', todayStr)
        .get();

      emoRecords = emoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[alertEngine] Error querying emotional check-ins:', err);
      return { created: false, reason: `Failed to query emotional check-ins: ${err.message}` };
    }

    // Filter negative entries
    const negativeEntries = emoRecords.filter(isNegativeCheckin);
    const negativeDates = [...new Set(negativeEntries
      .map(entry => String(entry.date || '').slice(0, 10))
      .filter(Boolean))];

    // RULE 2: Strictly requires a sustained pattern of negative emotions
    // Sustained pattern definition: negative check-ins on at least 2 distinct dates in the 5-day window.
    const hasSustainedPattern = negativeDates.length >= MIN_NEGATIVE_DAYS;

    if (!hasSustainedPattern) {
      return {
        created: false,
        reason: `No sustained pattern of negative emotions in the last 3-5 days (${negativeDates.length} distinct negative day(s), ${negativeEntries.length} negative check-in(s) out of ${emoRecords.length})`
      };
    }

    // 3. Query careAlerts to ensure there isn't already an active 'Open' alert
    const alertDocId = `${authUser.uid}_${studentId}`;
    try {
      const existingAlertSnap = await ClassCare.collection('careAlerts').doc(alertDocId).get();
      if (existingAlertSnap.exists) {
        const existingData = existingAlertSnap.data() || {};
        if (existingData.status === 'Open') {
          return { created: false, reason: `Active 'Open' alert already exists for this student` };
        }
      }
    } catch (err) {
      console.warn('[alertEngine] Error querying existing careAlerts:', err);
    }

    // 4. Create new Care Alert document
    const primaryEmotion = negativeEntries[0].emotion_label
      || negativeEntries[0].emotion
      || (Array.isArray(negativeEntries[0].flags) && negativeEntries[0].flags[0])
      || 'Negative';

    const triggerReason = `Summative Score (${numericScore}/${maxScore}, ${scorePercent.toFixed(1)}%) is below ${thresholdPercent}% passing threshold, correlated with a sustained pattern of negative emotions (${negativeDates.length} distinct negative day(s), ${negativeEntries.length} negative check-in(s) in the last 5 days). Immediate academic and emotional support required.`;

    const serverStamp = (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : (typeof ClassCare !== 'undefined' && ClassCare.stamp ? ClassCare.stamp() : new Date().toISOString());

    const alertPayload = {
      teacherId: authUser.uid,
      studentId: studentId,
      student_uid: studentId,
      section: section,
      subject: latestScore.subject || 'General',
      assessmentId: latestScore.assessmentId || '',
      assessmentTitle: latestScore.assessmentTitle || latestScore.title || 'Summative Assessment',
      score: numericScore,
      maxScore: maxScore,
      passingScore: Number(passingScore.toFixed(1)),
      status: 'Open',
      priority: 'High',
      type: 'holistic_correlation',
      reason: triggerReason,
      recentEmotion: primaryEmotion,
      negativeCheckinCount: negativeEntries.length,
      negativeCheckinDays: negativeDates.length,
      updatedAt: serverStamp
    };

    try {
      await ClassCare.collection('careAlerts').doc(alertDocId).set(alertPayload);
      return { created: true, alertId: alertDocId, reason: triggerReason };
    } catch (err) {
      console.error('[alertEngine] Failed to create careAlert document:', err);
      return { created: false, reason: `Write failed: ${err.message}` };
    }
  }

  const AlertEngine = {
    isNegativeCheckin,
    evaluateCareAlert
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlertEngine;
  } else {
    root.AlertEngine = AlertEngine;
    root.evaluateCareAlert = evaluateCareAlert;
  }
})(typeof window === 'undefined' ? globalThis : window);
