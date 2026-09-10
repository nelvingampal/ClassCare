const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/holistic-core.js');
const score = (changes = {}) => ({ id:'score-a', studentId:'s1', teacherId:'t1', section:'A', subject:'Math', assessmentDate:'2026-09-10', score:14, maxScore:20, thresholdPercent:75, ...changes });
const check = (changes = {}) => ({ id:'check-a', student_uid:'s1', date:'2026-09-10', emotion:'stressed', ...changes });
const care = (scores, checks) => H.correlate(scores, checks, '2026-09-10');
test('Manila dates cross UTC midnight consistently', () => {
  assert.equal(H.schoolDate(new Date('2026-09-09T16:01:00Z')), '2026-09-10');
  assert.equal(H.schoolTime(new Date('2026-09-09T16:01:00Z')), '00:01');
});
test('missing, invalid, and future scores never manufacture poor performance', () => {
  for (const value of ['', null, undefined, -1, 21, NaN, true]) assert.equal(H.percent(value, 20), null);
  assert.equal(care([score({ assessmentDate:'2026-09-11' })], [check()]).size, 0);
  assert.equal(care([score({ score:null })], [check()]).size, 0);
  assert.equal(care([score({ score:0 })], [check()]).size, 1);
});
test('care needs BOTH qualifying academic and emotional evidence', () => {
  assert.equal(care([score()], [check()]).size, 1);
  assert.equal(care([score({ score:15 })], [check()]).size, 0);
  assert.equal(care([score()], [check({ emotion:'happy' })]).size, 0);
  assert.equal(care([], [check()]).size, 0);
  assert.equal(care([score()], []).size, 0);
  assert.equal(care([score()], [check({ student_uid:'someone-else' })]).size, 0);
});
test('negative flags include Not Good and Not Motivated and expire', () => {
  assert.equal(care([score()], [check({ emotion:'Not Good' })]).size, 1);
  assert.equal(care([score()], [check({ emotion:'happy', flags:['not_motivated'] })]).size, 1);
  assert.equal(care([score()], [check({ date:'2026-08-26' })]).size, 0);
  assert.equal(care([score()], [check({ date:'2026-09-11' })]).size, 0);
  assert.equal(care([score({ assessmentDate:'2026-08-01' })], [check()]).size, 0);
});
test('latest subject assessment supersedes old low scores; other subjects are independent', () => {
  assert.equal(care([score({ assessmentDate:'2026-09-09' }), score({ id:'new', score:20 })], [check()]).size, 0);
  assert.equal(care([score(), score({ id:'new', subject:'English', score:20 })], [check()]).size, 1);
});
test('deep assessments require five explicit answers without timeout defaults', () => {
  assert.throws(() => H.summarize([0,0,0]), /five/);
  assert.throws(() => H.summarize([0,0,0,0,null]), /five/);
  const result = H.summarize([2,2,2,0,0]);
  assert.deepEqual(result.flags, ['not_good','stressed','not_motivated']);
  assert.equal(result.answers.motivation.label, 'Not Motivated');
  assert.equal(H.summarize([0,0,0,0,0]).is_negative, false);
});
test('gesture dwell rejects jitter and requires release before next question', () => {
  const dwell = new H.Dwell();
  assert.equal(dwell.update(1, 0).selected, 0);
  assert.equal(dwell.update(2, 700).selected, 0);
  assert.equal(dwell.update(2, 1500).selected, 0);
  assert.equal(dwell.update(2, 1800).selected, 2);
  assert.equal(dwell.update(2, 4000).selected, 0);
  dwell.update(0, 5000); dwell.update(0, 5400);
  dwell.update(4, 5600); assert.equal(dwell.update(4, 6700).selected, 4);
});
test('no hand is no answer', () => { assert.equal(H.countFingers(null), 0); assert.equal(H.countFingers([]), 0); });
