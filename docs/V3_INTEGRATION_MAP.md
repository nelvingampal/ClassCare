# V3 integration map and preservation contract

September 12, 2026. User authorized preparation after the responsive prototype pass. This map supersedes the earlier sequencing instruction to implement analytics before visual integration. Alert-engine replacement stays separate. No UI replacement is authorized by a missing prototype feature.

## Verified baseline and rollback

- Remote main rechecked: `3366b4e8ed79f8203dc283952b1aec828f207f7e`, unchanged.
- Application checkpoint: `630ef2e`, branch `codex/classcare-stabilize`.
- Uncommitted drafts `docs/FOLLOWUP_INTERFACE.md` and `js/followup-core.js` remain untouched and unconnected. Do not include them in visual integration commits.
- Design source: task `01a07e4f-6532-7073-9cc8-e1c2571e8cc4`, V3 responsive pass. Reader reports completion but returns empty latest-message items; local TEST_RECORD.md provides the detailed test report. Its results are prototype results, not application regressions.
- Frozen prototype archive: `C:/Users/Mico/Documents/ClassCare-Workspace/design-snapshots/ClassCare-V3-20260912-165411.zip`, SHA256 `1DAC9D617B20A15FB1A31B4813C2632A3F53687F350EBF050CE3F4548221B1C2`. Includes root source/doc files, assets and V3 evidence; excludes installed dependencies and older evidence. It is a design reference, not a deployable application replacement.
- Application archive: `C:/Users/Mico/Documents/ClassCare-Workspace/design-snapshots/ClassCare-app-630ef2e-20260912-165411.zip`, SHA256 `B812894EA264BAF96CB58230B789AB709AA12A7DB700D17EE3AD122CEAEB704D`. Git-tracked checkpoint only; drafts are not included.

## Integration technique

Modify the existing teacher application. Transfer selected visual assets and scoped styles, then adapt existing DOM structures deliberately. Never copy prototype app.js, mock-data.js, server.js or index.html over application files. Keep existing authentication, collection access, validation, transaction/save logic, event handling and route destinations unless a specific change is documented and regression-tested. DOM IDs and shared script hooks are behavior dependencies, not disposable design details.

Keep existing supplemental tools accessible under a clearly named More tools area or their current navigation until verified migration. Student/admin portals remain outside this visual pass. Shared CSS must be scoped to the redesigned teacher views; smoke-check other portals whenever shared files are touched. Do not create duplicate listeners or run two save handlers from old/new DOM simultaneously.

## Screen mapping

| V3 destination | Application destination/source | Required treatment |
|---|---|---|
| Overview | teacher/index.html#teacher-overview; scanner.js dashboard state | Compact class/date header and actual counts. Use existing real data; preserve missing-record semantics. No fixtures or proposed automatic alerts. Dated student evidence must reflect explicit selection. |
| Students/detail | #teacher-students; scanner.js roster/detail; grades and summative sources | Preserve student IDs, lookup, profile actions and existing permissions. New presentation may reorganize evidence but must retain actual question/date/scale. Verify whether legacy profile detail contains actions absent from V3 before replacing it. |
| Attendance register | #teacher-attendance, #teacher-register; export.js | Preserve class/date/status filters, corrections if implemented, time-in/out columns and CSV/XLSX. Reconcile filter state with exported results. |
| Daily camera/manual entry | teacher/scanner.html; scanner.js; kiosk-data.js | Style actual controls; retain camera lifecycle, lookup, duplicate handling, arrival/time-out transactions and retry. Prototype's camera simulation is excluded. |
| Optional daily response | scanner.js three-step overlay | Explicit V3 offer button differs from the application's current automatic opening after arrival. Treat this as a separately tested interaction change: attendance already saved, no response until offered/answered, skip remains possible, next student resets correctly. Do not change question meanings. |
| Deep check | teacher/deep-check.html; kiosk.js; holistic-core.js | Retain independent five-question gesture/touch journey and review-before-save. Never replace it with the daily three-step form. |
| Scores / Term grades | #teacher-grades; grades.js | Reuse actual section/subject/term controls, subject management, save and exports. Verify calculation semantics and blank handling before applying V3 labels; prototype averages are not authoritative. |
| Scores / Summative | #teacher-summative and teacher/summative.html; summative.js | Preserve publish form, in-app schedule, max/threshold, validation, five-row batches, conflict handling, draft retention and secondary full-page route. |
| More tools | Existing enrollment, assignments, care, analytics and reports entry points | Retain routes and functionality even if they are absent from V3. Conflicting analytics stays labeled and excluded from any new claim; no engine rewrite hidden in UI work. |

## Ordered commits and acceptance

1. Establish before-change route/DOM inventory and smoke checks, especially untested secondary tools and term grades. Capture pre-existing failures separately.
2. DONE for this slice: `codex/classcare-frontend-integration` was created from the reviewed stabilization commit after the remote recheck. No push, merge or deployment.
3. IN PROGRESS / desktop presentation slices complete: integrated teacher navigation/branding, Overview, Students picker, Attendance, Scores and Care Alerts styling in separate commits. Route reachability, internal scroll reset, existing Overview care placement and 1440 desktop capture pass. Tablet/phone redesign is deferred by user request. Auth/logout, class/date persistence, counts and full detail/action parity remain application checks to broaden before merge.
4. IN PROGRESS / desktop presentation only: the existing Students picker now uses the scoped sky-blue card/list treatment. Its recorded-arrival scope, selection handlers and empty state are unchanged. Full roster/detail/action verification remains before any behavior or evidence reorganization.
5. IN PROGRESS / desktop presentation only: the existing Attendance kiosk cards and live register now use the scoped sky-blue treatment. Scanner links, QR/manual flow, check-in timing, duplicate/time-out handling and exports are unchanged. Test the explicit-offer change separately from layout before changing behavior.
6. IN PROGRESS / desktop presentation only: Term Grades and Summative surfaces now use the scoped sky-blue card, table and status treatment. Existing term controls, subject/term semantics, summative publishing, validation, score saves, exports and conflict handling remain application-owned and are covered separately by the synthetic checks.
7. IN PROGRESS / desktop presentation only: the existing Care Alerts surface now uses the scoped sky-blue hierarchy while retaining its alert/inquiry tabs and actions. The current synthetic regression suite and teacher-route smoke checks pass; secondary-route actions and physical camera/equipment rehearsal remain required before proposing a merge or claiming demonstration readiness.

Each step produces an independently reviewable commit and updates FEATURE_PRESERVATION_CHECKLIST.md. If a regression occurs, fix or revert that step; do not conceal it by dropping a feature or weakening the check. Necessary API/schema changes must be documented separately before implementation.

## Known pre-existing questions

`#teacher-reports` appears in navigation but not in TAB_ROUTES. Verify whether another handler provides access; currently UNVERIFIED, not established working and not yet declared broken. Current term-grade/onboarding and secondary tools lack full browser coverage. Do not claim universal feature parity until these are checked. Existing analytics writers conflict; visual preservation does not endorse their calculations. Legacy student score exposure already removed in stabilization must not be restored.
