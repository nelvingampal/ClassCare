const fs = require('fs');

console.log("=== RUNNING VERIFICATION CHECKS ===");

// 1. Check CSS
const css = fs.readFileSync('./js/styles.css', 'utf8');
const cssChecks = [
  { name: 'Sidebar background #E6F2FC', ok: css.includes('--bg-sidebar: #E6F2FC;') },
  { name: 'Fixed sidebar on desktop', ok: css.includes('position: fixed !important;') && css.includes('.app-sidebar') },
  { name: 'Active nav darker blue pill background #0A4479', ok: css.includes('background: #0A4479 !important;') },
  { name: 'Alternating pastel green row #EFF9F3', ok: css.includes('.pastel-row-green { background-color: #EFF9F3') },
  { name: 'Alternating pastel yellow row #FEF8E7', ok: css.includes('.pastel-row-yellow { background-color: #FEF8E7') },
  { name: 'Alternating pastel blue row #EDF6FC', ok: css.includes('.pastel-row-blue { background-color: #EDF6FC') },
  { name: 'Pill radius 9999px', ok: css.includes('--radius-pill: 9999px;') }
];
console.table(cssChecks);

// 2. Check Teacher Scanner
const scannerJs = fs.readFileSync('./teacher/scanner.js', 'utf8');
const scannerChecks = [
  { name: 'renderDynamicReferenceHero defined', ok: scannerJs.includes('async function renderDynamicReferenceHero()') },
  { name: 'updateRecordOverviewCard defined', ok: scannerJs.includes('async function updateRecordOverviewCard(student)') },
  { name: 'pill-stat-present dynamically bound', ok: scannerJs.includes('pillPresent.textContent = `${onTime} on time`') },
  { name: 'pill-stat-late dynamically bound', ok: scannerJs.includes('pillLate.textContent = `${late} late`') },
  { name: 'pill-stat-unrecorded dynamically bound', ok: scannerJs.includes('pillUnrecorded.textContent = `${missing} not recorded`') },
  { name: 'pill-stat-total dynamically bound', ok: scannerJs.includes('pillTotal.textContent = `${total} enrolled students`') },
  { name: 'No hardcoded REFERENCE_STUDENT_DATA', ok: !scannerJs.includes('REFERENCE_STUDENT_DATA') }
];
console.table(scannerChecks);

// 3. Check Bug Fix for Talk To Someone
const rules = fs.readFileSync('./firestore.rules', 'utf8');
const concernJs = fs.readFileSync('./student/concern.js', 'utf8');
const adminJs = fs.readFileSync('./admin/dashboard.js', 'utf8');
const bugChecks = [
  { name: 'Firestore rules allow create for concern_submissions', ok: rules.includes('match /concern_submissions/{submissionId}') && rules.includes('allow create: if true;') },
  { name: 'Firestore rules allow create for talkToSomeone', ok: rules.includes('match /talkToSomeone/{submissionId}') && rules.includes('allow create: if true;') },
  { name: 'Student concern refreshes auth token', ok: concernJs.includes('getIdToken(true)') },
  { name: 'Student concern has fallback retry', ok: concernJs.includes('ClassCare.DB.talkToSomeone.add') },
  { name: 'Student concern has helpdesk_tickets fallback', ok: concernJs.includes('ClassCare.DB.helpdesk_tickets.add') },
  { name: 'Admin dashboard merges helpdesk concerns', ok: adminJs.includes('where("is_concern", "==", true)') },
  { name: 'Teacher scanner has fallback for concerns', ok: scannerJs.includes('where("is_concern", "==", true)') }
];
console.table(bugChecks);

// 4. Check Config instructions
const configJs = fs.readFileSync('./js/config.js', 'utf8');
const envExample = fs.existsSync('./.env.example');
const configChecks = [
  { name: '.env.example exists', ok: envExample },
  { name: 'EmailJS configured with clear comments', ok: configJs.includes('EMAILJS FALLBACK') && configJs.includes('publicKey') }
];
console.table(configChecks);

const allPassed = cssChecks.every(c => c.ok) && scannerChecks.every(c => c.ok) && bugChecks.every(c => c.ok) && configChecks.every(c => c.ok);
console.log("\n>>> ALL VERIFICATIONS RESULT:", allPassed ? "ALL PASSED (100%)" : "FAILED");
process.exit(allPassed ? 0 : 1);
