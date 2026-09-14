/* All fixture identities and scores are isolated in demo-classcare emulators. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
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
      for (const [role,identity] of Object.entries(identities)) await setDoc(doc(db,'users',identity.uid),{role, email:identity.email,first_name:'Fixture',last_name:role,section:'Grade 5-A',assigned_sections:role==='teacher'?['Grade 5-A','Grade 6-B']:[],pending_approval:false,enrollment_status:'enrolled',student_id:role==='student'?'TEST-001':''});
      for(let i=2;i<=30;i++) await setDoc(doc(db,'users','visual-student-'+i),{role:'student',first_name:'Sample',last_name:'Student '+i,section:'Grade 5-A',pending_approval:false,enrollment_status:'enrolled',student_id:'VIS-'+i});
      await setDoc(doc(db,'users','other-class-student'),{role:'student',first_name:'Other Class',last_name:'Student',section:'Grade 6-B',student_id:'CROSS-001',pending_approval:false,enrollment_status:'enrolled'});
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      await setDoc(doc(db,'summativeScores','cross-score'),{studentId:'other-class-student',teacherId:identities.teacher.uid,assessmentId:'cross-assessment',score:8,maxScore:10,thresholdPercent:75,subject:'Math',assessmentDate:today,section:'Grade 6-B'});
      await setDoc(doc(db,'emotional_checkins','cross-response'),{studentId:'other-class-student',student_uid:'other-class-student',section:'Grade 6-B',date:today,mood:'Okay',stress:'A little stressed',need:'Rest',recorded_via:'qr_scanner',is_negative:false});
      await setDoc(doc(db,'settings','global'),{morning_start:'07:30',morning_late_cutoff:'07:45',enrollment_open:false});
    });
    browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const errors = [];
    async function context(role) {
      const ctx = await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true,permissions:['camera'],viewport:{width:1280,height:900}});
      await ctx.route(/https:\/\/(?:firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|api\.telegram\.org|api\.emailjs\.com|generativelanguage\.googleapis\.com)/, route => route.abort());
      await ctx.route('**/js/config.js', route => route.fulfill({contentType:'application/javascript',body:"window.CLASSCARE_CONFIG={firebase:{apiKey:'demo-key',projectId:'demo-classcare',authDomain:'demo-classcare.firebaseapp.com'}};"}));
      await ctx.route('**/config/firebase-config.js', route => route.fulfill({contentType:'application/javascript',body:fs.readFileSync('config/firebase-config.js','utf8')}));
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
    assert.equal(await page.locator('#nav-scores-group a').count(),2);
    assert.equal(await page.locator('#nav-tools-group a').count(),3);
    const routes={'teacher-overview':'tab-teacher-overview','teacher-students':'tab-teacher-students','teacher-attendance':'tab-teacher-attendance','teacher-register':'tab-teacher-attendance','teacher-summative':'tab-teacher-summative','teacher-grades':'tab-teacher-grades','teacher-care-alerts':'tab-teacher-care-alerts','teacher-enrollment':'tab-teacher-enrollment','teacher-assignments':'tab-teacher-assignments','teacher-analytics':'tab-teacher-analytics'};
    for(const [hash,id] of Object.entries(routes)){
      const link=page.locator('.classcare-nav-links a[href="#'+hash+'"]');
      if(await link.count()) { await link.evaluate(a=>{const group=a.closest('details');if(group)group.open=true;}); await link.click(); } else await page.evaluate(hash=>{location.hash=hash;},hash);
      await page.locator('#'+id).waitFor({state:'visible'});
      console.log('PASS route '+hash);
    }
    await page.evaluate(()=>{location.hash='teacher-reports';});
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#teacher-reports').isVisible(),true,'Reports remains accessible');
    await page.evaluate(()=>{location.hash='teacher-overview';});
    await page.locator('#overview-care-status').waitFor({state:'visible'});
    assert.equal(await page.locator('#tab-teacher-overview #student-record-panel').count(),0,'Overview does not render individual records');
    await page.locator('.classcare-nav-links a[href="#teacher-students"]').click();
    await page.locator('[data-directory-review]').first().waitFor();
    assert.equal(await page.locator('#student-record-panel').isVisible(),false,'No record before explicit selection');
    assert.equal(await page.locator('#reference-student-carousel').count(),0,'One directory, no competing carousel');
    await page.waitForTimeout(500);
    await page.locator('.classcare-nav-links a[href="#teacher-care-alerts"]').click();
    await page.locator('#holistic-live').waitFor({state:'visible'});
    assert.equal(await page.locator('#holistic-live').evaluate(node=>node.parentElement?.id),'teacher-care-alerts');
    assert.equal(await page.locator('#holistic-live').isVisible(),true);
    assert.equal(await page.locator('.classcare-brand-icon').evaluate(node=>getComputedStyle(node).backgroundImage.includes('classcare-heart-learners-color.svg')),true);
    fs.mkdirSync('test-results/integration',{recursive:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{location.hash='teacher-wellness';});
    await page.locator('#teacher-wellness').waitFor({state:'visible'});
    const logo=await page.locator('.classcare-brand-icon').evaluate(async node=>{const src=getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];const image=new Image();image.src=src;await image.decode();return image.naturalWidth;});
    assert.ok(logo>0,'Brand asset decodes');
    await page.locator('.classcare-nav-links a[href="#teacher-students"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-directory-review]').length===31);
    await page.locator('#directory-section').selectOption('Grade 6-B');
    assert.equal(await page.locator('[data-directory-review]').count(),1);
    await page.locator('[data-directory-review]').click();
    await page.waitForFunction(()=>document.querySelector('#record-student-subtitle').textContent.includes('CROSS-001'));
    await page.waitForFunction(()=>document.querySelector('#metric-score-late').textContent==='80.0');
    await page.waitForFunction(()=>document.querySelector('#metric-support-late').textContent.includes('Okay · A little stressed · Rest'));
    assert.equal(await page.locator('#directory-record-mount #student-record-panel').count(),1);
    await page.locator('#directory-back').click();
    assert.equal(await page.locator('#student-record-panel').isVisible(),false,'Back closes student history');
    await page.locator('#directory-section').selectOption('');
    await page.locator('#directory-search').fill('VIS-30');
    assert.equal(await page.locator('[data-directory-review]').count(),1);
    await page.locator('[data-directory-review]').press('Enter');
    await page.locator('#directory-detail').waitFor({state:'visible'});
    assert.match(await page.locator('#record-card-title').textContent(),/Sample Student 30/);
    assert.equal(await page.locator('#record-card-title').evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('#student-record-panel').count(),1,'Record view is moved, not duplicated');
    assert.equal(await page.locator('#metric-score-late-meta').textContent(),'Not recorded');
    await page.screenshot({path:'test-results/integration/student-detail.png'});
    await page.evaluate(()=>Theme.toggle());
    await page.screenshot({path:'test-results/integration/student-detail-alternate-theme.png'});
    await page.evaluate(()=>Theme.toggle());
    await page.locator('#directory-back').click();
    assert.equal(await page.locator('#student-record-panel').isVisible(),false,'Back closes student history');
    assert.equal(await page.locator('#directory-search').evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('#directory-search').inputValue(),'VIS-30');
    await page.locator('#directory-search').fill('no-such-student');
    assert.equal(await page.locator('[data-directory-review]').count(),0);
    assert.match(await page.locator('#directory-list').textContent(),/No students found/);
    await page.locator('#directory-search').fill('');
    await page.locator('#directory-section').selectOption('Grade 5-A');
    assert.equal(await page.locator('[data-directory-review]').count(),30);
    assert.equal(await page.locator('#btn-spin').count(),1,'Existing picker retained exactly once');
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>{if(Theme.get()!==theme)Theme.toggle();},theme);
      for(const route of ['overview','students','attendance','summative','grades','care-alerts']) {
        await page.locator('.classcare-nav-links a[href="#teacher-'+route+'"]').evaluate(a=>{const group=a.closest('details');if(group)group.open=true;});
        await page.locator('.classcare-nav-links a[href="#teacher-'+route+'"]').click();
        const panel=page.locator('#tab-teacher-'+route);
        await panel.waitFor({state:'visible'});
        if(route==='attendance') {
          const columns=await page.locator('#attendance-tbody').evaluate(body=>({headers:body.closest('table').querySelectorAll('thead th').length,cells:body.querySelector('tr').cells.length}));
          assert.equal(columns.headers,8);
          assert.equal(columns.cells,8);
        }
        const contrast=await panel.locator('.card-title, .btn-secondary, .class-info-title, .record-hero-name, .identity-name, .student-pill-name, #hero-current-date, .summary-value').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).map(node=>{
          const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
          const luminance=values=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
          let parent=node,background;while(parent){const bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'){background=bg;break;}parent=parent.parentElement;}
          const a=luminance(rgb(getComputedStyle(node).color)),b=luminance(rgb(background||'rgb(255,255,255)'));
          return {text:node.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        }));
        assert.ok(contrast.every(item=>item.ratio>=4.5),theme+' '+route+' '+JSON.stringify(contrast));
        await page.screenshot({path:'test-results/integration/'+theme+'-'+route+'.png'});
      }
    }
    await page.setViewportSize({width:1440,height:900});
    await page.locator('.classcare-nav-links a[href="#teacher-overview"]').click();
    const wideSummary = await page.locator('#tab-teacher-overview .summary-header-card').boundingBox();
    assert.ok(wideSummary && wideSummary.y + wideSummary.height <= 900,'Overview summary fits 1440x900');
    await page.setViewportSize({width:1280,height:800});
    const compactSummary = await page.locator('#tab-teacher-overview .summary-header-card').boundingBox();
    assert.ok(compactSummary && compactSummary.y + compactSummary.height <= 800,'Overview summary fits 1280x800');
    for (const size of [{width:1440,height:900},{width:1280,height:800}]) {
      await page.setViewportSize(size);
      const selector=page.locator('#tab-teacher-overview #section-select');
      await selector.waitFor({state:'visible'});
      const box=await selector.boundingBox();
      assert.ok(box && box.y>=0 && box.y+box.height<=size.height,'Class selector visible above fold');
      assert.equal(await selector.inputValue(),'Grade 5 A','Selector retains actual active section after population');
      await page.screenshot({path:`test-results/integration/repaired-overview-${size.width}.png`});
    }
    console.log('PASS desktop navigation/Overview hierarchy at 1440x900 and 1280x800; care detail is on Care Alerts');
    await page.evaluate(()=>ClassCare.getFirebase().auth.signOut());
    await page.waitForFunction(()=>document.querySelectorAll('[data-directory-review]').length===0);
    assert.equal(await page.locator('#directory-search').inputValue(),'');
    assert.deepEqual(errors,[]);
  } finally { await browser?.close(); await env?.cleanup(); server.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
