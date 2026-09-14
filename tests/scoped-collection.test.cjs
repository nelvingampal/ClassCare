const { test } = require('node:test');
const assert = require('node:assert/strict');
const scope = require('../js/scoped-collection.js');
function ref(id, filters = []) {
  return { id, filters, where(...args) { return ref(id, [...filters, args]); }, get() { return this.filters; }, doc(id) { return { id }; } };
}
test('approved teacher reads are broad; roster helper keeps user queries student-only', () => {
  const user = { uid: 't', role: 'teacher', assigned_sections: ['A', 'B'], pending_approval: false };
  const collection = scope(ref('users'), user);
  assert.deepEqual(collection.where('student_id', '==', 'DEMO').filters, [['role', '==', 'student'], ['student_id', '==', 'DEMO']]);
  assert.deepEqual(collection.doc('s'), { id: 's' });
  assert.deepEqual(scope(ref('attendance'), { ...user, assigned_sections: ['A'] }).get(), []);
  assert.deepEqual(scope(ref('attendance'), { ...user, assigned_sections: ['A'] }).where('section', '==', 'A').get(), [['section', '==', 'A']]);
});
test('missing, pending and disabled staff never fall back to unscoped queries', () => {
  for (const user of [null, { uid: 't', role: 'teacher', pending_approval: true }, { uid: 't', role: 'teacher', disabled: true }]) {
    assert.throws(() => scope(ref('attendance'), user).get());
  }
});
test('student queries use auth UID rather than school ID; admins retain scope', () => {
  assert.deepEqual(scope(ref('attendance'), { uid: 's', role: 'student' }).get(), [['studentId', '==', 's']]);
  const original = ref('attendance'); assert.equal(scope(original, { uid: 'a', role: 'admin' }), original);
});
