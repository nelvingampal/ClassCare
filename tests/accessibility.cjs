// No accounts, network requests, or production data: exercises actual UI helper in Edge.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent('<button id="open">Open check-in</button><div id="modal" role="dialog" aria-modal="true" aria-label="Check-in" style="display:none"><button id="skip">Skip</button><button id="answer">Answer</button></div><button id="outside">Outside</button>');
    await page.addScriptTag({ content: fs.readFileSync('js/ui.js', 'utf8') });
    await page.evaluate(() => {
      const modal = document.querySelector('#modal');
      ClassCareUI.bindModalFocus(modal);
      document.querySelector('#open').onclick = () => { modal.style.display = 'block'; };
      document.querySelector('#skip').onclick = () => { modal.style.display = 'none'; };
    });
    await page.locator('#open').click();
    await page.waitForFunction(() => document.activeElement.id === 'skip');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'answer');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'skip');
    await page.evaluate(() => document.querySelector('#outside').focus());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'skip');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement.id === 'open');
    assert.equal(await page.locator('#modal').getAttribute('aria-hidden'), 'true');
    console.log('PASS modal entry focus, forward/backward Tab containment, outside focus prevention, and focus restoration');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
