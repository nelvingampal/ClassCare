# Feature preservation checklist

Baseline: application 630ef2e; September 12, 2026. This checklist is the integration acceptance contract, not a claim that untested functions work. Before/after results must record the exact tested action. All integration results below are NOT RUN.

| Preserve | Implementation evidence | Before-change evidence | After-change requirement |
|---|---|---|---|
| Public entry, teacher registration/login/logout | index.html, teacher/index.html, teacher/register.js, config.js | Authenticated synthetic flows PASS; full onboarding UNVERIFIED | Reachable entry, pending/disabled denial, logout removes private state |
| Approved staff all-class access; private scores | firestore.rules; shared auth | 11 rule tests PASS | Repeat positive/negative checks; no UI-only security assumption |
| Teacher Overview aliases and class/date counts | teacher/index.html TAB_ROUTES, scanner.js | Partial browser coverage | Existing hashes work; counts agree with actual roster/date/status |
| Roster, selection and existing student actions | #teacher-students, scanner.js | Full action coverage UNVERIFIED | Inventory detail actions before replacement, verify search/class/selection and retain all existing permitted actions |
| Arrival/manual/QR, duplicates, time-out | scanner.html/js, kiosk-data.js | Synthetic browser PASS; physical camera NOT RUN | Before/after transactional outcomes match; manual/QR both reachable; no fake camera success |
| Optional daily three-step, skip and retry | scanner.js | Synthetic browser PASS | Explicit offer changes only response entry; save/skip/reset remain correct |
| Independent deep check, touch/gesture, review/save | deep-check.html, kiosk.js, holistic-core.js | Synthetic answer/offline retry PASS; real gestures NOT RUN | Five exact answers retained; no attendance side effect; failed saves preserve answers |
| Attendance register and reports | #teacher-register, export.js, #teacher-reports link | CSV/XLSX content PASS; Reports route UNVERIFIED | Retain columns/filter semantics; test reachability and download contents |
| Term grades, subject management, exports | #teacher-grades, grades.js | End-to-end UNVERIFIED | Verify actual enrollment/subject rules, four terms, bounds, blanks, averages, save and both exports before migrating |
| Summative publish/edit/save | #teacher-summative, summative.html/js | Synthetic publish/save/conflict PASS | Max/threshold, schedule-only confirmation, stale-edit rejection, unsaved guards and partial-save recovery preserved |
| Enrollment and walk-in/profile/photo controls | #teacher-enrollment, enrollment.js, index.html | UNVERIFIED | Existing forms/actions reachable; synthetic create/edit validation checked; real camera separate |
| Assignments and teacher subjects | #teacher-assignments, assignments.js, grades.js | UNVERIFIED | Existing assignments and subject-management actions remain reachable and persist in synthetic tests |
| Care alerts, concern/support actions | #teacher-care-alerts, scanner.js, holistic-portals.js | Limited legacy correlation/ack PASS; remaining actions UNVERIFIED | Keep access; no accidental duplicate writer; no adoption of unfinished followup-core.js |
| Analytics and classroom climate | #teacher-analytics / #classroom-climate, analytics.js, scanner.js | PARTIAL/CONFLICT; not validated | Retain access separately, identify unsupported claims; no silently changed thresholds/calculations |
| Wheel, help/support and other inline actions | teacher/index.html, wheel.js, scanner.js | UNVERIFIED | Inventory handlers and launcher locations during initial smoke pass; retain accessible entry points |
| Parent notification configuration/status | telegram-alert.js, firebase-config.js | Disabled local; delivery UNVERIFIED | Preserve interface; test with disabled/mocked delivery only; no claim of actual delivery |
| Offline queue, account isolation, static caching | offline-sync.js, sw.js, register-sw.js | Queue tests + scoped browser PASS | No loss of queued timeout; no replay across accounts; new assets available as intended; no private-record cache |
| Student portal and assessment schedule | student/index.html and scripts | Schedule/no score browser PASS | Existing student functions retained; never reintroduce staff score UI |
| Admin portal and management tools | admin/index.html and scripts | Portal load PASS; full actions UNVERIFIED | Keep pages/scripts intact; smoke-check if shared CSS or auth touched |

## Per-step sign-off template

- Screen and commit:
- Preserved routes/actions:
- Intentional interaction changes:
- Before: PASS / FAIL / UNVERIFIED, with evidence:
- After: PASS / FAIL / NOT RUN, with evidence:
- Desktop/tablet/phone and keyboard checks:
- Existing defects kept separate from new regressions:
- Remaining issues and rollback commit:

No feature is removed solely because the prototype omits it. No wholesale replacement of working application files with prototype files. A passing prototype test never substitutes for an application permission or persistence check.
