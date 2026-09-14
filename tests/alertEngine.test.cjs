const { test } = require('node:test');
const assert = require('node:assert/strict');
const AlertEngine = require('../js/alertEngine.js');

test('AlertEngine isNegativeCheckin accurately detects negative moods and flags', () => {
  assert.equal(AlertEngine.isNegativeCheckin({ emotion: 'Sad' }), true);
  assert.equal(AlertEngine.isNegativeCheckin({ emotion: 'stressed' }), true);
  assert.equal(AlertEngine.isNegativeCheckin({ emotion: 'happy', flags: ['not_good'] }), true);
  assert.equal(AlertEngine.isNegativeCheckin({ emotion: 'happy' }), false);
  assert.equal(AlertEngine.isNegativeCheckin({ is_negative: true }), true);
  assert.equal(AlertEngine.isNegativeCheckin(null), false);
});

test('evaluateCareAlert strictly requires BOTH failing grade AND sustained negative emotions', async () => {
  // Mock ClassCare database
  let alertsWritten = [];
  const mockTeacher = { uid: 'teacher-1' };

  function setupMock({ score = 60, maxScore = 100, thresholdPercent = 75, emotions = [], existingAlertStatus = null }) {
    alertsWritten = [];
    global.ClassCare = {
      collection: (name) => {
        if (name === 'summativeScores') {
          return {
            where: () => ({
              where: () => ({
                get: async () => ({
                  empty: false,
                  docs: [{
                    id: 'score-1',
                    data: () => ({
                      score,
                      maxScore,
                      thresholdPercent,
                      assessmentDate: '2026-09-14',
                      subject: 'Math',
                      assessmentTitle: 'Math Exam'
                    })
                  }]
                })
              })
            })
          };
        }
        if (name === 'emotional_checkins') {
          return {
            where: () => ({
              where: () => ({
                where: () => ({
                  get: async () => ({
                    docs: emotions.map((emo, idx) => ({
                      id: `emo-${idx}`,
                      data: () => ({
                        date: `2026-09-${14 - idx}`,
                        ...emo
                      })
                    }))
                  })
                })
              })
            })
          };
        }
        if (name === 'careAlerts') {
          return {
            doc: (id) => ({
              get: async () => ({
                exists: existingAlertStatus !== null,
                data: () => ({ status: existingAlertStatus })
              }),
              set: async (payload) => {
                alertsWritten.push({ id, ...payload });
              }
            })
          };
        }
        return {};
      }
    };
  }

  // Case 1: Failing grade (< 75%) + sustained negative emotions across distinct days -> CREATES ALERT
  setupMock({
    score: 60,
    maxScore: 100,
    thresholdPercent: 75,
    emotions: [{ emotion: 'Sad' }, { emotion: 'Stressed' }]
  });
  let res = await AlertEngine.evaluateCareAlert('student-1', 'Section-A', mockTeacher);
  assert.equal(res.created, true);
  assert.equal(alertsWritten.length, 1);
  assert.equal(alertsWritten[0].status, 'Open');
  assert.equal(alertsWritten[0].studentId, 'student-1');
  assert.equal(alertsWritten[0].teacherId, 'teacher-1');
  assert.equal(alertsWritten[0].negativeCheckinDays, 2);

  // Case 2: Passing grade (85%) + negative emotions -> NO ALERT
  setupMock({
    score: 85,
    maxScore: 100,
    thresholdPercent: 75,
    emotions: [{ emotion: 'Sad' }, { emotion: 'Stressed' }]
  });
  res = await AlertEngine.evaluateCareAlert('student-1', 'Section-A', mockTeacher);
  assert.equal(res.created, false);
  assert.match(res.reason, /passing/);
  assert.equal(alertsWritten.length, 0);

  // Case 3: Failing grade + ONLY positive emotions -> NO ALERT
  setupMock({
    score: 50,
    maxScore: 100,
    thresholdPercent: 75,
    emotions: [{ emotion: 'Happy' }, { emotion: 'Okay' }]
  });
  res = await AlertEngine.evaluateCareAlert('student-1', 'Section-A', mockTeacher);
  assert.equal(res.created, false);
  assert.match(res.reason, /No sustained pattern/);
  assert.equal(alertsWritten.length, 0);

  // Case 4: Failing grade + single isolated negative emotion (1 sad out of 3, < 50%) -> NO ALERT
  setupMock({
    score: 50,
    maxScore: 100,
    thresholdPercent: 75,
    emotions: [{ emotion: 'Sad' }, { emotion: 'Happy' }, { emotion: 'Happy' }]
  });
  res = await AlertEngine.evaluateCareAlert('student-1', 'Section-A', mockTeacher);
  assert.equal(res.created, false);
  assert.match(res.reason, /No sustained pattern/);
  assert.equal(alertsWritten.length, 0);

  // Case 5: Failing grade + two negative check-ins on the same day -> NO ALERT
  setupMock({
    score: 50,
    maxScore: 100,
    thresholdPercent: 75,
    emotions: [{ emotion: 'Sad', date: '2026-09-14' }, { emotion: 'Stressed', date: '2026-09-14' }]
  });
  res = await AlertEngine.evaluateCareAlert('student-1', 'Section-A', mockTeacher);
  assert.equal(res.created, false);
  assert.match(res.reason, /1 distinct negative day/);
  assert.equal(alertsWritten.length, 0);

  // Case 6: Failing grade + sustained negative emotions, but an 'Open' alert already exists -> NO DUPLICATE
  setupMock({
    score: 50,
    maxScore: 100,
    thresholdPercent: 75,
    emotions: [{ emotion: 'Sad' }, { emotion: 'Stressed' }],
    existingAlertStatus: 'Open'
  });
  res = await AlertEngine.evaluateCareAlert('student-1', 'Section-A', mockTeacher);
  assert.equal(res.created, false);
  assert.match(res.reason, /Active 'Open' alert already exists/);
  assert.equal(alertsWritten.length, 0);
});
