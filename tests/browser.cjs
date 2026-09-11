/* All fixture identities and scores are isolated in demo-classcare emulators. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDocs, collection, updateDoc, deleteDoc } = require('firebase/firestore');
const H = require('../js/holistic-core.js');
const base = 'http://127.0.0.1:5599';
async function until(fn, message) {
  const start = Date.now();
  while (Date.now() - start < 25000) { if (await fn()) return; await new Promise(r => setTimeout(r,150)); }
  throw new Error(message);
}
(async () => {
  let env, browser;
  const server = spawn(process.execPath, ['server.js'], { env:{...process.env,PORT:'5599'}, stdio:'ignore', windowsHide:true });
  try {
    await until(async () => { try { return (await fetch(base)).ok; } catch (_) { return false; } }, 'Local server did not start');
    env = await initializeTestEnvironment({projectId:'demo-classcare',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
    async function readFixture(fn) { let value; await env.withSecurityRulesDisabled(async context => { value = await fn(context); }); return value; }
    await env.clearFirestore();
    const identities = {};
    for (const role of ['teacher','student','admin']) {
      const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${role}-${Date.now()}@classcare.test`,password:'testing123',returnSecureToken:true})
      });
      const data = await response.json(); if (!response.ok) throw Error(JSON.stringify(data));
      identities[role] = {uid:data.localId,email:data.email};
    }
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [role,identity] of Object.entries(identities)) await setDoc(doc(db,'users',identity.uid),{role, email:identity.email,first_name:'Fixture',last_name:role,section:'Grade 5-A',assigned_sections:role==='teacher'?['Grade 5-A']:[],pending_approval:false,enrollment_status:'enrolled',student_id:role==='student'?'TEST-001':''});
      await setDoc(doc(db,'settings','global'),{morning_start:'07:30',morning_late_cutoff:'07:45',enrollment_open:false});
    });
    browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const errors = [];
    async function context(role) {
      const ctx = await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true,permissions:['camera'],viewport:{width:1280,height:900}});
      await ctx.route(/https:\/\/(?:firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|api\.telegram\.org|api\.emailjs\.com|generativelanguage\.googleapis\.com)/, route => route.abort());
      await ctx.route('**/js/config.js', route => route.fulfill({contentType:'application/javascript',body:"window.CLASSCARE_CONFIG={firebase:{apiKey:'demo-key',projectId:'demo-classcare',authDomain:'demo-classcare.firebaseapp.com'}};"}));
      await ctx.route('**/config/firebase-config.js', route => route.fulfill({contentType:'application/javascript',body:fs.readFileSync('config/firebase-config.js','utf8')
        .replace('_auth = firebase.auth();', "_auth = firebase.auth(); _auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});")
        .replace('_db = firebase.firestore();', "_db = firebase.firestore(); _db.useEmulator('127.0.0.1',8080);")}));
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', e => { errors.push(`${role}: ${e.message}`); console.log('PAGE ERROR', role, e.message); });
      page.on('console', message => { if (message.type() === 'error') console.log('PAGE CONSOLE', role, message.text().slice(0,300)); });
      await page.goto(base+'/teacher/scanner.html');
      await page.waitForFunction(() => !!window.ClassCare);
      await page.evaluate(identity => ClassCare.getFirebase().auth.signInWithEmailAndPassword(identity.email,'testing123'),identities[role]);
      console.log('AUTH CHECK', role, await page.evaluate(async () => {
        const snap = await ClassCare.DB.users.doc(ClassCare.getFirebase().auth.currentUser.uid).get();
        return {exists:snap.exists,role:snap.data()?.role,profileError:window._profileValue?.__profileError};
      }));
      return {ctx,page};
    }
    const teacher = await context('teacher');
    const page = teacher.page;
    await page.locator('#kiosk-content').waitFor({state:'visible'});
    await page.locator('details.manual-panel summary').click();
    await page.locator('#manual-qr-input').fill('TEST-001');
    await page.locator('#btn-manual-scan').click();
    await page.locator('#kiosk-choices-grid button').nth(3).click();
    await page.locator('#kiosk-choices-grid button').nth(2).click();
    await page.locator('#kiosk-choices-grid button').nth(0).click();
    await until(async()=> (await readFixture(async c=>getDocs(collection(c.firestore(),'emotional_checkins')))).size===1,'Three-step check-in not saved');
    const attendance = await readFixture(async c => (await getDocs(collection(c.firestore(),'attendance'))).docs.map(d => d.data()));
    assert.equal(attendance.length,1); assert.equal(attendance[0].emotion_checkin_3step.mood_key,'not_good');
    console.log('PASS actual daily scanner saves attendance and explicit three-step responses');
    await page.reload();
    await page.locator('details.manual-panel summary').click();
    await page.locator('#manual-qr-input').fill('TEST-001'); await page.locator('#btn-manual-scan').click();
    await until(async()=> /Already recorded|Time Out/.test(await page.locator('#scan-status-label').textContent()),'Duplicate scan did not finish');
    assert.equal((await readFixture(async c => getDocs(collection(c.firestore(),'attendance')))).size,1);
    console.log('PASS duplicate scans do not create another daily record');
    await page.evaluate(()=>{
      window.originalEvaluate=Utils.computeHierarchicalAttendance;
      Utils.computeHierarchicalAttendance=()=>({action:'time_out',status:'Present',minutes_late:0});
      const db=ClassCare.getFirebase().db;window.originalTransaction=db.runTransaction.bind(db);
      db.runTransaction=async()=>{throw Error('Synthetic transaction failure');};
    });
    await page.locator('#manual-qr-input').fill('TEST-001');await page.locator('#btn-manual-scan').click();
    await page.getByText('Attendance not saved',{exact:true}).first().waitFor();
    assert.equal((await readFixture(async c=>(await getDocs(collection(c.firestore(),'attendance'))).docs[0].data())).time_out,undefined);
    await page.evaluate(()=>{ClassCare.getFirebase().db.runTransaction=window.originalTransaction;});
    await page.locator('#manual-qr-input').fill('TEST-001');await page.locator('#btn-manual-scan').click();
    await until(async()=>!!(await readFixture(async c=>(await getDocs(collection(c.firestore(),'attendance'))).docs[0].data())).time_out,'Retried time-out not saved');
    await page.evaluate(()=>{Utils.computeHierarchicalAttendance=window.originalEvaluate;});
    console.log('PASS failed time-out shows failure without changing records; retry writes time-out');
    // Reset only synthetic daily attendance to exercise a fresh skipped check-in.
    await env.withSecurityRulesDisabled(async c=>{for(const d of (await getDocs(collection(c.firestore(),'attendance'))).docs)await deleteDoc(d.ref);});
    await page.reload();await page.locator('details.manual-panel summary').click();
    const beforeSkip=(await readFixture(c=>getDocs(collection(c.firestore(),'emotional_checkins')))).size;
    await page.locator('#manual-qr-input').fill('TEST-001');await page.locator('#btn-manual-scan').click();
    await page.locator('#btn-skip-emotion').click();
    await page.locator('#emotion-overlay').waitFor({state:'hidden'});
    const skipped=await readFixture(async c=>(await getDocs(collection(c.firestore(),'attendance'))).docs[0].data());
    assert.equal(skipped.checkin_skipped,true);assert.equal(skipped.emotion,null);
    assert.equal((await readFixture(c=>getDocs(collection(c.firestore(),'emotional_checkins')))).size,beforeSkip);
    console.log('PASS skip preserves attendance without inventing a response');

    await page.goto(base+'/teacher/deep-check.html');
    await page.locator('#kiosk-content').waitFor({state:'visible'});
    await page.locator('#manual-id').fill('TEST-001'); await page.locator('#manual-submit').click();
    await page.locator('#deep-assessment').waitFor({state:'visible'});
    await page.locator('#enable-gestures').click();
    await page.waitForFunction(() => /Show 1–4 fingers|unavailable|could not load/.test(document.getElementById('gesture-status').textContent),{},{timeout:40000});
    const gestureStatus = await page.locator('#gesture-status').textContent();
    assert.match(gestureStatus,/Show 1–4 fingers/,'MediaPipe worker should initialize successfully: '+gestureStatus);
    console.log('PASS actual MediaPipe model loads in worker and processes fake-camera frames');
    for (const choice of [2,2,2,0,0]) await page.locator('#question-options button').nth(choice).click();
    await teacher.ctx.setOffline(true);
    await page.locator('#save-check').click();
    await page.getByText(/Not saved: Reconnect before saving/).waitFor();
    assert.equal(await page.locator('#review-answers li').count(),5);
    await teacher.ctx.setOffline(false);
    await page.locator('#save-check').click();
    await page.waitForFunction(() => document.getElementById('kiosk-status').textContent.includes('Assessment saved'));
    const checks = await readFixture(async c => (await getDocs(collection(c.firestore(),'emotional_checkins'))).docs.map(d=>d.data()));
    assert.equal(checks.length,2); assert.equal(Object.keys(checks.find(c=>c.recorded_via==='deep_kiosk').answers).length,5);
    assert.equal((await readFixture(async c => getDocs(collection(c.firestore(),'attendance')))).size,1);
    console.log('PASS deep kiosk saves five answers independently of attendance and resets');
    await page.goto(base+'/teacher/summative.html');
    await page.locator('#summative-content').waitFor({state:'visible'});
    await page.locator('[name=title]').fill('Browser verification'); await page.locator('[name=subject]').fill('Math');
    await page.locator('[name=maxScore]').fill('20'); await page.locator('#publish-assessment').click();
    await page.waitForFunction(() => document.getElementById('assessment-select').options.length>1);
    const assessmentId = await page.locator('#assessment-select option').nth(1).getAttribute('value');
    await page.locator('#assessment-select').selectOption(assessmentId);
    await page.locator('#score-rows input').fill('10'); await page.locator('#save-scores').click();
    await page.waitForFunction(() => document.getElementById('score-status').textContent.includes('score changes saved'));
    await page.getByText(/Intervention Needed: Fixture student/).waitFor();
    await page.getByRole('button',{name:'Acknowledge',exact:true}).click();
    await page.getByText('Grade 5-A · Acknowledged',{exact:true}).waitFor();
    console.log('PASS published assessment, roster score entry, correlated care alert and acknowledgment');
    const otherEditor = await teacher.ctx.newPage();
    otherEditor.setDefaultTimeout(20000);
    await otherEditor.goto(base+'/teacher/summative.html');
    await otherEditor.locator('#assessment-select').selectOption(assessmentId);
    await otherEditor.locator('#score-rows input').fill('11');
    const student = await context('student');
    await student.page.goto(base+'/student/index.html');
    await student.page.locator('#holistic-live').waitFor({state:'visible'});
    await student.page.getByText('Assessment schedule',{exact:true}).first().waitFor();
    assert.equal(await student.page.getByText('10 / 20 (50.0%)',{exact:true}).count(),0);
    await page.locator('#score-rows input').fill('18'); await page.locator('#save-scores').click();
    assert.equal(await student.page.getByText('18 / 20 (90.0%)',{exact:true}).count(),0);
    await page.getByText('No active holistic care alerts.',{exact:true}).waitFor();
    await otherEditor.locator('#save-scores').click();
    await otherEditor.getByText(/A score was changed in another session/).waitFor();
    assert.equal(await otherEditor.locator('#score-rows input').inputValue(),'11');
    await otherEditor.close();
    console.log('PASS student has schedules without scores; corrected score resolves care alert');
    console.log('PASS concurrent stale edits are rejected and preserved for review');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true,'Mobile page should not overflow');
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:'test-results/summative-mobile.png',fullPage:true});
    await page.goto(base+'/teacher/deep-check.html');
    await page.locator('#manual-id').fill('TEST-001'); await page.locator('#manual-submit').click();
    await page.locator('#deep-assessment').waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.screenshot({path:'test-results/deep-mobile.png',fullPage:true});
    await page.goto(base+'/teacher/index.html');
    await page.locator('#view-dashboard').waitFor({state:'visible'});
    await page.locator('#holistic-live').waitFor({state:'visible'});
    await page.waitForTimeout(1000);
    const admin = await context('admin');
    await admin.page.goto(base+'/admin/index.html');
    await admin.page.locator('#view-dashboard').waitFor({state:'visible'});
    await admin.page.locator('#holistic-live').waitFor({state:'visible'});
    await admin.page.waitForTimeout(1000);
    assert.deepEqual(errors,[],'Browser JavaScript errors');
    console.log('PASS mobile layouts and no page JavaScript errors');
  } finally { await browser?.close(); await env?.cleanup(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode=1; });
