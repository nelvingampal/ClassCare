# Frontend integration slice 1 — teacher shell and Overview

September 12, 2026. Branch: `codex/classcare-frontend-integration`. Scope is desktop presentation only; mobile/tablet verification is intentionally deferred to the final pass.

## Changed

- Added the selected Candidate 3 symbol to the existing teacher brand treatment without replacing the application shell.
- Scoped the V3 sky-blue rail and Overview spacing styles to `body.v3-teacher`.
- Reset the teacher app's internal `.app-content` scroll position when switching routes. This fixes a navigation presentation defect without changing data or route handlers.
- Kept the existing live care surface on Overview. Its listeners, alert data, actions and persistence remain unchanged; this slice does not relocate the legacy engine into a hidden tab.
- Copied only `classcare-symbol-color.svg` from the frozen prototype asset set. Prototype application files, fixtures and mock-data code were not copied.
- Added the symbol to the existing static service-worker allowlist so the shell can retain the brand asset in the same controlled cache.

## Verification

`tests/integration.cjs` passes in the synthetic Auth/Firestore emulators:

- all current teacher route hashes reached their existing panels;
- existing `#teacher-reports` section remained reachable;
- internal content scroll reset to zero when returning to Overview;
- the live care surface remained under `#view-dashboard` and visible on Overview;
- the selected logo asset was loaded by the existing teacher shell;
- desktop Overview screenshot captured at 1440×1000;
- no page JavaScript errors were recorded.

`npm test` passes all 13 existing unit/queue tests. Syntax checks for the affected teacher scripts pass. Tablet/phone, camera hardware, whole-app writes and secondary-tool actions are not claimed by this slice.

## Intentionally unchanged

Firebase access, authentication, attendance transactions, check-in questions, scores, exports, care-alert calculations, route destinations and supplemental teacher tools remain application-owned. No alert policy or schema work is included.
