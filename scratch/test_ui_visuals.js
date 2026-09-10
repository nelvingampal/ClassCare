const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  fs.mkdirSync('test-results/visual_polish', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Init mock teacher auth
  await page.addInitScript(() => {
    const mockUser = {
      uid: 'teacher-mock-123',
      role: 'teacher',
      email: 'teacher@classcare.edu',
      first_name: 'Elena',
      last_name: 'Ramos',
      section: 'Grade 5-A',
      assigned_sections: ['Grade 5-A', 'Grade 5-B'],
      pending_approval: false
    };
    Object.defineProperty(window, '_mockUser', { value: mockUser, writable: true });
    
    // Intercept ClassCare.onCurrentUser
    const check = setInterval(() => {
      if (window.ClassCare && window.ClassCare.onCurrentUser) {
        clearInterval(check);
        const orig = window.ClassCare.onCurrentUser;
        window.ClassCare.onCurrentUser = function(cb) {
          setTimeout(() => cb(mockUser), 10);
          return () => {};
        };
      }
    }, 10);
  });

  // 1. Standalone Summative Score Tracker (Desktop)
  await page.goto('http://localhost:5500/teacher/summative.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Fill in mock assessment and scores for visual review
  await page.evaluate(() => {
    const authReq = document.getElementById('auth-required');
    if (authReq) authReq.hidden = true;
    const content = document.getElementById('summative-content');
    if (content) content.hidden = false;
    
    // Fill stat ribbon
    const rCount = document.getElementById('stat-roster-count');
    const gCount = document.getElementById('stat-graded-count');
    const avgScore = document.getElementById('stat-average-score');
    const cAlerts = document.getElementById('stat-care-alerts');
    if (rCount) rCount.textContent = '28';
    if (gCount) gCount.textContent = '26 / 28';
    if (avgScore) avgScore.textContent = '84.5%';
    if (cAlerts) cAlerts.textContent = '3';

    // Populate select
    const sel = document.getElementById('assessment-select');
    if (sel) {
      sel.innerHTML = '<option selected>2026-09-10 · Grade 5-A · Mathematics · Unit 3 Summative Quiz</option>';
    }
    const desc = document.getElementById('score-description');
    if (desc) desc.textContent = 'Mathematics · 2026-09-10 · Out of 100 · Care threshold below 75%';

    // Populate roster rows
    const tbody = document.getElementById('score-rows');
    if (tbody) {
      const mockStudents = [
        { name: 'Dela Cruz, Juan', id: 'STD-001', score: '92', pct: '92.0%', status: 'Saved', pass: true },
        { name: 'Santos, Maria', id: 'STD-002', score: '68', pct: '68.0%', status: 'Saved', pass: false },
        { name: 'Reyes, Carlo', id: 'STD-003', score: '88', pct: '88.0%', status: 'Saved', pass: true },
        { name: 'Aquino, Bea', id: 'STD-004', score: '55', pct: '55.0%', status: 'Saved', pass: false },
        { name: 'Bautista, Mark', id: 'STD-005', score: '78', pct: '78.0%', status: 'Unsaved edit', pass: true, dirty: true },
        { name: 'Lim, Chloe', id: 'STD-006', score: '', pct: 'Not recorded', status: 'Not recorded', pass: null }
      ];

      tbody.innerHTML = mockStudents.map((s, i) => `
        <tr class="${i % 2 === 1 ? 'cc-row-alt' : ''}">
          <td>${i + 1}</td>
          <td><strong>${s.name}</strong></td>
          <td>${s.id}</td>
          <td><input type="number" value="${s.score}" ${s.dirty ? 'data-dirty="true"' : ''} style="width:110px;"></td>
          <td>${s.pass === null ? '<span class="cc-badge cc-badge-none">Not recorded</span>' : `<span class="cc-badge ${s.pass ? 'cc-badge-pass' : 'cc-badge-alert'}">${s.pass ? '✓' : '⚠️'} ${s.pct}</span>`}</td>
          <td><span class="cc-badge ${s.status === 'Saved' ? 'cc-badge-saved' : s.status === 'Unsaved edit' ? 'cc-badge-draft' : 'cc-badge-none'}">${s.status}</span></td>
        </tr>
      `).join('');
    }
  });
  await page.screenshot({ path: 'test-results/visual_polish/01_summative_desktop.png', fullPage: true });
  console.log('Captured 01_summative_desktop.png');

  // 2. Summative Mobile View
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/visual_polish/02_summative_mobile.png', fullPage: true });
  console.log('Captured 02_summative_mobile.png');

  // 3. Deep Emotional Check Kiosk (Active Question)
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5500/teacher/deep-check.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.getElementById('auth-required').hidden = true;
    document.getElementById('kiosk-content').hidden = false;
    document.getElementById('scan-panel').hidden = true;
    const deepAssess = document.getElementById('deep-assessment');
    deepAssess.hidden = false;
    document.getElementById('student-name').textContent = 'Juan Dela Cruz (Grade 5-A)';
    document.getElementById('question-step').textContent = 'Question 1 of 5 · Emotional Well-Being';
    document.getElementById('question-title').textContent = 'How are you feeling today?';
    document.getElementById('gesture-status').textContent = '🤖 Hand AI active: Show 1–4 fingers, or tap a card below';
    document.getElementById('gesture-progress').value = 0.65;
    
    const options = document.getElementById('question-options');
    options.innerHTML = `
      <button type="button" class="cc-option"><span style="font-size:1.3rem;">1️⃣</span> 1. Good &amp; Energized</button>
      <button type="button" class="cc-option cc-hover"><span style="font-size:1.3rem;">2️⃣</span> 2. Okay / Normal</button>
      <button type="button" class="cc-option"><span style="font-size:1.3rem;">3️⃣</span> 3. Not Good</button>
      <button type="button" class="cc-option"><span style="font-size:1.3rem;">4️⃣</span> 4. Very Upset / Stressed</button>
    `;
  });
  await page.screenshot({ path: 'test-results/visual_polish/03_deep_kiosk_desktop.png', fullPage: true });
  console.log('Captured 03_deep_kiosk_desktop.png');

  // 4. Daily Attendance Kiosk with Fast Mood Dialog Open
  await page.goto('http://localhost:5500/teacher/scanner.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.getElementById('auth-required').hidden = true;
    document.getElementById('kiosk-content').hidden = false;
    
    // Open fastMood dialog simulation
    const dialog = document.createElement('dialog');
    dialog.className = 'cc-mood-dialog';
    dialog.innerHTML = `
      <h2>How are you feeling today?</h2>
      <p class="cc-student">Maria Santos · Grade 5-A</p>
      <p style="text-align:center;font-size:0.88rem;color:var(--text-muted);margin:-12px 0 18px;">Tap an emoji to record your arrival &amp; emotional vibe</p>
      <div class="cc-options">
        <button type="button" class="cc-option cc-mood-btn cc-mood-happy" data-mood="happy">😊 Happy</button>
        <button type="button" class="cc-option cc-mood-btn cc-mood-okay" data-mood="okay">😐 Okay</button>
        <button type="button" class="cc-option cc-mood-btn cc-mood-sad" data-mood="sad">😢 Sad</button>
        <button type="button" class="cc-option cc-mood-btn cc-mood-stressed" data-mood="stressed">😣 Stressed</button>
      </div>
      <button type="button" class="btn cc-cancel">Cancel check-in</button>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
  });
  await page.screenshot({ path: 'test-results/visual_polish/04_fast_mood_dialog.png', fullPage: true });
  console.log('Captured 04_fast_mood_dialog.png');

  await browser.close();
  console.log('All visual polish screenshots captured successfully!');
})();
