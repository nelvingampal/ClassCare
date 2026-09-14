const {test,before,after} = require('node:test');
const fs = require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,getDocs,query,where,writeBatch,serverTimestamp} = require('firebase/firestore');
let env;
const records = ['students','attendance','emotionalChecks','emotional_checkins'];
before(async()=>{
 env = await initializeTestEnvironment({projectId:'demo-classcare',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  for(const [uid,data] of Object.entries({s:{role:'student',studentId:'s',section:'A'},other:{role:'student',studentId:'other',section:'B'},t:{role:'teacher',assigned_sections:['A'],pending_approval:false},t2:{role:'teacher',assigned_sections:['B'],pending_approval:false},pending:{role:'teacher',assigned_sections:['A'],pending_approval:true},disabled:{role:'admin',disabled:true},admin:{role:'admin'}})) await setDoc(doc(c.firestore(),'users',uid),data);
  for(const kind of [...records,'summativeScores']) await setDoc(doc(c.firestore(),kind,'record'),{studentId:'s',student_uid:'s',section:'A'});
 });
});
after(async()=>env?.cleanup());
test('every PII collection denies outsiders and unauthenticated access; students can only update own check-ins',async()=>{
 for(const kind of records){
   const own = doc(env.authenticatedContext('s').firestore(),kind,'record');
   await assertSucceeds(getDoc(own));
   if (kind === 'emotionalChecks' || kind === 'emotional_checkins') {
    await assertSucceeds(updateDoc(own,{emotion:'happy'}));
   } else {
    await assertFails(updateDoc(own,{emotion:'happy'}));
   }
  await assertFails(deleteDoc(own));
   if (kind === 'emotionalChecks' || kind === 'emotional_checkins') {
    await assertSucceeds(setDoc(doc(env.authenticatedContext('s').firestore(),kind,'new'),{studentId:'s',section:'A'}));
   } else {
    await assertFails(setDoc(doc(env.authenticatedContext('s').firestore(),kind,'new'),{studentId:'s',section:'A'}));
   }
  await assertSucceeds(getDoc(doc(env.authenticatedContext('t2').firestore(),kind,'record')));
  for(const uid of ['other','pending','disabled']) await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(),kind,'record')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),kind,'record')));
 }
});
test('approved teacher queries may be broad; writes cannot forge student or move records',async()=>{
 const db=env.authenticatedContext('t').firestore();
 await assertSucceeds(getDocs(query(collection(db,'attendance'),where('section','==','A'))));
 await assertSucceeds(getDocs(collection(db,'attendance')));
 await assertSucceeds(setDoc(doc(db,'attendance','new'),{studentId:'s',student_uid:'s',section:'A'}));
 await assertFails(updateDoc(doc(db,'attendance','new'),{section:'B'}));
 await assertFails(updateDoc(doc(db,'attendance','new'),{studentId:'other'}));
 await assertFails(setDoc(doc(db,'attendance','forged'),{studentId:'other',section:'A'}));
 await assertFails(updateDoc(doc(db,'users','t'),{assigned_sections:['A','B']}));
 await assertFails(updateDoc(doc(env.authenticatedContext('s').firestore(),'users','s'),{role:'admin'}));
});
test('scores stay staff-only; no public settings, concerns, or unknown paths',async()=>{
 await assertFails(getDoc(doc(env.authenticatedContext('s').firestore(),'summativeScores','record')));
 await assertSucceeds(getDoc(doc(env.authenticatedContext('t').firestore(),'summativeScores','record')));
 await assertSucceeds(getDoc(doc(env.authenticatedContext('t2').firestore(),'summativeScores','record')));
 await assertFails(getDoc(doc(env.authenticatedContext('s').firestore(),'careAlerts','record')));
 await assertSucceeds(getDoc(doc(env.authenticatedContext('t').firestore(),'careAlerts','record')));
 for(const kind of ['settings','concern_submissions','talkToSomeone','unknown']) {
  const ref=doc(env.unauthenticatedContext().firestore(),kind,'x');
  await assertFails(getDoc(ref)); await assertFails(setDoc(ref,{message:'synthetic'}));
 }
});
test('staff can check absent records and atomically publish section-bound schedules',async()=>{
 const db=env.authenticatedContext('t').firestore();
 await assertSucceeds(getDoc(doc(db,'attendance','s_2026-09-14')));
 const assessment={teacherId:'t',section:'A',title:'Synthetic',subject:'Math',scheduledDate:'2026-09-14',maxScore:20,thresholdPercent:75,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 const batch=writeBatch(db);
 batch.set(doc(db,'summativeAssessments','schedule'),assessment);
 for(const kind of ['notifications','scheduledTests']) batch.set(doc(db,kind,'schedule'),{assessmentId:'schedule',section:'A',teacherId:'t'});
 await assertSucceeds(batch.commit());
 await assertSucceeds(getDocs(query(collection(env.authenticatedContext('s').firestore(),'summativeAssessments'),where('section','==','A'))));
 await assertFails(setDoc(doc(db,'notifications','forged'),{assessmentId:'forged',section:'B',teacherId:'t'}));
 await assertSucceeds(getDoc(doc(env.authenticatedContext('t2').firestore(),'notifications','schedule')));
});
test('legacy staff update can add only the verified auth UID, never a forged owner',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'attendance','legacy'),{student_uid:'s',section:'A'}));
 const ref=doc(env.authenticatedContext('t').firestore(),'attendance','legacy');
 await assertFails(updateDoc(ref,{studentId:'other'}));
 await assertSucceeds(updateDoc(ref,{studentId:'s',time_out:'16:00'}));
});
