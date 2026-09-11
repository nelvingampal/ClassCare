# Frontend alignment specification v2

2026-09-12. Scope: specification and evidence, not a claim that the prototype or production frontend has been updated. Read with FEATURE_ALIGNMENT.md and DESIGN_AUDIT.md. The user authorized a research-led recommendation without waiting for an adviser reply. No additional design exploration, framework change or automatic alert formula is assumed.

## Screen map and included controls

| Screen / element | Real source and permitted action | Acceptance check / recovery |
|---|---|---|
| Shared class selector | Staff-authorized `users` / `sections`; approved teachers and admins may select any class | Switching class refreshes counts/roster and resets incompatible selection; no “assigned classes only” restriction |
| Shared navigation | Overview, Students, Attendance, Scores; existing teacher routes retained as secondary tools | Keyboard-visible focus, active destination, small-screen menu closes and returns focus; no dead links |
| Overview date + counts | `attendance.date`, status, roster membership; read only | Separate selected date from current date; Present/Late/Not recorded use actual status labels; missing record is not Absent |
| Take attendance | Existing `teacher/scanner.html` | Opens actual manual/QR journey; scanner errors do not become success |
| Overview evidence review | Dated `attendance`, `grades`, `summativeScores`, `emotional_checkins` | Replace synthetic comparison with selected student's real records; missing history says so; no invented trend or comparable-score claim |
| Overview follow-up region | Proposed support workflow, pending research specification | Visually separate requested support from inferred record patterns; implementation excluded until recommendation is translated into a single tested engine |
| Students search and roster | `users`, role student, class, name/student ID; staff read | Full-class results, clear empty search, one selected record; no multi-select semantics for a single detail selection |
| Student attendance detail | `attendance` by student UID/date | Arrival/time-out/status shown independently; zero history is not evidence of absence |
| Student scores detail | Staff-only `grades.term1..term4` and `summativeScores` linked to assessment | Two labeled sections. Term range is the current 60–100 implementation; summative shows score/max and assessment date. School grading-policy endorsement remains unverified |
| Student check-in detail | Legacy `wellbeing_data.q1..q5`; daily `emotion_checkin_3step`; deep `answers` with recorded_via | Label type + date + actual question + answer. Never map legacy q2 to stress or q3 to motivation. Skipped responses stay missing |
| Attendance class/date/status register | Real staff roster + dated attendance | Filters agree with exports/counts; dense tables scroll internally with visible access to actions |
| Daily scanner | `manual-qr-input`, `btn-manual-scan`, camera controls, transaction-backed saveAttendance | Permission, unavailable camera, invalid ID, arrival, duplicate, time-out, failed-write retry. Hardware testing separate |
| Daily optional check-in | Existing three-step mood/stress/need; Skip | Attendance persists independently; successful responses update atomically; failure retains retry controls; no positive default |
| Deep check link | `teacher/deep-check.html`, five explicit answers and review/Save | Independent of attendance; clear optional entry/exit; unavailable gestures fall back to touch; offline Save retains answers |
| Scores mode | Two destinations: Term grades and Summative assessments | Switching never blends different scales; dirty work prompts before leaving |
| Term entry | `teacher/grades.js`, staff `grades` writes; existing subject/term structure | Validate current 60–100 range; no silent coercion; preserve entered terms and explain computed average; full grading workflow regression still outstanding |
| Summative publish | `summativeAssessments`, `notifications`, `scheduledTests`, atomic batch | Title/subject/class/date/max/threshold validated; show “in-app schedule saved”, never imply SMS/email delivery |
| Summative entry / Save / Discard | `summativeScores`, transaction conflict checks, five-row chunks | Blank distinct from zero; score <= maximum; stale editor rejected with draft retained; a partial class save reports remaining drafts |
| Export CSV / Excel | `teacher/export.js`, current selected staff roster and date window | Same column meanings, safe text cells, missing statuses, headers/filter cover all columns; full deep-check export is excluded |
| Notification status | Existing dispatch state only | Queued/unavailable/failed/sent distinctions; parent delivery is not verified and remains disabled in synthetic testing |

## Remove from integration

MockDataStore and fixture values; reset-sample-data and error-simulation switches; simulated student/status selection; fake scan action; sample teacher/class branding; prototype-only technical disclaimers. Retain an explicit synthetic-data banner in the isolated rehearsal environment. No risk percentage, diagnosis, emotion-from-face inference, unsupported chart, or “absence” derived from missing scans.

## Visual direction

Keep Candidate 3 assets, sky surfaces, navy text, white content cards, existing typography and four main destinations. Compact the Overview hero so useful records appear sooner, especially on a phone. Use concise teacher-facing headings such as “Class overview” and “Records to review.” Put the class/date controls near the main task. Present wellbeing evidence before supporting academic details when the teacher is reviewing a support request.

At narrow widths, use a searchable roster/list then focused student detail rather than a long roster above an inaccessible detail panel. Keep summative assessment context above its table; long titles wrap or truncate with the complete selected title directly below. Scores use an internally scrollable table with clear headers and visible save feedback.

## Checkpoint result

All listed elements have a source/action/check or an explicit exclusion. The specification is aligned; application integration has NOT begun. Remaining production gates: implement the research-led support policy in one place, complete whole-app grading/onboarding regression, review the revised visual implementation, recheck main, and then create the integration branch. Physical rehearsal and production deployment are not replaced by this specification.
