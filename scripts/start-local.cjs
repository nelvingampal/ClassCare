// Complete local demo startup. All data endpoints are fixed to loopback/demo-classcare.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const PROJECT = 'demo-classcare';
const WEB = 'http://127.0.0.1:5500';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const DEMO_PASSWORD = 'ClassCareDemo123!';
const children = new Set();
let stopping = false;

async function request(url, options = {}) {
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || !['5500', '9099', '8080'].includes(parsed.port)) throw Error('Only local demo endpoints are permitted.');
  return fetch(url, { ...options, signal: AbortSignal.timeout(4000) });
}

function launch(args) {
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, PORT: '5500', CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' } });
  children.add(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { children.delete(child); if (!stopping) { console.error(`Local service stopped (${code}).`); stop(1); } });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGINT');
}

async function ready(url) {
  try { return (await request(url)).ok; }
  catch (error) {
    if (['EACCES', 'EPERM'].includes(error.cause?.code)) throw Error('This execution environment denies local network connections. Run Start-ClassCare.cmd directly from Windows File Explorer.');
    return false;
  }
}

async function waitFor(check, label) {
  const deadline = Date.now() + 120000;
  while (!stopping && Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error(`${label} did not become ready. Check the service errors above; ClassCare is not running completely.`);
}

function fields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    typeof value === 'boolean' ? { booleanValue: value } : Array.isArray(value)
      ? { arrayValue: { values: value.map(v => ({ stringValue: v })) } } : { stringValue: String(value) }]));
}

async function seedDemo() {
  for (const role of ['admin', 'teacher', 'student']) {
    const email = `${role}@demo.classcare.test`;
    const body = JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true });
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
    let response = await request(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, options);
    let account = await response.json();
    if (!response.ok && account.error?.message === 'EMAIL_EXISTS') {
      response = await request(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, options);
      account = await response.json();
    }
    if (!response.ok || !account.localId) throw Error(`Could not prepare synthetic ${role} account: ${account.error?.message || response.status}`);
    const profile = { uid: account.localId, email, username: role, role, first_name: 'Demo', last_name: role,
      section: 'Demo Class A', pending_approval: false, disabled: false,
      enrollment_status: 'enrolled', assigned_sections: role === 'teacher' ? ['Demo Class A'] : [],
      student_id: role === 'student' ? 'DEMO-001' : '' };
    const saved = await request(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${account.localId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: fields(profile) })
    });
    if (!saved.ok) throw Error(`Could not save synthetic ${role} profile: HTTP ${saved.status}`);
  }
  const settings = {
    morning_start: '07:30',
    morning_late_cutoff: '07:45',
    enrollment_open: true,
    enrollment_status: 'OPEN',
    academic_year: '2026-2027',
    master_sections: ['Demo Class A', 'Grade 7 - Section A', 'Grade 8 - Section A']
  };
  const savedSettings = await request(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/settings/global`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: fields(settings) })
  });
  if (!savedSettings.ok) throw Error(`Could not save synthetic global settings: HTTP ${savedSettings.status}`);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js'))) throw Error('Dependencies missing. Run npm ci in the ClassCare folder first.');
  console.log('Starting ClassCare DEMO with local Firebase Auth and Firestore. No live accounts or notifications.');
  const authReady = () => ready(`${AUTH}/emulator/v1/projects/${PROJECT}/config`);
  const firestoreReady = () => ready(`${FIRESTORE}/`);
  const authUp = await authReady(), dbUp = await firestoreReady();
  if (authUp !== dbUp) throw Error('Only one Firebase emulator is running. Stop the old local emulator session, then run this launcher again.');
  if (!authUp) {
    launch(['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start', '--only', 'auth,firestore', '--project', PROJECT]);
    await waitFor(async () => (await authReady()) && (await firestoreReady()), 'Firebase Auth/Firestore');
  }
  const config = await request(`${AUTH}/emulator/v1/projects/${PROJECT}/config`);
  const authConfig = await config.json();
  if (!authConfig || typeof authConfig !== 'object') throw Error('Auth emulator did not return its configuration.');
  await seedDemo();
  if (!(await ready(`${WEB}/`))) launch(['server.js']);
  await waitFor(() => ready(`${WEB}/`), 'ClassCare web server');
  const servedConfig = await (await request(`${WEB}/js/config.js`)).text();
  if (!servedConfig.includes("projectId:'demo-classcare'")) throw Error('Port 5500 is serving a different configuration. Stop that server and retry.');
  console.log(`\nREADY: ${WEB}/`);
  console.log('Demo logins: teacher@demo.classcare.test | admin@demo.classcare.test | student@demo.classcare.test');
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  console.log('Manual scanner ID: DEMO-001. Keep this window open. Ctrl+C stops services started here.');
  if (process.platform === 'win32') {
    spawn('powershell.exe', ['-NoProfile', '-Command', "Start-Process 'http://127.0.0.1:5500/'"], { windowsHide: true, stdio: 'ignore' });
  }
}

if (require.main === module) {
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  main().catch(error => { console.error(`\nNOT READY: ${error.message}`); stop(1); });
}
module.exports = { fields, request };
