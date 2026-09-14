// Read the existing synthetic pitch fixtures; never connect to production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route(/https:\/\/(?:firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|api\.telegram\.org|api\.emailjs\.com|generativelanguage\.googleapis\.com)/, r => r.abort());
    const page = await context.newPage(), warnings = [], errors = [];
    page.on('console', m => { if (m.text().includes('[teacher-care]') && /error|notice/i.test(m.text())) warnings.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5599/teacher/index.html');
    await page.waitForFunction(() => !!window.ClassCare);
    assert.equal(await page.evaluate(() => ClassCare.getFirebase().db.app.options.projectId), 'demo-classcare');
    await page.evaluate(() => ClassCare.getFirebase().auth.signInWithEmailAndPassword('pitch-teacher@classcare.test', 'ClassCareDemo2026!'));
    for (let run = 0; run < 3; run++) {
      if (run) await page.reload();
      await page.locator('#view-dashboard').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => ClassCare.DB.careAlerts.path), 'careAlerts');
      await page.waitForFunction(() => document.getElementById('overview-care-status').textContent === '1 holistic care alert needs review', null, { timeout: 60000 });
      await page.locator('#nav-teacher-care-alerts').click();
      await page.waitForFunction(() => document.querySelector('#holistic-live .cc-alert')?.textContent.includes('Sam Santos'));
      assert.equal(await page.locator('#holistic-live').count(), 1);
      // Check convergence, not just the first fleeting confirmed snapshot.
      await page.waitForTimeout(2000);
      assert.equal(await page.locator('#overview-care-status').textContent(), '1 holistic care alert needs review');
    }
    assert.deepEqual(warnings, [], 'Care listeners should initialize without warnings');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    fs.mkdirSync('test-results/desktop-care', { recursive: true });
    await page.screenshot({ path: 'test-results/desktop-care/confirmed-alert.png' });
    console.log('PASS three desktop loads: care accessor, confirmed Sam alert, one card, stable summary, no care-listener or page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
