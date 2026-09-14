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
    for (const [id, data] of Object.entries({ teacher:{role:'teacher',section:'A',assigned_sections:['A'],pending_approval:false}, other:{role:'teacher',section:'B',assigned_sections:['B'],pending_approval:false}, disabled:{role:'teacher',pending_approval:false,disabled:true}, disabledAdmin:{role:'admin',disabled:true}, pending:{role:'teacher',section:'A',pending_approval:true}, student:{role:'student',section:'A'}, outsider:{role:'student',section:'B'}, admin:{role:'admin'} })) await setDoc(doc(db,'users',id),data);
    for (let i=0;i<15;i++) await setDoc(doc(db,'users',`row${i}`),{ role:'student',section:'A' });
  });
});
after(async () => env?.cleanup());
test('approved teacher publishes; pending teacher and student cannot', async () => {
  await assertSucceeds(setDoc(doc(env.authenticatedContext('teacher').firestore(),'summativeAssessments','weekly'),assessment()));
  await assertFails(setDoc(doc(env.authenticatedContext('pending').firestore(),'summativeAssessments','blocked'),{...assessment(),teacherId:'pending'}));
  await assertFails(setDoc(doc(env.authenticatedContext('student').firestore(),'summativeAssessments','blocked'),{...assessment(),teacherId:'student'}));
});
test('assessment validates range and immutable grading scale; approved teachers may publish any section', async () => {
  const db = env.authenticatedContext('teacher').firestore();
  await assertSucceeds(setDoc(doc(db,'summativeAssessments','other-section'),{...assessment(),section:'B'}));
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
test('students receive schedules but no scores; approved staff can read scores', async () => {
  const student = env.authenticatedContext('student').firestore();
  await assertSucceeds(getDocs(query(collection(student,'summativeAssessments'),where('section','==','A'))));
  await assertFails(getDocs(query(collection(student,'summativeScores'),where('studentId','==','student'))));
  await assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(),'summativeScores','weekly_student')));
  await assertFails(getDocs(collection(student,'summativeScores')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('other').firestore(),'summativeScores','weekly_student')));
});
test('staff save 15 students in three validated five-row chunks', async () => {
  const db = env.authenticatedContext('teacher').firestore();
  for (let offset=0; offset<15; offset+=5) {
    const batch = writeBatch(db);
    for (let i=offset;i<offset+5;i++) batch.set(doc(db,'summativeScores',`weekly_row${i}`),score(`row${i}`));
    await assertSucceeds(batch.commit());
  }
});
test('pending teachers cannot self-approve or register privileged roles', async () => {
  const db = env.authenticatedContext('pending').firestore();
  await assertFails(updateDoc(doc(db,'users','pending'),{pending_approval:false}));
  await assertFails(setDoc(doc(db,'attendance','student_2026-09-10'),{student_uid:'student'}));
  await assertFails(updateDoc(doc(env.authenticatedContext('teacher').firestore(),'users','student'),{role:'admin'}));
});
test('students can self-register only as pending profiles and cannot submit check-ins before approval', async () => {
  const db = env.authenticatedContext('newStudent').firestore();
  await assertSucceeds(setDoc(doc(db,'users','newStudent'),{
    uid:'newStudent',
    email:'new@student.test',
    username:'newstudent',
    first_name:'New',
    last_name:'Student',
    role:'student',
    student_id:'S-NEW',
    section:'',
    grade_level:null,
    enrollment_status:'pending',
    pending_approval:true,
    disabled:false,
    parent_name:'Guardian',
    parent_contact:'09123456789',
    parent_email:'guardian@example.test',
    photo_data:'data:image/jpeg;base64,synthetic',
    created_at:serverTimestamp()
  }));
  await assertFails(setDoc(doc(db,'users','newTeacher'),{role:'teacher',pending_approval:true}));
  await assertFails(setDoc(doc(db,'users','newStudent2'),{role:'student',student_id:'S-2',section:'A',pending_approval:true}));
  await assertFails(setDoc(doc(db,'emotional_checkins','newStudent_today'),{student_uid:'newStudent',studentId:'newStudent',section:'',emotion:'happy'}));
});
test('care alert creation, acknowledgment and isolation', async () => {
  const db = env.authenticatedContext('teacher').firestore();
  await assertSucceeds(getDoc(doc(db,'careAlerts','teacher_student')));
  await assertSucceeds(setDoc(doc(db,'careAlerts','teacher_student'),{teacherId:'teacher',studentId:'student',section:'A',status:'Open',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(doc(db,'careAlerts','teacher_student'),{status:'Acknowledged',updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(env.authenticatedContext('student').firestore(),'careAlerts','teacher_student')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('other').firestore(),'careAlerts','teacher_student')));
});
test('deep checks require approved staff and five valid answers', async () => {
  const answers = Object.fromEntries(['mood','stress','motivation','support','needs'].map(id => [id,{option:1,label:'Good'}]));
  const data = { studentId:'student', student_uid:'student',section:'A',teacherId:'teacher',recorded_by:'teacher',recorded_via:'deep_kiosk',questionnaire_version:1,created_at:serverTimestamp(),date:'2026-09-10',answers,flags:[],is_negative:false,emotion:'happy' };
  const db = env.authenticatedContext('teacher').firestore();
  await assertSucceeds(setDoc(doc(db,'emotional_checkins','deep'),data));
  await assertFails(setDoc(doc(db,'emotional_checkins','incomplete'),{...data,answers:{mood:answers.mood}}));
  await assertFails(setDoc(doc(env.authenticatedContext('student').firestore(),'emotional_checkins','forged-deep'),data));
  await assertFails(updateDoc(doc(env.authenticatedContext('student').firestore(),'emotional_checkins','deep'),{recorded_via:'student_portal',emotion:'happy'}));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('student').firestore(),'emotional_checkins','deep')));
});
test('private concerns cannot be read or marked resolved by another student', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(),'concern_submissions','private'),{studentId:'student',student_uid:'student',section:'A',message:'Private concern',status:'Open'}));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('student').firestore(),'concern_submissions','private')));
  await assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(),'concern_submissions','private')));
  await assertFails(updateDoc(doc(env.authenticatedContext('student').firestore(),'concern_submissions','private'),{status:'Resolved'}));
});

test('disabled staff are denied, including administrator profiles', async () => {
  for (const uid of ['disabled','disabledAdmin']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDocs(collection(db,'summativeScores')));
    await assertFails(setDoc(doc(db,'attendance','disabled-write'),{student_uid:'student'}));
  }
});
test('student profiles and term grades remain private', async () => {
  const db = env.authenticatedContext('student').firestore();
  await assertSucceeds(getDoc(doc(db,'users','student')));
  await assertFails(getDoc(doc(db,'users','outsider')));
  await assertFails(getDocs(collection(db,'grades')));
  await assertFails(getDocs(collection(db,'telegram_users')));
});
