# Students presentation slice

September 12, 2026. Branch: `codex/classcare-frontend-integration`.

This desktop-only slice styles the existing `#teacher-students` picker to match the selected sky-blue teacher shell. The current application behavior remains authoritative: the list contains students with a recorded arrival, supports the existing selection and refresh actions, and shows the existing empty state when no student is ready.

No roster query, permission, detail data, score field, check-in question, or save handler was added or changed. The richer dated attendance, score and check-in evidence remains on the existing Overview record panel until the application’s Students/detail behavior has been fully inventoried and tested.

## Checks

- `npm test`: 13/13 pass.
- `tests/integration.cjs`: all teacher route hashes, Reports reachability, Overview placement, logo loading and desktop shell checks pass.
- `tests/browser.cjs`: attendance, check-in, score, student privacy, admin and existing mobile assertions pass.
- Mobile styling changes are intentionally deferred; this slice only adds desktop presentation rules.
