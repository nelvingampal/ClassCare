const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function register(failProfile = false) {
  let submit, profile;
  const events = [];
  const form = { classList: { toggle() {} }, addEventListener(type, handler) { if (type === 'submit') submit = handler; }, reset() {} };
  const checkbox = { checked: true };
  const user = { uid: 'new-teacher', email: 'fixture@classcare.test', delete: async () => events.push('delete-user') };
  const auth = { createUserWithEmailAndPassword: async () => { events.push('create-user'); return { user }; }, signOut: async () => events.push('sign-out') };
  const db = { collection: () => ({ doc: () => ({ set: async data => { profile = data; if (failProfile) throw new Error('Synthetic denial'); events.push('save-profile'); } }) }) };
  const regApp = { auth: () => auth, firestore: () => db, delete: async () => events.push('delete-app') };
  const firebase = { apps: [], initializeApp: () => regApp, firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } };
  const document = { querySelector: selector => selector === '#form-teacher-register' ? form : selector === '#teacher-terms-checkbox' ? checkbox : null };
  const context = { document, window: { CLASSCARE_CONFIG: { firebase: { projectId: 'demo-classcare' } } }, firebase,
    ClassCare: { getFirebase: () => ({ auth: {} }), configureLocalEmulators: () => events.push('emulators') },
    Utils: { validateForm: () => ({ email: user.email, password: 'synthetic123', username: 'fixture', first_name: 'Test', last_name: 'Teacher', subject: 'Math', position: 'Teacher' }), sanitizeText: value => value, setLoading() {} },
    Toast: { success: message => events.push(message), warn: message => events.push(message), error: message => events.push(message) },
    console: { warn() {}, error() {} }, setTimeout() {} };
  vm.runInNewContext(fs.readFileSync('teacher/register.js', 'utf8'), context);
  await submit({ preventDefault() {} });
  return { events, profile };
}

test('public teacher registration creates a pending profile through isolated emulator services', async () => {
  const { events, profile } = await register();
  assert.equal(profile.pending_approval, true);
  assert.equal(profile.role, 'teacher');
  assert.equal(profile.assigned_sections.length, 0);
  assert.ok(events.indexOf('emulators') < events.indexOf('create-user'));
  assert.ok(events.includes('save-profile'));
  assert.ok(events.includes('sign-out'));
  assert.ok(events.includes('delete-app'));
  assert.ok(events.some(value => value.includes('administrator must approve')));
});

test('failed teacher profile save rolls back the newly created login and closes its app', async () => {
  const { events } = await register(true);
  assert.ok(events.includes('delete-user'));
  assert.ok(events.includes('delete-app'));
  assert.ok(!events.includes('save-profile'));
  assert.ok(!events.some(value => value.includes('Registration submitted')));
});
