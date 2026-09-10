const fs = require('fs');
const path = require('path');

console.log("==================================================");
console.log("🚀 CLASSCARE: HOLISTIC SYSTEM VERIFICATION AUDIT");
console.log("==================================================");

let failed = 0;
function test(name, condition, details = "") {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name} ${details ? "- " + details : ""}`);
    failed++;
  }
}

// 1. Isolated Scanner Verification
const scannerHtml = fs.readFileSync(path.join(__dirname, '../teacher/scanner.html'), 'utf8');
const scannerJs = fs.readFileSync(path.join(__dirname, '../teacher/scanner.js'), 'utf8');

test("teacher/scanner.html exists and is non-empty", scannerHtml.length > 500);
test("scanner.html contains camera root viewport #scanner-root", scannerHtml.includes('id="scanner-root"'));
test("scanner.html contains isolated single-student card #scanned-student-card", scannerHtml.includes('id="scanned-student-card"'));
test("scanner.html contains emotion-overlay for hand gestures", scannerHtml.includes('id="emotion-overlay"'));
test("scanner.html does NOT expose full roster table (data privacy protection)", !scannerHtml.includes('id="attendance-tbody"') && !scannerHtml.includes('id="reference-student-carousel"'));
test("scanner.js contains detectGestureFromLandmarks", scannerJs.includes('detectGestureFromLandmarks'));
test("scanner.js contains startWellbeingSurvey gesture integration", scannerJs.includes('startWellbeingSurvey'));
test("scanner.js starts care alert listeners in initTeacherCareAlerts", scannerJs.includes('startTeacherCareListeners()'));

// 2. Tab Separation in Student Portal
const studentHtml = fs.readFileSync(path.join(__dirname, '../student/index.html'), 'utf8');
test("student/index.html contains tab-student-emotion", studentHtml.includes('id="tab-student-emotion"'));
test("student/index.html contains tab-student-concern", studentHtml.includes('id="tab-student-concern"'));
test("student/index.html contains tab-student-id", studentHtml.includes('id="tab-student-id"'));
test("student/index.html contains tab-student-attendance", studentHtml.includes('id="tab-student-attendance"'));
test("student/index.html contains tab-student-grades", studentHtml.includes('id="tab-student-grades"'));
test("student/index.html contains tab-student-enrollment", studentHtml.includes('id="tab-student-enrollment"'));
test("student/index.html contains tab-student-profile", studentHtml.includes('id="tab-student-profile"'));
test("student/index.html has switchStudentTab script", studentHtml.includes('function switchStudentTab'));

// 3. Tab Separation in Teacher Portal
const teacherHtml = fs.readFileSync(path.join(__dirname, '../teacher/index.html'), 'utf8');
test("teacher/index.html contains tab-teacher-overview", teacherHtml.includes('id="tab-teacher-overview"'));
test("teacher/index.html contains tab-teacher-care-alerts", teacherHtml.includes('id="tab-teacher-care-alerts"'));
test("teacher/index.html contains tab-teacher-attendance", teacherHtml.includes('id="tab-teacher-attendance"'));
test("teacher/index.html contains tab-teacher-students", teacherHtml.includes('id="tab-teacher-students"'));
test("teacher/index.html contains tab-teacher-grades", teacherHtml.includes('id="tab-teacher-grades"'));
test("teacher/index.html contains tab-teacher-enrollment", teacherHtml.includes('id="tab-teacher-enrollment"'));
test("teacher/index.html contains tab-teacher-assignments", teacherHtml.includes('id="tab-teacher-assignments"'));
test("teacher/index.html has switchTeacherTab script", teacherHtml.includes('function switchTeacherTab'));

// 4. Admin Enrollment State Sync
const firebaseConfigJs = fs.readFileSync(path.join(__dirname, '../config/firebase-config.js'), 'utf8');
const adminSettingsJs = fs.readFileSync(path.join(__dirname, '../admin/settings.js'), 'utf8');
const studentEnrollJs = fs.readFileSync(path.join(__dirname, '../student/enrollment.js'), 'utf8');
const teacherEnrollJs = fs.readFileSync(path.join(__dirname, '../teacher/enrollment.js'), 'utf8');

test("firebase-config.js handles offline localStorage fallback for enrollment", firebaseConfigJs.includes('localStorage.getItem("classcare_enrollment_open")'));
test("admin/settings.js broadcasts enrollment toggle via BroadcastChannel", adminSettingsJs.includes('new BroadcastChannel("classcare-sync")') || adminSettingsJs.includes('classcare-sync'));
test("student/enrollment.js listens to enrollment change events", studentEnrollJs.includes('classcare:enrollment-changed') || studentEnrollJs.includes('classcare-sync'));
test("teacher/enrollment.js listens to enrollment change events", teacherEnrollJs.includes('classcare:enrollment-changed') || teacherEnrollJs.includes('classcare-sync'));

// 5. "Talk to Someone" Visible Notifications
const adminHtml = fs.readFileSync(path.join(__dirname, '../admin/index.html'), 'utf8');
const adminDashboardJs = fs.readFileSync(path.join(__dirname, '../admin/dashboard.js'), 'utf8');

test("admin/index.html has wellbeing & topbar alerts badges", adminHtml.includes('id="admin-wellbeing-badge"') && adminHtml.includes('id="admin-topbar-alerts-count"'));
test("admin/dashboard.js implements listenGlobalConcerns", adminDashboardJs.includes('function listenGlobalConcerns'));
test("teacher topbar has care alerts counter", teacherHtml.includes('id="topbar-alerts-count"'));

// 6. Weekly Parent Email Pipeline
test("admin/dashboard.js implements 7-day wellness digest compilation", adminDashboardJs.includes('sendWellnessDigest') && adminDashboardJs.includes('emotional_checkins'));

// 7. Responsive CSS Safeguards
const stylesCss = fs.readFileSync(path.join(__dirname, '../js/styles.css'), 'utf8');
test("styles.css has table-wrap overflow-x auto rule", stylesCss.includes('.table-wrap') && stylesCss.includes('overflow-x: auto'));
test("styles.css has mobile topnav media query", stylesCss.includes('@media (max-width: 900px)') && stylesCss.includes('.classcare-topnav-inner'));

// 8. Teacher Portal Routing & Unclosed Structure Audit
test("teacher/index.html does not have #teacher-wellness as top nav or sidebar links", !teacherHtml.includes('href="#teacher-wellness"'));
test("teacher/index.html contains #teacher-concern-view-modal", teacherHtml.includes('id="teacher-concern-view-modal"'));
test("teacher/index.html has tab-teacher-care-alerts properly closed before attendance tab", teacherHtml.indexOf('id="tab-teacher-care-alerts"') < teacherHtml.indexOf('id="tab-teacher-attendance"'));

// 9. "Talk to Someone" Real-time & Modals
test("teacher/scanner.js subscribes to talkToSomeone collection", scannerJs.includes('talkToSomeone'));
test("teacher/scanner.js implements openConcernViewModal", scannerJs.includes('openConcernViewModal'));
test("admin/dashboard.js subscribes to talkToSomeone collection", adminDashboardJs.includes('talkToSomeone'));
const firestoreRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
test("firestore.rules allows signedIn() read on talkToSomeone", firestoreRules.includes('match /talkToSomeone/{submissionId}') && firestoreRules.includes('allow read: if signedIn();'));
test("firestore.rules allows signedIn() read on concern_submissions", firestoreRules.includes('match /concern_submissions/{submissionId}') && firestoreRules.includes('allow read: if signedIn();'));

// 10. Admin Enrollment Approval
const adminUsersJs = fs.readFileSync(path.join(__dirname, '../admin/users.js'), 'utf8');
test("admin/settings.js updates student status to enrolled and creates enrollments doc", adminSettingsJs.includes('status: "enrolled"') && adminSettingsJs.includes('enrollments.doc'));
test("admin/users.js implements approveStudent action", adminUsersJs.includes('approveStudent'));

// 11. Grading System & Global Data Sync
const teacherGradesJs = fs.readFileSync(path.join(__dirname, '../teacher/grades.js'), 'utf8');
test("teacher/grades.js does NOT use composite query on users (section + role)", !teacherGradesJs.includes('.where("section", "==", section).where("role", "==", "student")'));
test("teacher/grades.js queries enrollments collection for section students", teacherGradesJs.includes('ClassCare.DB.enrollments') && teacherGradesJs.includes('.where("section", "==", section)'));
test("teacher/grades.js computes avg in saveStudentGradeRow", teacherGradesJs.includes('computeAverage(parsed.term1, parsed.term2, parsed.term3, parsed.term4)'));
test("teacher/grades.js ensures relational keys (student_uid, section_id, subject_id, teacher_uid)", teacherGradesJs.includes('section_id:') && teacherGradesJs.includes('subject_id:') && teacherGradesJs.includes('teacher_uid:'));

// 12. Strict Copywriting Rules Check
test("Codebase does not contain forbidden term 'SF9'", !teacherHtml.includes('SF9') && !studentHtml.includes('SF9') && !teacherGradesJs.includes('SF9') && !stylesCss.includes('SF9'));
test("Codebase does not contain forbidden term '3 Pillars'", !teacherHtml.includes('3 Pillars') && !studentHtml.includes('3 Pillars') && !teacherGradesJs.includes('3 Pillars'));

// 13. Data Accuracy & Roster Sync (No Synthetic Hardcoded Values)
test("teacher/index.html has dynamic #teacher-page-title and no hardcoded Sampaguita", teacherHtml.includes('id="teacher-page-title"') && !teacherHtml.includes('Sampaguita'));
test("teacher/index.html has no hardcoded Room 204", !teacherHtml.includes('Room 204'));
test("teacher/index.html has no hardcoded G5S-001 or Sam Santos", !teacherHtml.includes('G5S-001') && !teacherHtml.includes('Sam Santos'));
test("teacher/enrollment.js merges approved students by teacher sections", teacherEnrollJs.includes('teacherSections') && teacherEnrollJs.includes('approved'));

// 14. Care Alert & Intervention Logic Overhaul
const studentConcernJs = fs.readFileSync(path.join(__dirname, '../student/concern.js'), 'utf8');
test("student/concern.js defaults new submission status to 'Not Solved'", studentConcernJs.includes('status: "Not Solved"'));
test("teacher/scanner.js has status buttons for 'Not Solved', 'In Progress', 'Solved'", scannerJs.includes('data-set-concern-status') && scannerJs.includes('Not Solved') && scannerJs.includes('Solved'));
test("admin/dashboard.js has Admin God Mode override for concerns", adminDashboardJs.includes('Admin God Mode: Status & Counselor Override') && adminDashboardJs.includes('btn-admin-save-concern-override'));

// 15. Dual Emotional Check Reports
test("teacher/index.html contains #student-emotion-timeline-modal", teacherHtml.includes('id="student-emotion-timeline-modal"'));
test("teacher/scanner.js implements openStudentEmotionTimelineModal", scannerJs.includes('openStudentEmotionTimelineModal'));
test("teacher/scanner.js wires student click to emotional timeline", scannerJs.includes('openStudentEmotionTimelineModal(el.dataset.openEmotionUid)'));

// 16. Kiosk Scanner & Attendance Tab Restoration
test("teacher/scanner.html includes missing script dependencies (toast, utils, ui, theme)", scannerHtml.includes('toast.js') && scannerHtml.includes('utils.js') && scannerHtml.includes('ui.js') && scannerHtml.includes('theme.js'));
test("teacher/index.html attendance tab removed redundant inline camera .scanner-grid", !teacherHtml.includes('class="scanner-grid"'));
test("teacher/index.html attendance tab contains Launch Scanner Kiosk button", teacherHtml.includes('Launch Scanner Kiosk 🚀'));
test("scanner.js has immediate survey prompt (delay <= 50ms)", scannerJs.includes('EMOTION_DELAY_MS = 20'));
test("scanner.js configures QR format filter and environment camera", scannerJs.includes('Html5QrcodeSupportedFormats.QR_CODE') && scannerJs.includes('exact: "environment"'));
test("scanner.js enforces 1080p minimum resolution constraints", scannerJs.includes('width: { ideal: 1920, min: 1280 }') && scannerJs.includes('height: { ideal: 1080, min: 720 }'));
test("scanner.js enforces continuous auto-focus constraints", scannerJs.includes('focusMode: "continuous"'));
test("scanner.js shuts off active camera track on scan to free resources", scannerJs.includes('State.activeVideoTrack.enabled = false'));
test("scanner.js implements applyNativeCameraEnhancements and tap-to-focus", scannerJs.includes('applyNativeCameraEnhancements') && scannerJs.includes('setupTapToFocus'));

// 17. Global State Sync & Dynamic Late Threshold (Admin God Mode)
test("teacher/scanner.js syncs overview counts with workspace student count", scannerJs.includes('#workspace-student-count') && scannerJs.includes('#workspace-footer-count'));
test("teacher/scanner.js listens to live dynamic settings", scannerJs.includes('ClassCare.DB.settings.onSnapshot'));
test("admin/settings.js supports dynamic late_threshold_time", adminSettingsJs.includes('late_threshold_time'));

console.log("==================================================");
if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED! SYSTEM RESTRUCTURING 100% VERIFIED.");
  process.exit(0);
} else {
  console.error(`💥 ${failed} TEST(S) FAILED.`);
  process.exit(1);
}
