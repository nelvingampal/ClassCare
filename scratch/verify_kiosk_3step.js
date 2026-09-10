const fs = require('fs');
const path = require('path');

const scannerJs = fs.readFileSync(path.join(__dirname, '../teacher/scanner.js'), 'utf8');
const scannerHtml = fs.readFileSync(path.join(__dirname, '../teacher/scanner.html'), 'utf8');

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${description}`);
    failed++;
  }
}

console.log("==================================================");
console.log("🔬 VERIFYING KIOSK 3-STEP FLOW & CAMERA RESET");
console.log("==================================================");

// 1. Question definitions
assert("scanner.js defines KIOSK_3STEP_QUESTIONS", scannerJs.includes("const KIOSK_3STEP_QUESTIONS = ["));
assert("Step 1: Mood - 'How are you feeling today?'", scannerJs.includes('"How are you feeling today?"'));
assert("Step 1 options: Very good, Good, Okay, Not good", 
  scannerJs.includes('"Very good"') && scannerJs.includes('"Good"') && scannerJs.includes('"Okay"') && scannerJs.includes('"Not good"'));

assert("Step 2: Stress - 'How stressed do you feel today?'", scannerJs.includes('"How stressed do you feel today?"'));
assert("Step 2 options: Not stressed, A little stressed, Quite stressed, Very stressed",
  scannerJs.includes('"Not stressed"') && scannerJs.includes('"A little stressed"') && scannerJs.includes('"Quite stressed"') && scannerJs.includes('"Very stressed"'));

assert("Step 3: Need - 'What best describes what you need today?'", scannerJs.includes('"What best describes what you need today?"'));
assert("Step 3 options: Encouragement, Rest, Someone to talk to, Time to focus on myself",
  scannerJs.includes('"Encouragement"') && scannerJs.includes('"Rest"') && scannerJs.includes('"Someone to talk to"') && scannerJs.includes('"Time to focus on myself"'));

// 2. Camera reset & freeze prevention
assert("scanner.js implements resetAndRemountScanner", scannerJs.includes("async function resetAndRemountScanner()"));
assert("resetAndRemountScanner clears scannerRoot and resets scan locks", 
  scannerJs.includes('scannerRoot.replaceChildren()') && scannerJs.includes('State.scanInFlight = false'));
assert("resetAndRemountScanner safely stops tracks and calls startScanner",
  scannerJs.includes('State.activeVideoTrack.stop()') && scannerJs.includes('await startScanner()'));

// 3. 3-step submission and 2-second success state
assert("finish3StepEmotionalCheck compiles mood, stress, and need into payload",
  scannerJs.includes('mood: answers.mood') && scannerJs.includes('stress: answers.stress') && scannerJs.includes('need: answers.need'));
assert("finish3StepEmotionalCheck displays success screen for 2 seconds (wait 2000)",
  scannerJs.includes('await wait(2000)'));
assert("finish3StepEmotionalCheck resets and remounts camera after success",
  scannerJs.includes('await resetAndRemountScanner()'));

// 4. Care alert integration for 'Someone to talk to'
assert("Flags talkToSomeone care alert when student needs someone to talk to",
  scannerJs.includes('answers.need_key === "someone_to_talk_to"') && scannerJs.includes('ClassCare.DB.talkToSomeone.add'));

// 5. Duplicate and timeout auto-recovery
assert("Auto-resumes on duplicate scan", scannerJs.includes('Duplicate scan') && scannerJs.includes('setTimeout'));
assert("Auto-resumes on Time Out", scannerJs.includes('Time Out recorded') && scannerJs.includes('setTimeout'));
assert("Auto-resumes on invalid QR / error in showResultError", scannerJs.includes('showResultError') && scannerJs.includes('setTimeout'));

// 6. scanner.html markup
assert("scanner.html contains #emotion-overlay with full-screen fixed styling",
  scannerHtml.includes('id="emotion-overlay"') && scannerHtml.includes('position: fixed;'));
assert("scanner.html contains question wrap and choices grid",
  scannerHtml.includes('id="kiosk-question-wrap"') && scannerHtml.includes('id="kiosk-choices-grid"'));
assert("scanner.html contains celebratory success screen with 🎉",
  scannerHtml.includes('id="kiosk-success-screen"') && scannerHtml.includes('Have a great day! 🎉'));
assert("scanner.html has Skip check-in button", scannerHtml.includes('id="btn-skip-emotion"'));

console.log("==================================================");
if (failed === 0) {
  console.log(`🎉 ALL ${passed} VERIFICATION CHECKS PASSED!`);
  process.exit(0);
} else {
  console.error(`💥 ${failed} check(s) failed.`);
  process.exit(1);
}
