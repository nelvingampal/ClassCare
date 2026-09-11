// Synthetic browser tests: real service worker/cache/IndexedDB and downloaded reports.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:5601';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'5601'},stdio:'ignore',windowsHide:true});
  let browser;
  try {
    for(let n=0;n<40;n++){try{if((await fetch(base+'/index.html')).ok)break;}catch{}await wait(250);}
    browser=await chromium.launch({channel:'msedge',headless:true});
    const ctx=await browser.newContext({acceptDownloads:true});
    await ctx.route(base+'/probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic verification harness</title><button id="btn-export-csv">CSV</button><button id="btn-export-excel">Excel</button>'}));
    let page=await ctx.newPage();await page.goto(base+'/probe');
    await page.evaluate(async()=>{
      await (await caches.open('classcare-data-old')).put('/private-fixture',new Response('synthetic private fixture'));
      await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.equal(await page.evaluate(async()=> (await caches.keys()).includes('classcare-data-old')),false);
    await ctx.setOffline(true);
    assert.equal(await page.evaluate(async()=> (await fetch('/teacher/scanner.html')).ok),true);
    await page.close();page=await ctx.newPage();await page.goto(base+'/probe');
    assert.equal(await page.evaluate(async()=> (await fetch('/js/offline-sync.js')).ok),true);
    assert.equal(await page.evaluate(async()=> (await caches.match('/private-fixture'))!==undefined),false);
    console.log('PASS service worker installs, removes old private cache, and serves static assets after offline tab reopening');
    await ctx.setOffline(false);
    await page.evaluate(()=>{
      window.writes=[];window.owner='teacher-a';
      window.ClassCare={getFirebase:()=>({auth:{currentUser:{uid:window.owner},onAuthStateChanged:()=>()=>{}}}),DB:{attendanceDocId:(uid,date)=>uid+'_'+date,attendance:{doc:()=>({set:async data=>window.writes.push(data)})}}};
      window.firebase={firestore:{FieldValue:{serverTimestamp:()=> 'SYNTHETIC_TIMESTAMP'}}};
      window.Utils={todayIso:()=> '2026-09-12'};
    });
    await page.addScriptTag({url:base+'/js/offline-sync.js'});
    await ctx.setOffline(true);
    await page.evaluate(async()=>{
      await OfflineSync.enqueueAttendance({student_uid:'s1',date:'2026-09-12',time_in:'07:30',status:'Present'});
      await OfflineSync.enqueueAttendance({student_uid:'s1',date:'2026-09-12',time_out:'16:00'});
    });
    await page.close();page=await ctx.newPage();await page.goto(base+'/probe');
    await page.evaluate(()=>{
      window.writes=[];window.owner='teacher-b';window.ClassCare={getFirebase:()=>({auth:{currentUser:{uid:window.owner},onAuthStateChanged:()=>()=>{}}}),DB:{attendanceDocId:(uid,date)=>uid+'_'+date,attendance:{doc:()=>({set:async data=>window.writes.push(data)})}}};
      window.firebase={firestore:{FieldValue:{serverTimestamp:()=> 'SYNTHETIC_TIMESTAMP'}}};window.Utils={todayIso:()=> '2026-09-12'};
    });
    await page.addScriptTag({url:base+'/js/offline-sync.js'});
    await ctx.setOffline(false);
    await page.evaluate(()=>OfflineSync.flushAll());assert.equal(await page.evaluate(()=>writes.length),0);
    await page.evaluate(async()=>{window.owner='teacher-a';await OfflineSync.flushAll();});
    const writes=await page.evaluate(()=>writes);assert.equal(writes.length,1);assert.equal(writes[0].time_in,'07:30');assert.equal(writes[0].time_out,'16:00');
    assert.equal(await page.evaluate(async()=> (await OfflineSync.pendingCount()).attendance),0);
    console.log('PASS real IndexedDB survives offline tab reopening, denies other-account replay, and merges arrival/time-out on reconnection (mock write adapter)');
    await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'});
    await page.evaluate(()=>{
      window.Toast={error:m=>{throw Error(m)},warn:m=>{throw Error(m)},success:()=>{}};
      window._teacherExportData=()=>({section:'Synthetic A',list:[{uid:'s1',first_name:'=1+1',last_name:'Comma, Name',student_id:'S001',section:'Synthetic A'},{uid:'s2',first_name:'Missing',last_name:'History',section:'Synthetic A'}],attMap:new Map([['s1',{time_in:'07:30',time_out:'16:00',status:'Present',wellbeing_data:{q1:'Mostly',q2:'Very much',q3:'Mostly safe',q4:'Most of them',q5:'Mostly ready'},emotion_checkin_3step:{mood:'Okay',stress:'A little stressed',need:'Rest'}}]])});
    });
    await page.addScriptTag({url:base+'/teacher/export.js'});await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
    fs.mkdirSync('test-results/reliability',{recursive:true});
    for(const type of ['csv','excel']){
      const download=page.waitForEvent('download');await page.click('#btn-export-'+type);const d=await download;
      const file='test-results/reliability/'+d.suggestedFilename();await d.saveAs(file);
      const result=await page.evaluate(bytes=>{const wb=XLSX.read(new Uint8Array(bytes),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];return {rows:XLSX.utils.sheet_to_json(ws,{defval:''}),filter:ws['!autofilter'],formula:Object.values(ws).some(c=>c && c.f)};},[...fs.readFileSync(file)]);
      assert.equal(result.rows.length,2);assert.equal(result.rows[0]['Legacy check-in: class enjoyment'],'Very much');assert.equal(result.rows[0]['Requested support'],'Rest');assert.equal(result.rows[1].Status,'Not recorded');assert.equal(result.rows[1].Mood,'');assert.equal('Feeling' in result.rows[0],false);assert.equal(result.formula,false);
      if(type==='csv')assert.equal(result.rows[0]['First Name'],"'=1+1");
      else assert.equal(result.filter.ref,'A1:R3');
    }
    console.log('PASS downloaded CSV/XLSX agree on question labels, missing history, current responses, formula-safe names and full-column filtering');
    await ctx.close();
  }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
