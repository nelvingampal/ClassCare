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
    const teacher=await context('teacher'), page=teacher.page;
    await page.goto(base+'/teacher/index.html');
    await page.locator('#view-dashboard').waitFor({state:'visible'});
    const routes={'teacher-overview':'tab-teacher-overview','teacher-students':'tab-teacher-students','teacher-attendance':'tab-teacher-attendance','teacher-register':'tab-teacher-attendance','teacher-summative':'tab-teacher-summative','teacher-grades':'tab-teacher-grades','teacher-care-alerts':'tab-teacher-care-alerts','teacher-enrollment':'tab-teacher-enrollment','teacher-assignments':'tab-teacher-assignments','teacher-analytics':'tab-teacher-analytics'};
    for(const [hash,id] of Object.entries(routes)){
      await page.evaluate(hash=>{location.hash=hash;},hash);
      await page.locator('#'+id).waitFor({state:'visible'});
      console.log('PASS route '+hash);
    }
    await page.evaluate(()=>{location.hash='teacher-reports';});
    await page.waitForTimeout(300);
    console.log('REPORTS BASELINE',await page.locator('#teacher-reports').isVisible());
    await page.evaluate(()=>{location.hash='teacher-overview';});
    await page.locator('#reference-student-carousel [data-student-uid]').first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#holistic-live').evaluate(node=>node.parentElement?.id),'tab-teacher-care-alerts');
    assert.equal(await page.locator('.classcare-brand-icon').evaluate(node=>getComputedStyle(node).backgroundImage.includes('classcare-symbol-color.svg')),true);
    console.log('OVERVIEW POSITION',await page.evaluate(()=>({bodyScroll:document.body.scrollTop,docScroll:document.documentElement.scrollTop,mainScroll:document.querySelector('.app-main')?.scrollTop,contentScroll:document.querySelector('.app-content')?.scrollTop,summary:document.querySelector('.summary-header-card')?.getBoundingClientRect().toJSON(),record:document.querySelector('.workspace-right-col')?.getBoundingClientRect().toJSON()})));
    fs.mkdirSync('test-results/integration',{recursive:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'test-results/integration/before-overview.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS desktop navigation/Overview presentation slice; live care remains on Care Alerts and secondary write actions were not exercised');
  } finally { await browser?.close(); await env?.cleanup(); server.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
