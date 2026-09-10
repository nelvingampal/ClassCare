const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/nelvi/.gemini/antigravity-ide/brain/ee8e3035-d45e-42a8-812e-35943c10a74c';

(async () => {
  console.log('🚀 Starting Playwright visual check for ClassCare Kiosk...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 1. Visit scanner.html
  console.log('Navigating to http://localhost:5500/teacher/scanner.html ...');
  await page.goto('http://localhost:5500/teacher/scanner.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Check scanner elements
  const hasScannerRoot = await page.$('#scanner-root') !== null;
  const hasScanLaser = await page.$('.scan-laser') !== null;
  const hasStudentCard = await page.$('#scanned-student-card') !== null;
  const hasEmotionOverlay = await page.$('#emotion-overlay') !== null;
  const hasQuestionWrap = await page.$('#kiosk-question-wrap') !== null;
  const hasChoicesGrid = await page.$('#kiosk-choices-grid') !== null;

  console.log('Scanner elements check:', {
    hasScannerRoot,
    hasScanLaser,
    hasStudentCard,
    hasEmotionOverlay,
    hasQuestionWrap,
    hasChoicesGrid
  });

  const scannerShotPath = path.join(ARTIFACT_DIR, 'scanner_kiosk_view.png');
  await page.screenshot({ path: scannerShotPath, fullPage: true });
  console.log(`Saved screenshot to ${scannerShotPath}`);

  // 2. Test rendering the student card & emotion overlay
  console.log('Testing student card and emotion overlay rendering...');
  await page.evaluate(() => {
    const card = document.getElementById('scanned-student-card');
    if (card) {
      const nameEl = document.getElementById('scanned-student-name');
      const idEl = document.getElementById('scanned-student-id');
      const secEl = document.getElementById('scanned-student-section');
      const badgeEl = document.getElementById('scanned-status-badge');
      const timeEl = document.getElementById('scanned-time-in');
      if (nameEl) nameEl.textContent = 'Juan Dela Cruz';
      if (idEl) idEl.textContent = 'ID: LRN-10928374';
      if (secEl) secEl.textContent = 'Section: Grade 5 - Mabini';
      if (badgeEl) {
        badgeEl.textContent = 'PRESENT (ON TIME)';
        badgeEl.className = 'status-badge-lg present';
      }
      if (timeEl) timeEl.textContent = '7:18 AM';
    }
    const overlay = document.getElementById('emotion-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.classList.remove('hidden');
      const studentNameEl = document.getElementById('kiosk-student-name');
      if (studentNameEl) studentNameEl.textContent = 'Juan Dela Cruz';
      const stepIndicator = document.getElementById('kiosk-step-indicator');
      if (stepIndicator) stepIndicator.textContent = 'Step 1 of 3: Mood';
      const titleEl = document.getElementById('kiosk-step-title');
      if (titleEl) titleEl.textContent = 'How are you feeling today?';
      const grid = document.getElementById('kiosk-choices-grid');
      if (grid) {
        grid.innerHTML = `
          <button class="btn" style="padding:1.2rem;font-size:1.1rem;border-radius:12px;background:#1e293b;color:white;border:1px solid #334155;font-weight:700;">😄 Very good</button>
          <button class="btn" style="padding:1.2rem;font-size:1.1rem;border-radius:12px;background:#1e293b;color:white;border:1px solid #334155;font-weight:700;">🙂 Good</button>
          <button class="btn" style="padding:1.2rem;font-size:1.1rem;border-radius:12px;background:#1e293b;color:white;border:1px solid #334155;font-weight:700;">😐 Okay</button>
          <button class="btn" style="padding:1.2rem;font-size:1.1rem;border-radius:12px;background:#1e293b;color:white;border:1px solid #334155;font-weight:700;">🙁 Not good</button>
        `;
      }
    }
  });
  await page.waitForTimeout(500);

  const overlayShotPath = path.join(ARTIFACT_DIR, 'scanner_emotion_overlay.png');
  await page.screenshot({ path: overlayShotPath, fullPage: true });
  console.log(`Saved screenshot to ${overlayShotPath}`);

  // 3. Visit teacher/index.html
  console.log('Navigating to http://localhost:5500/teacher/index.html ...');
  await page.goto('http://localhost:5500/teacher/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const launchBtn = await page.$('a[href="scanner.html"]');
  const launchBtnText = launchBtn ? await launchBtn.innerText() : 'NOT FOUND';
  console.log('Launch kiosk button text:', launchBtnText);

  const teacherPortalShotPath = path.join(ARTIFACT_DIR, 'teacher_portal_view.png');
  await page.screenshot({ path: teacherPortalShotPath, fullPage: true });
  console.log(`Saved screenshot to ${teacherPortalShotPath}`);

  await browser.close();

  console.log('Visual check completed successfully!');
  console.log('Non-fatal errors:', consoleErrors.filter(e => !e.includes('Firebase') && !e.includes('favicon')));
})();
