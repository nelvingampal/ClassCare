const { test, before, after } = require('node:test');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, serverTimestamp, writeBatch } = require('firebase/firestore');
let env;
const assessment = () => ({ teacherId:'teacher', section:'A', title:'Week 1', subject:'Math', scheduledDate:'2026-09-10', maxScore:20, thresholdPercent:75, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
const score = (studentId = 'student', changes = {}) => ({ assessmentId:'weekly', studentId, student_uid:studentId, teacherId:'teacher', section:'A', subject:'Math', score:10, maxScore:20, thresholdPercent:75, assessmentDate:'2026-09-10', updatedAt:serverTimestamp(), ...changes });
before(async () => {
  env = await initializeTestEnvironment({ projectId:'demo-classcare', firestore:{ rules:fs.readFileSync('firestore.rules','utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, data] of Object.entries({ teacher:{role:'teacher',section:'A',assigned_sections:['A'],pending_approval:false}, other:{role:'teacher',section:'B'}, pending:{role:'teacher',section:'A',pending_approval:true}, student:{role:'student',section:'A'}, outsider:{role:'student',section:'B'}, admin:{role:'admin'} })) await setDoc(doc(db,'users',id),data);
    for (let i=0;i<15;i++) await setDoc(doc(db,'users',`row${i}`),{ role:'student',section:'A' });
  });
});
after(async () => env?.cleanup());
test('approved teacher publishes; pending teacher and student cannot', async () => {
  await assertSucceeds(setDoc(doc(env.authenticatedContext('teacher').firestore(),'summativeAssessments','weekly'),assessment()));
  await assertFails(setDoc(doc(env.authenticatedContext('pending').firestore(),'summativeAssessments','blocked'),{...assessment(),teacherId:'pending'}));
  await assertFails(setDoc(doc(env.authenticatedContext('student').firestore(),'summativeAssessments','blocked'),{...assessment(),teacherId:'student'}));
});
test('assessment validates section, range, and immutable grading scale', async () => {
  const db = env.authenticatedContext('teacher').firestore();
  await assertFails(setDoc(doc(db,'summativeAssessments','wrong-section'),{...assessment(),section:'B'}));
  await assertFails(setDoc(doc(db,'summativeAssessments','zero-max'),{...assessment(),maxScore:0}));
  await assertFails(updateDoc(doc(db,'summativeAssessments','weekly'),{maxScore:10,updatedAt:serverTimestamp()}));
});
test('score validation rejects out-of-range, forged subject, other section, and student writes', async () => {
  const db = env.authenticatedContext('teacher').firestore();
  await assertSucceeds(getDoc(doc(db,'summativeScores','weekly_student')));
  await assertSucceeds(setDoc(doc(db,'summativeScores','weekly_student'),score()));
  await assertFails(setDoc(doc(db,'summativeScores','weekly_student'),score('student',{score:21})));
  await assertFails(setDoc(doc(db,'summativeScores','weekly_student'),score('student',{subject:'Forged'})));
  await assertFails(setDoc(doc(db,'summativeScores','weekly_outsider'),score('outsider')));
  await assertFails(setDoc(doc(env.authenticatedContext('student').firestore(),'summativeScores','weekly_student'),score()));
});
test('students receive their schedules and scores without cross-student leakage', async () => {
  const student = env.authenticatedContext('student').firestore();
  await assertSucceeds(getDocs(query(collection(student,'summativeAssessments'),where('section','==','A'))));
  await assertSucceeds(getDocs(query(collection(student,'summativeScores'),where('studentId','==','student'))));
  await assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(),'summativeScores','weekly_student')));
  await assertFails(getDocs(collection(student,'summativeScores')));
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),'summativeScores','weekly_student')));
});
test('staff can atomically save a 15-row chunk within rule access limits', async () => {
  const db = env.authenticatedContext('teacher').firestore(), batch = writeBatch(db);
  for (let i=0;i<15;i++) batch.set(doc(db,'summativeScores',`weekly_row${i}`),score(`row${i}`));
  await assertSucceeds(batch.commit());
});
test('pending teachers cannot self-approve or register privileged roles', async () => {
  const db = env.authenticatedContext('pending').firestore();
  await assertFails(updateDoc(doc(db,'users','pending'),{pending_approval:false}));
  await assertFails(setDoc(doc(db,'attendance','student_2026-09-10'),{student_uid:'student'}));
  await assertFails(updateDoc(doc(env.authenticatedContext('teacher').firestore(),'users','student'),{role:'admin'}));
});
test('care alert creation, acknowledgment and isolation', async () => {
  const db = env.authenticatedContext('teacher').firestore();
  await assertSucceeds(getDoc(doc(db,'careAlerts','teacher_student')));
  await assertSucceeds(setDoc(doc(db,'careAlerts','teacher_student'),{teacherId:'teacher',studentId:'student',status:'Open',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(doc(db,'careAlerts','teacher_student'),{status:'Acknowledged',updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(env.authenticatedContext('student').firestore(),'careAlerts','teacher_student')));
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),'careAlerts','teacher_student')));
});
test('deep checks require a staff member, their section, and five valid answers', async () => {
  const answers = Object.fromEntries(['mood','stress','motivation','support','needs'].map(id => [id,{option:1,label:'Good'}]));
  const data = { student_uid:'student',section:'A',teacherId:'teacher',recorded_by:'teacher',recorded_via:'deep_kiosk',questionnaire_version:1,created_at:serverTimestamp(),date:'2026-09-10',answers,flags:[],is_negative:false,emotion:'happy' };
  const db = env.authenticatedContext('teacher').firestore();
  await assertSucceeds(setDoc(doc(db,'emotional_checkins','deep'),data));
  await assertFails(setDoc(doc(db,'emotional_checkins','incomplete'),{...data,answers:{mood:answers.mood}}));
  await assertFails(setDoc(doc(env.authenticatedContext('student').firestore(),'emotional_checkins','forged-deep'),data));
  await assertFails(updateDoc(doc(env.authenticatedContext('student').firestore(),'emotional_checkins','deep'),{recorded_via:'student_portal',emotion:'happy'}));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('student').firestore(),'emotional_checkins','student_2026-09-10')));
});
test('private concerns cannot be read or marked resolved by another student', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(),'concern_submissions','private'),{student_uid:'student',message:'Private concern',status:'Open'}));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('student').firestore(),'concern_submissions','private')));
  await assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(),'concern_submissions','private')));
  await assertFails(updateDoc(doc(env.authenticatedContext('student').firestore(),'concern_submissions','private'),{status:'Resolved'}));
});
