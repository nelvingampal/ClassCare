const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:800}});
 await page.goto('http://127.0.0.1:5599/teacher/index.html');
 await page.locator('#teacher-tab-register').click();
 const box=page.locator('#teacher-terms-checkbox');
 assert.equal(await box.isDisabled(),true,'Hidden terms cannot unlock consent');
 await page.locator('#teacher-terms-language').selectOption('fil');
 assert.equal(await page.locator('.terms-content h3').count(),17);
 assert.equal(await page.locator('.terms-content').getAttribute('lang'),'fil');
 await page.locator('#teacher-terms-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
 await page.waitForFunction(()=>!document.querySelector('#teacher-terms-checkbox').disabled);
 await box.check();
 assert.equal(await page.locator('#btn-teacher-register').isDisabled(),false);
 await page.locator('#teacher-terms-language').selectOption('en');
 await page.waitForTimeout(500);
 assert.equal(await box.isChecked(),false);
 assert.equal(await box.isDisabled(),true);
 assert.equal(await page.locator('.terms-content h3').count(),17);
 const outer=page.locator('#public-view .public-main');
 await outer.evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.ok(await outer.evaluate(el=>el.scrollTop>0),'Registration scrolls down');
 await outer.evaluate(el=>el.scrollTop=0);
 const tab=await page.locator('#teacher-tab-register').boundingBox();
 assert.ok(tab.y>=0 && tab.y<800,'Top of registration is reachable');
 await page.screenshot({path:'test-results/registration-top.png'});
 await page.locator('#teacher-terms-language').selectOption('fil');
 await page.locator('#teacher-terms-language').scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/registration-filipino.png'});
 console.log('PASS registration scroll, both 17-section languages, consent reset and explicit acceptance; no account submitted');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
