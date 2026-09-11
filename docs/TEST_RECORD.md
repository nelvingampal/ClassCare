# Local stabilization test record

Synthetic `demo-classcare` only. No live accounts/data or outbound notification delivery.

| Check | Result | Evidence / limits |
|---|---|---|
| Current remote main | PASS | `3366b4e8ed79f8203dc283952b1aec828f207f7e`; original copies preserved |
| Deterministic domain + durable queue | PASS, 13 tests | `npm test`: 8 holistic domain tests + 5 queue tests |
| Firestore permissions | PASS, 11 tests | `tests/firestore.rules.cjs`, Firestore emulator; approved all-class staff, disabled/pending denial, private scores, assessment/score/deep-check validation and 15 rows via five-row batches |
| Original browser suite against new source | FAIL | Old suite targeted manual-id on the changed daily scanner; revised to actual manual-qr-input + three-step UI |
| Revised browser run | PASS | `tests/browser.cjs`; headless Edge, synthetic Auth/Firestore, production API routes blocked, service worker blocked to isolate page behavior. Actual daily scanner/duplicate, three-step save, deep-check offline retry, summative create/save/acknowledgment, stale-edit rejection, student schedule without scores, teacher/admin loads, 390px summative/deep layout; zero page JavaScript exceptions. Expected network errors during intentional offline test; this is not a zero-console-warning claim. |
| Static service worker | PASS, scoped | `tests/reliability.cjs`: install, purge old private cache, offline static asset access after tab close/reopen. Does not establish full authenticated app operation offline. |
| Durable offline queue in browser | PASS, scoped | Real IndexedDB; queued arrival/time-out retained after tab reopen, wrong account does not replay, correct account flushes one merged record. Mock write adapter; not a real Firebase reconnection or full browser-process restart test. |
| CSV and XLSX downloads | PASS | Real downloads parsed: 18 columns, matching labels, formula-like name handled as text, missing history, commas, and XLSX autofilter A1:R3. XLSX explicit stale headers fixed. |
| Physical QR/camera, three rehearsals | NOT RUN | Fake-camera MediaPipe loading does not establish real scanning or gesture recognition on actual equipment. |
| Deployment revision / production rules | UNVERIFIED | Public landing page reachable in initial inspection; source commit not established |

## Reproduce

Install locked packages with `npm ci`. Use Java 21 with Firebase emulators. `npm test` runs unit checks. `npm run test:rules` starts synthetic Firestore. Start Auth + Firestore for `node tests/browser.cjs` (default ports 9099 and 8080). The browser script starts/stops its own loopback server on 5599.

`node server.js` always substitutes demo Firebase configuration and redirects Auth/Firestore to local emulators. It does not seed users. Never run scratch scripts to seed fixtures. Browser test creates its own fictional accounts.

CLI startup may be slow; a direct Java Firestore emulator was used on port 8180 for the successful rule run, with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8180`. This is a test-runner distinction, not an application failure.

Visual spot-check: summative mobile screenshot reviewed. Long assessment select text is clipped and the narrow score table needs deliberate internal scrolling; do not treat the automated no-page-overflow assertion as final design approval. Full 1440/768/390 comparison remains in the frontend phase.
Syntax: 39 application JavaScript files, server.js and sw.js pass node --check. git diff --check passes after whitespace cleanup.

## September 12 expanded run

`tests/browser.cjs` rerun against synthetic Auth/Firestore: PASS including transaction failure during time-out with unchanged stored record, successful retry, and skipped check-in without creating a response. Initial expanded run exposed scanner stop/clear and stale reset-timer races; repaired and rerun successfully. Final run has zero page JavaScript exceptions. Expected intentional offline resource errors remain. The current correlation tests validate existing behavior only, not the proposed replacement policy.

`node tests/reliability.cjs`: all three scenarios PASS (static service worker, durable queue with adapter, exports). Starts/stops its own loopback server on 5601. `docs/evidence/reliability-browser.log` preserves the successful expanded emulator/browser output.

Frontend audit: four prototype desktop views inspected at 1440px; Overview additionally at 768px and 390px. Screenshots in `docs/evidence/alignment/`. This is scoped visual evidence, not a full accessibility certification or integrated application test.
