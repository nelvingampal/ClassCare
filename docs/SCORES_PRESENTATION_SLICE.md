# Scores presentation slice

September 12, 2026. Branch: `codex/classcare-frontend-integration`.

This desktop-only slice applies the selected sky-blue visual hierarchy to the existing Term Grades and Summative panels. It styles the current cards, form surfaces, status ribbon and data-table headers without replacing their markup or scripts.

No term calculation, subject rule, blank-value policy, summative threshold, publish flow, score transaction, export, stale-edit guard, or student privacy behavior was changed. The existing application screens remain the source of truth for supported fields and actions.

## Checks

- `npm test`: 13/13 pass.
- `tests/integration.cjs`: all teacher route hashes, Overview placement, logo loading and desktop shell checks pass.
- `tests/browser.cjs`: attendance/time-out/check-in, deep assessment, summative publish/save/conflict, student privacy, admin and existing mobile assertions pass.
- Mobile styling changes are intentionally deferred; this slice only adds desktop presentation rules.
