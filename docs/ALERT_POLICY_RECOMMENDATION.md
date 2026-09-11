# ClassCare teacher follow-up policy — recommended v1

Prepared September 12, 2026. User delegated the recommendation to the main planner after technical verification and frontend alignment. This document specifies a proposed implementation; the current analytics code has not been replaced. It supersedes the earlier instruction to wait for an adviser response. It does not establish clinical validation or school approval for live use.

## Decision

Build one explainable teacher follow-up list, with voluntary student responses leading and attendance/scores providing dated context. Do not require all three factors before showing a request. Do not turn any low score or absence into an emotional-risk label. Keep the existing approved all-class staff permissions and student score privacy.

## Evidence and its limits

- An IES randomized study of 73 US high schools found reduced chronic absence and course failure after one year of an early-warning intervention process, but no detectable improvement in credit progress. This supports evaluating a staff review-and-support workflow. It does not validate ClassCare, emotional prediction, a Philippine elementary population, or particular app thresholds. [IES, April 2017](https://ies.ed.gov/use-work/resource-library/report/impact-study/getting-students-track-graduation-impacts-early-warning-intervention-and-monitoring-system-after-one).
- The University of Maryland NCSMH guide describes screening as a systematic process for identifying strengths and needs, with timely follow-up and assessment where safety is at issue. ClassCare's custom questions have not been established as a validated screening instrument. My design inference is to present responses and support requests with human review, avoiding diagnostic labels. [NCSMH Screening Quality Guide, 2023](https://www.schoolmentalhealth.org/media/som/microsites/ncsmh/documents/quality-guides/Screening.pdf).
- CDC describes teacher caring, time to talk, regular check-ins, and help catching up after absence as practices supporting school connectedness. My recommendation places the teacher's response at the center of the workflow. This guidance does not establish an effect size for this app. [CDC Teacher Caring and Support, August 2024](https://www.cdc.gov/classroom-management/approaches/teacher-caring-support.html).

The operational choices below are provisional product rules for a synthetic demonstration and subsequent teacher evaluation, not thresholds proven by these sources.

## Deterministic rules

| Evidence | Proposed output | Acceptance condition |
|---|---|---|
| Explicit request for someone to talk to, including daily `need_key=someone_to_talk_to` and deep-check needs answer 3 | `Student requested a conversation` | Appears regardless of scores or attendance. Daily check-in and its generated `talkToSomeone` record count as one request. |
| Deep-check support answer 3: `I feel unsafe` | `Student reported feeling unsafe` in a distinct prompt-review group | Preserve exact wording and timestamp. Do not wait for repetition or an academic threshold. No automated diagnosis, emergency-service claim, or external dispatch. For real use, the school must identify who reviews this and its existing safeguarding response. |
| Other explicit concerning selections in the existing daily/deep questionnaires | `Check-in to review`, with actual question and selected answer | One saved response can be reviewed. Display exact version-specific answer mappings; do not rely only on the lossy `is_negative` flag. Deep motivation/support/needs answers remain distinct. |
| Repeated concerning responses | Group under the same student and show dates and counts | Default context window: last 14 calendar days, explicitly a display choice. Two dates can be described as two responses, never as a validated emotional trend or severity level. No new notification for each rerender. |
| Recorded absence/lateness, or summative score below the assessment's teacher-set threshold | Show attendance/learning observations and supporting context | These can justify educational review, but alone do not generate an emotional label. Show observed counts, score/max, subject, assessment date and configured threshold. |
| All three kinds of evidence present | Same follow-up item with all evidence visible | Explain co-occurrence; do not assert that absence caused distress or that the combined record proves a condition. |
| Skipped check-in, no attendance document, missing score/history | `No response`, `Not recorded`, or `No score available` | Missing is never a positive/negative answer, absence, zero, or evidence of safety. No alert solely because a check-in was skipped. |

Use the last 30 calendar days for the initial supporting-record view, with a visible date range and access to older history. This is a display default, not a validated risk window. Do not calculate chronic-absence rates without a trustworthy enrolled instructional-day denominator. Do not call a comparison a decline unless scores are comparable in subject, scale and assessment meaning; initially show dated values instead.

Use separate groups: reported safety concern, conversation requests, other check-ins to review, and attendance/learning observations. Order oldest unreviewed first within each group. This is a work queue, not a ranking of students by psychological risk. A blank queue says `No unreviewed items in this view`; it must not say no student needs support.

## Staff action and lifecycle

Proposed actions: open evidence, mark reviewed, record a follow-up action, and close with a reason. Acknowledgment is distinct from completing a conversation. Record the staff actor and time; all approved staff may read across classes, while a claimed owner makes responsibility visible. Do not promise that only one teacher can see responses under the chosen access policy.

Never automatically close an unanswered conversation request because a later score improves or its evidence falls outside the display window. A later independent request reopens or creates new work; repeated evaluation of the same source must be idempotent. Source corrections mark evidence corrected rather than silently erasing a staff action. Avoid storing detailed sensitive conversation narratives when an action category and brief necessary note suffice.

## Technical handoff and boundaries

Current `js/holistic-core.js` / `js/holistic-portals.js` and `teacher/summative.js` have competing writers to `careAlerts`. Replace them with one deterministic evaluator and one persistence owner. Keep normalized source adapters separate from policy. Input includes questionnaire version, exact answers, source IDs, student ID, evidence date and staff-visible source records. Output includes policy version, reason codes, source references and display facts; no composite emotional-risk percentage.

Before implementation, document whether existing `careAlerts` and action records can support this lifecycle or require additive fields. This is a proposed interface change, not an assumed existing capability. Preserve old records with a legacy-policy label; do not bulk reinterpret production history. Unifying explicit concerns and check-ins also requires duplicate-source mapping. No notification delivery or new clinical questionnaire is included. Keep outbound services disabled locally.

Implement and test the pure evaluator before connecting the revised Overview/Students views. Replace misleading existing reassurance and teacher-only visibility copy. Scores retain their actual scale; no new grading policy is implied. Summative and term grades stay distinct. The frontend's illustrative analytics remain excluded until this behavior is implemented and tested.

## Example tests for the implementation pass

1. Good attendance and scores plus a conversation request: one visible request.
2. No scores plus `I feel unsafe`: visible exact report, no academic gate.
3. One low summative score with no check-in: learning observation, no emotional classification.
4. Two explicitly recorded absences with skipped responses: attendance context; no invented emotional response.
5. Low score plus concerning response: one check-in item with both dated sources.
6. Multiple entries on one day: show response count and distinct-day count accurately; avoid fake repeated-day claims.
7. Duplicate daily check-in/request documents: one request with both source references.
8. Improved score after an unanswered request: request remains open.
9. Teacher reviews then student makes a later request: new work is visible; previous action retained.
10. Missing/unknown questionnaire version: show raw labeled evidence for review; do not guess an answer mapping.
11. Pending/disabled staff and student: denied access to private staff records; approved staff have all-class access.
12. Empty filtered list: neutral empty state, no claim that everyone is well.

## Evaluate before making benefit claims

Use synthetic cases first, then structured teacher walkthroughs to check whether each reason is understandable and leads to an appropriate next action. Track duplicate items, time to find relevant context, unnecessary prompts, and missed requests in the agreed test cases. Later real-world evaluation needs a defined population, responsible staff and an appropriate school/research process. These checks measure workflow usefulness; they do not diagnose students or prove improved wellbeing.

Pitch wording: `ClassCare brings attendance, staff-recorded scores and voluntary check-ins together so teachers can review context and follow up with students.` Describe automated prompts only after implementation has passed its acceptance checks.
