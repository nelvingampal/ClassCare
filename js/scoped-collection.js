/* Query convenience only. Firestore rules remain the authorization boundary. */
(function (root) {
  const studentCollections = new Set(['students', 'attendance', 'enrollments', 'grades', 'helpdesk_tickets',
    'intervention_alerts', 'emotionalChecks', 'emotional_checkins', 'enrollment_requests',
    'concern_submissions', 'talkToSomeone', 'concern_referrals', 'distress_alerts', 'careAlerts', 'summativeScores']);
  const scopedCollections = new Set([...studentCollections, 'users', 'summativeAssessments', 'notifications', 'scheduledTests']);
  function scopedCollection(ref, user) {
    if (!scopedCollections.has(ref.id) || (user?.role === 'admin' && !user.disabled && !user.__profileError)) return ref;
    function query() {
      if (!user || user.__profileError || user.disabled || !user.uid) throw Object.assign(new Error('A verified account is required.'), { code: 'permission-denied' });
      if (user.role === 'teacher' && user.pending_approval === false) {
        return ref.id === 'users' ? ref.where('role', '==', 'student') : ref;
      }
      if (user.role === 'student') {
        if (ref.id === 'users') return ref.where('__name__', '==', user.uid);
        if (['summativeAssessments', 'notifications', 'scheduledTests'].includes(ref.id)) return ref.where('section', '==', user.section || '__unassigned__');
        return ref.where('studentId', '==', user.uid);
      }
      throw Object.assign(new Error('Approved staff access is required.'), { code: 'permission-denied' });
    }
    return new Proxy(ref, {
      get(target, name) {
        if (['where', 'orderBy', 'limit', 'limitToLast', 'startAt', 'startAfter', 'endAt', 'endBefore', 'get', 'onSnapshot', 'count'].includes(name)) {
          return (...args) => { const scoped = query(); return scoped[name](...args); };
        }
        const value = Reflect.get(target, name, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }
  root.scopedCollection = scopedCollection;
  if (typeof module !== 'undefined') module.exports = scopedCollection;
})(typeof window === 'undefined' ? globalThis : window);
