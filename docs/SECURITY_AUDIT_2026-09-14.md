# Strict security policy and compatibility repair — September 14, 2026

This user request supersedes September 11 all-class teacher access: teachers now require an exact entry in administrator-managed `users/{uid}.assigned_sections`. Administrators retain school-wide access. Pending/disabled teachers are denied. Scores remain staff-only under the supplied adviser restriction; the general own-document rule does not grant students score access.

## Deliverables, in requested order

1. `firestore.rules`: default deny, no unauthenticated access, read-only students, section-scoped staff, immutable record ownership/section, trusted-profile role lookup without custom-claim fallback. Covers requested collection names and deployed legacy aliases. Users can read their own profile by document UID (needed for authentication); other student records require `studentId == request.auth.uid`. Only administrators provision or edit identities and assignments. Existing assessment/score validation remains.
2. `config/firebase-config.js`: reCAPTCHA v3 App Check before Firestore initialization, automatic refresh, required public site key in `js/config.js`, explicit local demo emulator wiring. All seven entry pages load the compat SDK. Firestore persistent caching is no longer enabled; authentication uses session persistence.
3. `js/protected-route.js`: native JavaScript policy for this HTML/JavaScript app; there is no React or React Router dependency. Shared identity subscription checks the server-confirmed profile before emitting authenticated access to any module. Wrong roles immediately navigate to the existing root login page. Missing/cached identities emit no authorized user. Profile revocation reloads the page to discard active view state. This guard is supplementary; Firestore enforces authorization independently.

`js/analytics-privacy.js` whitelists fields consumed by teacher calculations and produces date/count-only admin chart data. Student identifiers remain temporary inputs for distinct counts and the existing individual review table; this is data minimization, not irreversible anonymization. No names, emails, notes or arbitrary document properties are added to chart datasets. Authorized record views still fetch full documents. Firestore client queries cannot redact individual fields: a separate aggregate-only collection or server count query is necessary if the browser itself must never receive record PII.

## Release blockers and compatibility consequences

- BLOCKED: partner must register reCAPTCHA v3, supply the public site key, verify domains, and enable Firestore App Check enforcement in Firebase Console. Initialization alone does not enforce attestation. No console or live-project changes were made.
- BLOCKED: legacy records frequently use `student_uid` or school `student_id`, not canonical auth UID `studentId`. A trusted, reviewed migration must backfill canonical `studentId` and exact `section`; rules intentionally deny records that do not satisfy ownership/schema checks. No live records inspected or migrated.
- FIXED: shared `ClassCare.collection` / DB accessors constrain teacher queries by exact administrator-managed assignments and student queries by authenticated UID. Staff attendance, deep/three-step check-ins, referrals, grades and enrollment saves now carry canonical `studentId`; existing records with a verified `student_uid` can receive the same canonical owner on update. No school ID is treated as an auth UID. Raw document references remain native for Firestore transactions/batches; rules still enforce direct reads and writes.
- FIXED: absent attendance/score/care documents can be checked before a staff transaction creates them, without granting reads of existing unauthorized documents. In-app assessment schedule writes are validated against the associated assessment in the same batch. Students can read their section schedule but cannot read scores. Teachers can read their own assignment document, but cannot change authorization assignments.
- POLICY CONSEQUENCE: student self-registration, enrollment, concern and check-in submissions remain denied under the explicitly requested no-student-writes policy. Profile provisioning and section assignment changes are administrator-managed. Registration now explains this before creating an unusable Auth account. Student profile edits explain the read-only policy. These workflows cannot be re-enabled merely as a permissions bug fix without revising that policy.
- Query scope currently supports 1–30 exact teacher section assignments; an absent/malformed/oversized list fails closed. Firestore disjunction limits also apply to combinations with other `in` filters. Verification covers one and two assigned sections, not arbitrary large assignment sets.
- Remaining privacy work: pre-existing Firestore IndexedDB caches and application offline queues may contain old PII. Disabling future Firestore persistence does not erase existing storage. Retention, queue encryption/removal, existing export/notification integrations, and individual-record global state require a separately verified remediation before any claim of comprehensive security. No destructive cleanup or outbound notification was performed.
- NOT RUN: physical camera/equipment rehearsal, production App Check enforcement, production index validation, deployment or merge. Existing permission tests now assert section isolation and canonical owner fields.

## Verification

PASS: `npm test`: 22 tests. `node --test --test-concurrency=1 tests/firestore.rules.cjs tests/security.rules.cjs`: 16 Firestore tests. Evidence: `test-results/security-unit.log`, `test-results/security-all-rules.log`.

PASS: security browser workflow (`CLASSCARE_SECURITY_ONLY=1 node tests/browser.cjs`), including actual attendance, duplicate handling, failed-save retry, optional skip, manual five-answer check-in, publishing assessment, score concurrency, care acknowledgment/resolution, student schedule without scores, cross-section roster/direct-read denial, student route redirects, and live teacher revocation. No uncaught JavaScript errors. Evidence: `test-results/security-browser-focused.log`.

FAIL: full browser run stopped at the external MediaPipe gesture model download (`test-results/security-browser.log`). Security-only mode explicitly skips that remote model and verifies the manual-input paths; it does not convert the failed model check into a pass.

The profile listener now ignores cache-only metadata after a server-confirmed identity instead of clearing active drafts on temporary disconnect. Initial cached profiles never grant access; account switches clear the identity immediately, and server revocation redirects. A regression test covers that distinction. Auth uses session persistence, so a separately opened tab may require sign-in again.

## Partner rollout sequence

1. Review and migrate legacy records to authenticated `studentId` plus exact `section`; assign approved teachers explicit `assigned_sections` lists. Preserve the distinction between school ID and auth UID.
2. Register the web app in Firebase App Check with reCAPTCHA v3 and authorized domains. Put only its PUBLIC site key in `CLASSCARE_CONFIG.appCheck.siteKey` in `js/config.js`; the current value is deliberately a placeholder. A missing key blocks non-demo initialization.
3. Publish the matching HTML/JavaScript assets, `firestore.rules` and `firestore.indexes.json` together through the partner's release process, with a verified rollout window. Deploying only the stricter rules against an old client will reject legitimate requests.
4. Verify App Check metrics and enable Firestore App Check enforcement in Console; verify approved/denied access and required indexes on the partner's authorized deployment. Local file edits and App Check initialization alone do not modify the hosted database firewall or console enforcement.
5. Resolve retained offline PII before claiming comprehensive privacy readiness. No production project access, merge, deployment, or notifications were performed here.

## Initial audit evidence (historical)

PASS: four focused unit tests; three Firestore security test groups (all assertions pass); JavaScript syntax and `git diff --check`. Evidence: `test-results/security-rules-verified.log`. CLI startup initially failed because Java was absent from PATH; after using the bundled Java, the new emulator download also failed. Verification succeeded with the existing cached Firestore emulator v1.19.8, Java 21, loopback port 8188, `demo-classcare`, and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8188`. No production data was used. This tests the specific new boundaries, not every application workflow or all possible attacks.

Sources: https://firebase.google.com/docs/app-check/web/recaptcha-provider and https://firebase.google.com/docs/firestore/query-data/aggregation-queries .
