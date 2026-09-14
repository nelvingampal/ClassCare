# Care Alerts presentation slice

September 12, 2026. Branch: `codex/classcare-frontend-integration`.

This desktop-only slice styles the existing Care Alerts workspace: summary metrics, alert and inquiry tabs, filters, and tables. The visual language distinguishes attention states with restrained mint, yellow and rose surfaces while keeping sky-blue navigation and structure.

No alert threshold, correlation rule, status transition, concern privacy rule, support action, escalation, listener, or persistence path was changed. The existing Overview care surface remains visible; this route continues to expose the current detailed alert and inquiry actions.

## Checks

- `npm test`: 13/13 pass.
- `tests/integration.cjs`: all teacher route hashes, Overview placement, logo loading and desktop shell checks pass.
- `tests/browser.cjs`: attendance/time-out/check-in, deep assessment, summative publish/save/conflict, student privacy, admin and existing mobile assertions pass.
- Mobile styling changes are intentionally deferred; this slice only adds desktop presentation rules.
