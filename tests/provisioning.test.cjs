const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function enroll({ failAuth = false, password = 'Synthetic-unique-123', available = null } = {}) {
  const writes = [], events = [];
  const auth = { useEmulator: () => events.push('emulator'), createUserWithEmailAndPassword: async () => {
    events.push('create'); if (failAuth) throw Error('Synthetic auth failure');
    return { user: { uid: 'synthetic-student' } };
  } };
  const firebase = { initializeApp: () => ({ auth: () => auth, delete: async () => events.push('cleanup') }), firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } };
  const context = { window: { CLASSCARE_CONFIG: { firebase: { apiKey: 'demo-key', projectId: 'demo-classcare' } } }, firebase,
    location: { hostname: 'localhost' }, console: { warn() {}, error() {} } };
  vm.runInNewContext(fs.readFileSync('config/firebase-config.js', 'utf8'), context);
  const fake = {
    getSettings: async () => ({}), SECTION_CAPACITY_LIMIT: 45,
    users: { where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) }), doc: id => ({ id, set: async data => writes.push(['users', data]) }) },
    findAvailableSectionForGrade: async () => available, incrementSectionCount: async () => {},
    enrollment_requests: { doc: () => ({ set: async data => writes.push(['requests', data]) }) },
    enrollmentRequestDocId: uid => uid, pending_alerts: { add: async () => {} }, logAudit: async () => {}
  };
  const result = await context.window.ClassCare.DB.manualEnrollStudent.call(fake, {
    enrolledBy: { uid: 'admin', role: 'admin' },
    studentData: { first_name: 'Synthetic', last_name: 'Student', grade_level: 'Grade 5', student_id: 'DEMO-1', username: 'synthetic', password }
  });
  return { writes, events, result };
}

test('student provisioning never creates a profile without a login or a supplied password', async () => {
  for (const options of [{ failAuth: true }, { password: '' }]) {
    const { writes, result } = await enroll(options);
    assert.equal(result.success, false);
    assert.equal(writes.length, 0);
  }
});

test('enrolled and waitlisted profiles omit passwords; request section matches the new profile', async () => {
  for (const available of [null, { section: 'Grade 5-A' }]) {
    const { writes, result, events } = await enroll({ available });
    assert.equal(result.success, true);
    assert.ok(events.indexOf('emulator') < events.indexOf('create'));
    assert.equal(writes.length, 2);
    for (const [, data] of writes) {
      assert.equal('initial_password' in data, false);
      assert.equal('password' in data, false);
    }
    assert.equal(writes[1][1].section, writes[0][1].section);
    assert.equal(result.password, 'Synthetic-unique-123', 'One-time confirmation retains the chosen credential');
  }
});
