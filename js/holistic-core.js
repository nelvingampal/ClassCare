/* Shared, deterministic domain logic. No generated student data. */
(function (root) {
  'use strict';
  const MOODS = [
    { key: 'happy', label: 'Happy', emoji: '😊' },
    { key: 'okay', label: 'Okay', emoji: '😐' },
    { key: 'sad', label: 'Sad', emoji: '😢', negative: true },
    { key: 'stressed', label: 'Stressed', emoji: '😣', negative: true }
  ];
  const QUESTIONS = [
    { id: 'mood', text: 'How are you feeling?', options: ['Good', 'Okay', 'Not Good', 'Very upset'], negative: [2, 3], flag: 'not_good' },
    { id: 'stress', text: 'How much stress are you feeling?', options: ['None', 'A little', 'Stressed', 'Very stressed'], negative: [2, 3], flag: 'stressed' },
    { id: 'motivation', text: 'How motivated do you feel to learn?', options: ['Very motivated', 'Mostly motivated', 'Not Motivated', 'Unable to start'], negative: [2, 3], flag: 'not_motivated' },
    { id: 'support', text: 'Do you feel safe and supported?', options: ['Very supported', 'Mostly supported', 'I need support', 'I feel unsafe'], negative: [2, 3], flag: 'needs_support' },
    { id: 'needs', text: 'What would help you most today?', options: ['Ready to learn', 'A short break', 'Help with schoolwork', 'Someone to talk to'], negative: [3], flag: 'needs_support' }
  ];
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const NEGATIVE = new Set(['sad', 'stressed', 'not_good', 'not_motivated', 'anxious', 'overwhelmed', 'angry', 'tired', 'lonely', 'worried']);
  function schoolDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function schoolTime(date = new Date()) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  }
  function summarize(answers) {
    if (!Array.isArray(answers) || answers.length !== 5 || answers.some(a => !Number.isInteger(a) || a < 0 || a > 3)) throw new Error('Answer all five questions before saving.');
    const flags = [...new Set(QUESTIONS.filter((q, i) => q.negative.includes(answers[i])).map(q => q.flag))];
    return { answers: Object.fromEntries(QUESTIONS.map((q, i) => [q.id, { option: answers[i] + 1, label: q.options[answers[i]] }])), flags,
      emotion: flags.includes('stressed') ? 'stressed' : flags.includes('not_motivated') ? 'not_motivated' : flags.includes('not_good') ? 'not_good' : (answers[0] === 0 ? 'happy' : 'okay'), is_negative: flags.length > 0 };
  }
  function percent(score, max) {
    if (score === '' || score == null || typeof score === 'boolean') return null;
    const value = Number(score), maximum = Number(max);
    return Number.isFinite(value) && Number.isFinite(maximum) && maximum > 0 && value >= 0 && value <= maximum ? value / maximum * 100 : null;
  }
  function recent(date, days, today) {
    const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
    return Number.isFinite(age) && age >= 0 && age <= days;
  }
  function correlate(scores, checks, today = schoolDate()) {
    // Latest assessment per student AND subject; missing and future scores do not count as zero.
    const latest = new Map();
    scores.filter(s => recent(s.assessmentDate, 30, today) && percent(s.score, s.maxScore) !== null).forEach(s => {
      const key = `${s.studentId}:${s.subject || ''}`;
      const old = latest.get(key);
      const newer = !old || s.assessmentDate > old.assessmentDate || (s.assessmentDate === old.assessmentDate &&
        ((s.updatedAt?.seconds || 0) > (old.updatedAt?.seconds || 0) ||
          ((s.updatedAt?.seconds || 0) === (old.updatedAt?.seconds || 0) && String(s.id) > String(old.id))));
      if (newer) latest.set(key, s);
    });
    const result = new Map();
    latest.forEach(s => {
      const threshold = Number(s.thresholdPercent);
      if (!Number.isFinite(threshold) || percent(s.score, s.maxScore) >= threshold) return;
      const negative = checks.filter(c => (c.student_uid || c.studentId) === s.studentId && recent(c.date, 14, today)
        && (NEGATIVE.has(normalize(c.emotion || c.mood)) || (Array.isArray(c.flags) ? c.flags : []).some(f => NEGATIVE.has(normalize(f)))));
      if (!negative.length) return;
      const previous = result.get(s.studentId);
      const evidence = [...(previous?.evidence || []), { scoreId: s.id, score: s.score, maxScore: s.maxScore, date: s.assessmentDate,
        thresholdPercent: threshold, checkIds: negative.map(c => c.id).sort() }].sort((a, b) => a.scoreId.localeCompare(b.scoreId));
      result.set(s.studentId, { studentId: s.studentId, teacherId: s.teacherId, section: s.section, evidence, fingerprint: JSON.stringify(evidence) });
    });
    return result;
  }
  function countFingers(points) {
    if (!points || points.length !== 21) return 0;
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // Four non-thumb fingers, rotation independent. Show your palm to the camera.
    return [8, 12, 16, 20].filter(tip => {
      const a = points[tip - 2], b = points[tip - 1], c = points[tip];
      const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
      const denominator = distance(a, b) * distance(c, b);
      return denominator > 0 && dot / denominator < -0.75 && distance(c, points[0]) > distance(a, points[0]) * 1.15;
    }).length;
  }
  class Dwell {
    constructor() { this.reset(); }
    reset() { this.choice = 0; this.since = 0; this.locked = false; this.releaseSince = null; }
    lock() { this.locked = true; this.choice = 0; this.releaseSince = null; }
    update(choice, now) {
      if (this.locked) {
        if (!choice) {
          if (this.releaseSince === null) this.releaseSince = now;
          if (now - this.releaseSince >= 400) this.reset();
        } else this.releaseSince = null;
        return { progress: 0, selected: 0 };
      }
      if (!choice || choice !== this.choice) { this.choice = choice; this.since = now; }
      const progress = choice ? Math.min(1, (now - this.since) / 1100) : 0;
      if (progress === 1) { this.lock(); return { progress, selected: choice }; }
      return { progress, selected: 0 };
    }
  }
  const api = { MOODS, QUESTIONS, schoolDate, schoolTime, summarize, percent, recent, correlate, countFingers, Dwell };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClassCareHolistic = api;
})(typeof window === 'undefined' ? globalThis : window);
