/* Plain-JavaScript route policy. Identity must come from the server profile. */
(function (root) {
  function ProtectedRoute(user, pathname) {
    if (!user || user.__profileError || user.disabled === true) return false;
    const role = String(user.role || '').toLowerCase();
    if (!['student', 'teacher', 'admin'].includes(role)) return false;
    if (role === 'teacher' && user.pending_approval !== false) return false;
    if (/\/admin(?:\/|$)/.test(pathname)) return role === 'admin';
    if (/\/teacher(?:\/|$)/.test(pathname)) return role === 'teacher' || role === 'admin';
    if (/\/student(?:\/|$)/.test(pathname)) return role === 'student';
    return true;
  }
  root.ProtectedRoute = ProtectedRoute;
  if (typeof module !== 'undefined') module.exports = ProtectedRoute;
})(typeof window === 'undefined' ? globalThis : window);
