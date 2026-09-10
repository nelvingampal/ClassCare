const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  fs.mkdirSync('test-results/screens', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  const urls = [
    { name: 'teacher-scanner', url: 'http://localhost:5500/teacher/scanner.html' },
    { name: 'teacher-deep-check', url: 'http://localhost:5500/teacher/deep-check.html' },
    { name: 'teacher-summative', url: 'http://localhost:5500/teacher/summative.html' },
    { name: 'teacher-portal-guest', url: 'http://localhost:5500/teacher/index.html' },
    { name: 'student-portal-guest', url: 'http://localhost:5500/student/index.html' }
  ];

  for (const item of urls) {
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `test-results/screens/${item.name}.png`, fullPage: true });
      console.log('Captured', item.name);
    } catch (e) {
      console.error('Failed to capture', item.name, e.message);
    }
  }

  await browser.close();
  console.log('Screenshots captured!');
})();
