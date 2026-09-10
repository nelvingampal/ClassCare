const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  fs.mkdirSync('test-results/visual_polish', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Mock teacher auth
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
    
    const check = setInterval(() => {
      if (window.ClassCare && window.ClassCare.onCurrentUser) {
        clearInterval(check);
        window.ClassCare.onCurrentUser = function(cb) {
          setTimeout(() => cb(mockUser), 10);
          return () => {};
        };
      }
    }, 10);
  });

  // 1. Teacher Portal - Attendance & Kiosks tab
  await page.goto('http://localhost:5500/teacher/index.html#teacher-attendance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.getElementById('view-guest')?.classList.add('hidden');
    document.getElementById('public-view')?.classList.add('hidden');
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.remove('hidden');
    document.querySelectorAll('.teacher-tab-panel').forEach(p => p.classList.add('hidden'));
    const attTab = document.getElementById('tab-teacher-attendance');
    if (attTab) attTab.classList.remove('hidden');
  });
  const artifactDir = 'C:/Users/nelvi/.gemini/antigravity-ide/brain/ee8e3035-d45e-42a8-812e-35943c10a74c';
  await page.screenshot({ path: `${artifactDir}/teacher_attendance_tab.png`, fullPage: true });
  await page.screenshot({ path: 'test-results/visual_polish/05_teacher_attendance_tab.png', fullPage: true });
  console.log('Captured 05_teacher_attendance_tab.png');

  // 2. Teacher Portal - Summative tab
  await page.goto('http://localhost:5500/teacher/index.html#teacher-summative', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.getElementById('view-guest')?.classList.add('hidden');
    document.getElementById('public-view')?.classList.add('hidden');
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.remove('hidden');
    document.querySelectorAll('.teacher-tab-panel').forEach(p => p.classList.add('hidden'));
    const sumTab = document.getElementById('tab-teacher-summative');
    if (sumTab) sumTab.classList.remove('hidden');
  });
  await page.screenshot({ path: `${artifactDir}/teacher_summative_tab.png`, fullPage: true });
  await page.screenshot({ path: 'test-results/visual_polish/06_teacher_summative_tab.png', fullPage: true });
  console.log('Captured 06_teacher_summative_tab.png');

  await browser.close();
  console.log('Teacher tabs captured successfully!');
})();
