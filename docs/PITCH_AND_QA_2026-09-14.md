# ClassCare five-minute Q&A preparation

Updated September 14, 2026. These are short opening answers; expand only if the judge asks. Local tests use fictional data. None of the external sources has evaluated or endorsed ClassCare.

## 1. Why do we need it?

**Say:** “Teachers may review attendance, scores and student responses separately. Our prototype brings those records into one review workflow, so a teacher can consider the context and decide whether to start a conversation.”

**Support:** The actual teacher directory and record view demonstrate the workflow. [CDC school connectedness guidance](https://www.cdc.gov/youth-behavior/school-connectedness/index.html) describes the importance of students feeling cared for and supported.

**Limit:** That rationale does not prove ClassCare improves wellbeing, saves time or changes outcomes. Those are pilot questions.

## 2. What makes it different from existing systems?

**Say:** “QR attendance alone is not our originality claim. Our proposed contribution is the teacher's contextual review of attendance, staff-held scores and voluntary responses, with rule-based prompts for review.”

**Support:** [Microsoft Reflect](https://reflect.microsoft.com/) already offers check-ins, and [Google Classroom](https://support.google.com/edu/classroom/answer/16643267?hl=en) supports grades and assignment review. These are real alternatives, not a complete market survey.

**Limit:** Do not say first, only, or proven better. The comparative benefit of our particular workflow needs user evaluation.

## 3. Who will use it?

**Say:** “The main working user is the teacher. Students provide attendance and may choose to share a response. Administrators manage access. A partner school would help us choose the first pilot group and the appropriate support process.”

**Support:** Student, teacher and administrator routes exist in the application.

**Limit:** Grade 5 is a fictional demonstration class, not evidence that a specific age range has been approved or evaluated. Do not promise an implemented parent dashboard.

## 4. Is it secure?

**Say:** “We have implemented authentication and database permissions, and tested specified allowed and denied actions locally. For example, pending or disabled staff are denied, and students cannot read the staff score collections. We still need independent security review and verification of the deployed configuration before real use.”

**Support:** Local `firestore.rules` and 11 permission tests. [Firebase explains server-enforced rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions).

**Limit:** These tests are not penetration testing, a certification, or proof that the Netlify deployment uses these rules. Do not say 100% secure.

## 5. Can every teacher see every class?

**Say:** “Currently, approved teachers and administrators have all-class access. That is the prototype's access decision. A pilot school must review whether that breadth is appropriate for its responsibilities and sensitive records.”

**Support:** The approved project decision and tested rules permit all-class staff access. A class selector filters a view; it does not enforce authorization.

**Limit:** Do not claim assigned-teacher-only privacy. Narrower permissions would be a separate policy and implementation change.

## 6. How will you protect student information?

**Say:** “We demonstrate with fictional records. Before a real pilot, the institution and its privacy reviewers need to define the purpose, lawful processing arrangements, access, retention, support responsibilities and safeguards, then assess privacy risk.”

**Support:** The [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/) identifies education and health information within sensitive personal information. [NPC education guidance](https://privacy.gov.ph/npc-phe-bulletin-no-16-privacy-dos-and-donts-for-online-learning-in-public-k-12-classes/) discusses school privacy safeguards and security assessment.

**Limit:** A consent checkbox or translated terms alone does not establish compliance. Retention, incident response and institutional responsibility are not completed by the prototype's interface.

## 7. How does an alert work?

**Say:** “One rule combines a recent summative result below its configured threshold with a qualifying recent self-report. It flags the combination for teacher review. Attendance is shown as context; lateness and absence counts are not inputs to that particular rule.”

**Support:** `js/holistic-core.js`: latest valid assessment per student and subject within 30 days, below the assessment threshold, combined with qualifying responses within 14 days. Unit tests cover missing, invalid, future and superseded scores. `js/holistic-portals.js` writes and displays the resulting alert.

**Limit:** Term-grade decline is not part of this rule. Other legacy alert and direct-concern sources remain distinct. Thresholds are prototype settings, not clinically validated cutoffs. Do not claim a unified predictive model.

## 8. What if the student has good grades but needs support?

**Say:** “Good grades do not establish that a student is fine. The combined rule can miss a need that does not meet both conditions. Teachers must be able to review responses and use the school's support process independently of that alert.”

**Support:** The code requires both academic and response evidence for this rule. Separate concerns and support-request surfaces should not be confused with that rule's coverage.

**Limit:** We have not verified a comprehensive urgent-request escalation service. A software notification does not guarantee a timely human response.

## 9. Are you diagnosing students?

**Say:** “No. Students report their own responses. The system organizes educational records and applies prototype rules; the teacher considers the context. A flag does not establish a condition or its cause. Guidance professionals remain essential.”

**Support:** Questions and response options are explicitly encoded. The gesture interface selects an answer; it does not infer emotion from a face.

**Limit:** Do not claim depression detection, behavioral diagnosis or a substitute for a counselor.

## 10. What happens if a student skips or gives an inaccurate answer?

**Say:** “They may skip the daily response after attendance is recorded. The response remains missing. Self-report can be incomplete or inaccurate, so it should open a conversation rather than become a judgment.”

**Support:** The daily browser test verifies that skip preserves attendance without creating a response. The separate deep check requires explicit answers before saving and can be exited without inventing answers.

**Limit:** The software does not validate whether a student's response accurately describes their situation.

## 11. Can somebody use another student's QR code?

**Say:** “A QR code can be shared. Duplicate-record checks prevent repeated daily records, but they do not prove the identity of the person presenting the code. The school still needs supervised scanning or another appropriate identity check.”

**Support:** The browser suite verifies duplicate handling, not resistance to impersonation.

**Limit:** Do not claim biometrics or fraud prevention.

## 12. Does it work without internet, and do parents receive messages?

**Say:** “Some queued attendance behavior has automated coverage, but we are not claiming complete offline operation. Outbound notifications are disabled in this local demonstration, so successful parent delivery remains unverified.”

**Support:** Queue unit tests cover time-out preservation, parallel writes, retries and account isolation. Browser tests distinguish failed saves from successful ones.

**Limit:** A queued message is not a delivered message. Actual connection loss and school equipment need rehearsal and a fallback procedure.

## 13. Have you proved the system works?

**Say:** “We have tested selected software workflows and permissions using fictional records. That establishes limited technical evidence. We have not yet demonstrated better wellbeing or lower workload. A supervised pilot would measure task completion, usability, record-review time and the quality of follow-up.”

**Support:** Current local record: 14 unit tests, 11 permission tests, targeted desktop integration and the full synthetic browser workflow passed. Physical camera and presenter rehearsals remain separate.

**Limit:** Include missed or unnecessary prompts in evaluation. Do not transfer evidence about another school intervention to this app.

## 14. Who will pay for and maintain it?

**Say:** “We are seeking a school or institutional partner with an accountable technical maintainer, guidance personnel and privacy reviewers. Costs include hosting, database use, messaging, maintenance, training and security review. We would estimate recurring costs from measured pilot usage.”

**Support:** [Firebase pricing](https://firebase.google.com/pricing) distinguishes no-cost allowances and usage-based charges. These do not cover all human and messaging costs.

**Limit:** No verified monthly price or commercial fee exists yet. Do not promise free forever or nationwide scalability.

## 15. What exactly are you asking for?

**Say:** “A partner school to help define and evaluate a bounded pilot, guidance and privacy reviewers to shape responsible use, and technical support to strengthen and maintain the implementation.”

**Support:** This matches the adviser's roadmap and the current prototype stage.

**Limit:** Partnership and pilot participation have not been secured merely because they are shown on a slide.

## Delivery practice

Answer the question first in one or two sentences. Offer the evidence or limitation next. Avoid technical detail unless asked. Keep the main six-slide deck on its closing slide; open the separate Q&A appendix only when useful. Do not read URLs aloud.
