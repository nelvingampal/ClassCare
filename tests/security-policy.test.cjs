const { test } = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../js/protected-route.js');
const privacy = require('../js/analytics-privacy.js');
test('analytics projection excludes arbitrary PII and chart output contains counts only', () => {
  const record = {student_uid:'synthetic',date:'2026-09-14',emotion:'sad',first_name:'Private',parent_email:'private@example.test',notes:'private',customPII:'private'};
  assert.deepEqual(privacy.projectCheck(record), {student_uid:'synthetic',date:'2026-09-14',emotion:'sad'});
  assert.deepEqual(privacy.completedByDate([record],['2026-09-14']), {'2026-09-14':1});
});
test('route policy denies role confusion, pending, disabled and missing identity', () => {
  for (const path of ['/admin', '/admin/index.html', '/teacher', '/teacher/scanner.html']) {
    for (const user of [null, {role:'student'}, {role:'teacher',pending_approval:true}, {role:'admin',disabled:true}, {role:'admin',__profileError:'offline'}]) {
      assert.equal(guard(user,path),false);
    }
  }
  assert.equal(guard({role:'student',pending_approval:true},'/student/index.html'),true);
  assert.equal(guard({role:'student',pending_approval:true},'/teacher/index.html'),false);
  assert.equal(guard({role:'teacher',pending_approval:false},'/teacher/scanner.html'),true);
  assert.equal(guard({role:'teacher',pending_approval:false},'/admin'),false);
  assert.equal(guard({role:'admin'},'/admin'),true);
});
