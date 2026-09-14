# ClassCare pitch and demonstration alignment

Prepared September 14, 2026. Scope: local integration branch, synthetic demo-classcare records. The prior repairs are checkpoint 746d33b; the calmer-navigation finish is a subsequent local change. This record does not establish the Netlify revision or active production rules.

| Presentation claim | Implementation evidence | Verification and limit |
|---|---|---|
| QR attendance with an optional daily response | teacher/scanner.html, teacher/scanner.js and daily browser scenarios | Duplicate, arrival, time-out/retry and skipped response scenarios use synthetic records. Physical QR identity/camera rehearsal remains separate. |
| Teachers review student records together | teacher/index.html, teacher/scanner.js directory and shared record renderer | Explicit selection, Back, filter, missing records and keyboard focus covered by integration test. Available history is bounded; do not claim a complete lifetime student profile. |
| Term grades and summative scores are distinct | teacher/grades.js; teacher/summative.js; teacher/summative.html | Separate storage, scales and save flows; navigation grouping does not combine calculations. Students may not read the staff grade collections under tested rules. |
| One rule produces a prompt for staff review | js/holistic-core.js correlate; js/holistic-portals.js staffView | Latest valid summative result per student/subject from the last 30 days, below that assessment's threshold, plus a matching qualifying self-report within 14 days. Boundary and missing-score unit tests exist. Thresholds are prototype policy, not clinically validated. |
| Attendance provides context for that rule | correlate inspects emotion/mood/flags on supplied records | An attendance document may contain a check-in. The rule does not evaluate lateness, absence count or a decline across term grades. Do not claim a unified three-factor predictor. |
| Alerts are distinct from direct concerns and legacy intervention sources | holistic-portals.js; scanner.js care concerns/intervention renderers | Do not sum all sources or imply that every support request produces the combined-rule alert. Users still need a responsible review process. |
| Empty care status is confirmed rather than inferred | holistic-portals.js; tests/care-status.test.cjs | Cached/pending/error states cannot become confirmed no-alert status. Summary is specifically the holistic stream, not every concern source. |
| Access requires permission | firestore.rules and tests/firestore.rules.cjs | Approved teachers and administrators have all-class access by project decision. Pending/disabled staff and student grade access have denied-access tests. This is not an independent security audit or a production guarantee. |
| Expected usefulness | CDC school connectedness rationale | Rationale for human connection; no measured ClassCare wellbeing, workload or learning benefit. Evaluate through a supervised pilot. |
| Maintenance needs a partner | Actual Firebase/hosting stack; Firebase pricing documentation | No commercial price or verified monthly operating cost yet. Measure database reads/writes, hosting, messages, support, training and security work. |

## Demonstration boundary

Show the real local teacher application with fictional accounts. Walk through Overview, one student's dated records, Attendance and separate score entry. Use touch/keyboard for optional responses unless gesture loading passes its own check. Notification delivery, live school deployment and a clinical interpretation are excluded from the promised demonstration.

## Presentation wording

- Say “a prototype rule prompts teacher review,” not “AI detects emotional problems.”
- Say “approved staff can access classes,” not “only the assigned teacher can see a student.”
- Say “a skipped response stays missing,” not “no response means the student is fine.”
- Say “selected controls and workflows passed specified local tests,” not “the system is fully secure.”
- Describe student age range and the first pilot school as unresolved; a Grade 5 demo is illustrative.
- Attribute the original concept to the adviser/partner team; describe individual contributions accurately.

## Sources checked September 14

CDC school connectedness: https://www.cdc.gov/youth-behavior/school-connectedness/index.html

Firestore authentication and authorization rules: https://firebase.google.com/docs/firestore/security/rules-conditions

Philippine Data Privacy Act: https://privacy.gov.ph/data-privacy-act/

NPC education privacy guidance: https://privacy.gov.ph/npc-phe-bulletin-no-16-privacy-dos-and-donts-for-online-learning-in-public-k-12-classes/

Existing check-in product: https://reflect.microsoft.com/

Existing grade-management product: https://support.google.com/edu/classroom/answer/16643267?hl=en

Firebase costs: https://firebase.google.com/pricing

These sources support the rationale, legal/security context or comparison. They do not endorse or validate ClassCare.
