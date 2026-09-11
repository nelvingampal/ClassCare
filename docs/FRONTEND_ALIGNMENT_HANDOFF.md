# Frontend alignment handoff — do not integrate yet

Design task: **ClassCare — Frontend Design and Prototype**, ID `01a07e4f-6532-7073-9cc8-e1c2571e8cc4`.
Workspace: `C:/Users/Mico/Documents/ClassCare-Frontend` (preserved, read-only from this audit).

The task's recent messages and local PROGRESS.md were inspected. Candidate 3 flat open-book assets are implemented. Recent task messages concern logo meaning and the port collision; the correct documented prototype port is 4174. This does not establish approval of a fully aligned production UI.

Keep sky blue and Candidate 3. Before implementation, inspect Concept 2's selected image, current four screens, BRAND_GUIDE.md and design-qa.md together. The existing prototype's synthetic-only tests do not validate the updated application.

## Revised screen map

1. Overview: real selected class/date, recorded attendance counts, clear Take attendance action. Dated evidence links. Analytics panel remains blocked by the competing-rule decision; no illustrative values may enter integrated screens.
2. Students: roster from staff-authorized users, search/class selection, detail with dated attendance, staff-only term and summative scores, and explicitly identified three-step/deep/legacy responses. Missing data stays missing.
3. Attendance: preserve daily scanner route, actual camera/manual controls, transaction-confirmed arrival/time-out/duplicate result, optional daily three-step check-in with skip, failed-save retry. Link the separate deep check without pretending it also records attendance.
4. Scores: distinguish term grades (current 60–100 implementation) from summative scores (0–assessment maximum). Retain publish, dirty-state, discard, validation and conflict feedback. Five-row transaction batches can partially complete a larger class save; retain remaining drafts on failure.

For each included element record: data collection/field or computed source, permitted role/action, loading/empty/error/offline state, and a test. Exclude all mock data and simulated scan dependencies from integration. Preserve other current routes rather than silently deleting capabilities to fit the four-view prototype.

## Outstanding review

- The user delegated a research-led policy recommendation. Use ALERT_POLICY_RECOMMENDATION.md for the proposed single follow-up policy; implement and verify it before connecting analytics UI. Do not wait for an adviser reply to continue the technical planning.
- Verify full layout approval separately from Candidate 3 logo production.
- Verify current grading policy with adviser; do not silently substitute the prototype's 0–100 term scale.
- Expanded stabilization browser verification and CSV/XLSX checks PASS within TEST_RECORD.md's stated limits.
- Recheck partner main, record reviewed stabilization revision, then create `codex/classcare-frontend-integration`.
- Visual QA after integration at 1440, 768, 390; keyboard, focus, overflow, error recovery. Actual-camera rehearsal and deployment revision remain separate checks.

## September 12 alignment result

Read FRONTEND_SPEC_V2.md as the current element-to-source/action/check specification and DESIGN_AUDIT.md for screenshot-backed visual corrections. All elements listed for integration are mapped or excluded. The specification checkpoint is complete; final visual implementation and the proposed alert behavior remain work to perform. Compact the hero, separate term/summative entry, preserve exact questionnaire types and display missing data honestly. Candidate 3 logo approval does not imply approval of every layout detail.
