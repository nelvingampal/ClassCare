const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../student/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../js/styles.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../student/register.js'), 'utf8');

console.log("=== VERIFYING STUDENT ID LAYOUT & DUPLICATE QR FIX ===");

// 1. Negative margin removal (no collision with header text)
const hasNegativeMarginInHtml = html.includes('-mt-') || html.includes('margin-top:-');
const hasNegativeMarginInCss = css.includes('margin: -48px') || css.includes('#id-avatar { margin-top: -');
console.log("- Negative margin removed from HTML avatar:", !hasNegativeMarginInHtml ? "PASS" : "FAIL");
console.log("- Negative margin removed from CSS avatar:", !hasNegativeMarginInCss ? "PASS" : "FAIL");

// 2. Duplicate QR prevention
const hasImgHiddenInCss = css.includes('.student-id-card #qr-canvas img { display: none !important; }');
const hasImgRemovedInJs = js.includes('qr.querySelectorAll("img").forEach(im => im.remove());');
const hasImgCleanedInExport = js.includes('element.querySelectorAll("#qr-canvas img").forEach(im => im.remove());');
console.log("- CSS hides duplicate QR img:", hasImgHiddenInCss ? "PASS" : "FAIL");
console.log("- JS cleans duplicate QR img on render:", hasImgRemovedInJs ? "PASS" : "FAIL");
console.log("- JS cleans duplicate QR img before export:", hasImgCleanedInExport ? "PASS" : "FAIL");

// 3. Text clipping prevention
const hasOverflowVisibleName = html.includes('overflow:visible') && html.includes('id="id-name"');
const hasNormalLineHeight = html.includes('line-height:1.3') || html.includes('line-height: 1.3');
console.log("- Name container has visible overflow (no clipped letters):", hasOverflowVisibleName ? "PASS" : "FAIL");
console.log("- Text line-height is ample (no sliced text):", hasNormalLineHeight ? "PASS" : "FAIL");

// 4. Details panel border collision fix
const hasCleanDivider = html.includes('height:1px;background:#e2e8f0;margin:6px 0;');
console.log("- Details panel has clean separate divider (no overlapping text):", hasCleanDivider ? "PASS" : "FAIL");

// 5. All IDs present
const requiredIds = [
  'id-card-inner',
  'id-card-3d-wrap',
  'id-avatar',
  'id-name',
  'id-status',
  'id-student-id',
  'id-section',
  'id-parent-contact',
  'qr-wrap',
  'qr-canvas',
  'id-uid',
  'id-validity'
];
let allIds = true;
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) {
    console.log(`- Missing: ${id}`);
    allIds = false;
  }
}
console.log("- All critical IDs present:", allIds ? "PASS" : "FAIL");

if (!hasNegativeMarginInHtml && !hasNegativeMarginInCss && hasImgHiddenInCss && hasImgRemovedInJs && hasImgCleanedInExport && hasOverflowVisibleName && hasCleanDivider && allIds) {
  console.log("\n>>> ALL CHECKS PASSED SUCCESSFULLY! <<<");
  process.exit(0);
} else {
  console.log("\n>>> SOME CHECKS FAILED <<<");
  process.exit(1);
}
