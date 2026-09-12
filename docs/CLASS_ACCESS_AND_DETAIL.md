# Class access and student detail — September 13

Baseline: 9fa62fa, branch codex/classcare-frontend-integration.

## Implemented

- Scanner/dashboard roster query scope no longer treats teacher assignments as access boundaries. Approved staff load all classes; the selected class remains a view filter. Authentication, disabled/pending checks and Firestore rules are retained. Assignment metadata on user profiles is not modified.
- Directory Review records now opens a focused detail within Students. It moves the existing record panel, preserving its IDs and handlers. Back to directory restores focus and the Overview home position. Leaving Students or signing out also restores the panel. No second record DOM, data subscription or save handler is created.
- Student identity uses the full name; record actions explicitly say View emotional history. Term grades stay available through their existing separate screen.
- Removed the term-average fallback from summative evidence: it supplied undefined score values and fabricated default dates/scales. Missing assessments now remain Not recorded. Displayed normalized values are labeled percent, and original score/max remain in dated metadata.
- Daily mood/stress/requested-support values are rendered from actual fields rather than an undefined legacy emotion property.
- Attendance header hooks now identify the two existing columns, preventing duplicate columns. Existing time-out and emotional-history actions remain attached.
- Daily kiosk instructions describe attendance saved first and an optional three-step response.

## Evidence boundaries

This is not a new analytics engine or a complete history browser. The existing live source provides recent attendance/check-ins (up to 14 days) and summative scores owned by the signed-in staff member. The detail copy states those limits. Teacher assignments no longer restrict the dashboard roster; this does not mean every independently implemented supplementary tool has school-wide scope. Full retrospective score/history aggregation and analytical interpretation remain separate work.

No production records/services were accessed. No schema, security-rule, notification delivery or score-save changes. Mobile redesign remains deferred; existing browser suite includes its older limited small-screen smoke checks, not a redesigned mobile acceptance pass.

## Validation

- PASS: 13 unit/queue tests.
- PASS: 11 Firestore emulator tests, including cross-class staff access, disabled staff/admin denial, pending-staff restrictions and student score privacy.
- PASS: full existing browser suite: daily arrival, explicit responses, duplicate handling, failed time-out and retry, skip, fake-camera deep check, summative publishing/saving, care acknowledgment/resolution, student schedule without scores, stale-write conflict handling and administrator portal smoke check.
- PASS before final display-copy refinements: integration navigation, 31 students across two classes, selected cross-class record, single moved record panel, Back focus, missing-score state, eight attendance columns, both themes and sign-out cleanup.
- Final targeted run adds a real synthetic 8/10 summative record and mood/stress/need response for the second class; its outcome is recorded in STATUS.md.
- Physical camera/equipment rehearsal, deployed revision verification and full accessibility review: NOT RUN.

Screenshots: test-results/integration/student-detail.png and student-detail-alternate-theme.png. The isolated prototype remains preserved.
