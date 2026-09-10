const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../teacher/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../js/styles.css'), 'utf8');

console.log("=== VERIFYING TEACHER TOPNAV FIX ===");

// 1. Check all 9 navigation links exist
const requiredHrefs = [
  '#teacher-overview',
  '#teacher-attendance',
  '#teacher-students',
  '#teacher-summative',
  '#teacher-grades',
  '#teacher-care-alerts',
  '#teacher-enrollment',
  '#teacher-assignments',
  '#teacher-analytics'
];

let allHrefsFound = true;
for (const href of requiredHrefs) {
  const found = html.includes(`href="${href}"`);
  console.log(`- Nav link ${href}:`, found ? "PASS" : "FAIL");
  if (!found) allHrefsFound = false;
}

// 2. Check compact labels
const hasCompactAttendance = html.includes('>Attendance<');
const hasCompactSummative = html.includes('>Summative<');
const hasCompactGrades = html.includes('>Grades<');
const hasCompactClimate = html.includes('>Class Climate<');
console.log("- Compact label 'Attendance':", hasCompactAttendance ? "PASS" : "FAIL");
console.log("- Compact label 'Summative':", hasCompactSummative ? "PASS" : "FAIL");
console.log("- Compact label 'Grades':", hasCompactGrades ? "PASS" : "FAIL");
console.log("- Compact label 'Class Climate':", hasCompactClimate ? "PASS" : "FAIL");

// 3. Check critical IDs
const requiredIds = [
  'nav-teacher-overview',
  'nav-teacher-attendance',
  'nav-teacher-students',
  'nav-teacher-summative',
  'nav-teacher-grades',
  'nav-teacher-care-alerts',
  'nav-teacher-enrollment',
  'nav-teacher-assignments',
  'nav-teacher-analytics',
  'nav-alerts-pill',
  'btn-topbar-care-alerts',
  'topbar-alerts-count',
  'user-chip',
  'user-avatar',
  'user-name',
  'btn-logout'
];

let allIdsFound = true;
for (const id of requiredIds) {
  const found = html.includes(`id="${id}"`);
  if (!found) {
    console.log(`- Missing ID: ${id}`);
    allIdsFound = false;
  }
}
console.log("- All critical interactive IDs present:", allIdsFound ? "PASS" : "FAIL");

// 4. Check CSS rules
const hasOverflowX = css.includes('overflow-x: auto;') && css.includes('.classcare-nav-links');
const hasScrollbarHidden = css.includes('.classcare-nav-links::-webkit-scrollbar');
const hasCompactPadding = css.includes('padding: 6px 11px;') || css.includes('padding: 5px 10px;');
const hasCompactInner = css.includes('max-width: 100%;');

console.log("- CSS overflow-x: auto on nav-links:", hasOverflowX ? "PASS" : "FAIL");
console.log("- CSS scrollbar hidden for sleek look:", hasScrollbarHidden ? "PASS" : "FAIL");
console.log("- CSS compact nav item padding:", hasCompactPadding ? "PASS" : "FAIL");
console.log("- CSS topnav inner max-width: 100%:", hasCompactInner ? "PASS" : "FAIL");

if (allHrefsFound && hasCompactAttendance && hasCompactSummative && hasCompactGrades && hasCompactClimate && allIdsFound && hasOverflowX && hasScrollbarHidden && hasCompactPadding && hasCompactInner) {
  console.log("\n>>> ALL CHECKS PASSED SUCCESSFULLY! <<<");
  process.exit(0);
} else {
  console.log("\n>>> SOME CHECKS FAILED <<<");
  process.exit(1);
}
