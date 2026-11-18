const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fields, request } = require('../scripts/start-local.cjs');

test('demo launcher rejects non-loopback endpoints before making a request', async () => {
  for (const url of ['https://firestore.googleapis.com/', 'http://192.168.1.2:8080/', 'http://127.0.0.1:80/']) {
    await assert.rejects(request(url), /Only local demo endpoints/);
  }
});

test('synthetic profile encoding preserves boolean approval and assignment types', () => {
  const data = fields({ pending_approval: false, disabled: false, role: 'teacher', assigned_sections: ['Demo Class A'] });
  assert.deepEqual(data.pending_approval, { booleanValue: false });
  assert.deepEqual(data.assigned_sections, { arrayValue: { values: [{ stringValue: 'Demo Class A' }] } });
  assert.deepEqual(data.role, { stringValue: 'teacher' });
});
