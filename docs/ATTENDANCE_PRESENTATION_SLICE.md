# Attendance presentation slice

September 12, 2026. Branch: `codex/classcare-frontend-integration`.

This desktop-only slice applies the selected sky-blue visual hierarchy to the existing Attendance panel: the daily scanner and deep emotional check launch cards, the live attendance header, and the current register table. The cards continue to launch the existing full-page scanner and deep-check flows.

No scanner lifecycle, QR/manual lookup, transaction, duplicate handling, time-out action, check-in question, optional skip, export, or Firestore listener was changed. The existing register remains the source of truth for actual statuses and responses.

## Checks

- `npm test`: 13/13 pass.
- `tests/integration.cjs`: all teacher route hashes, Overview placement, logo loading and desktop shell checks pass.
- `tests/browser.cjs`: attendance/time-out/check-in, deep assessment, score/care alert, student privacy, admin and existing mobile assertions pass.
- Mobile styling changes are intentionally deferred; this slice only adds desktop presentation rules.
