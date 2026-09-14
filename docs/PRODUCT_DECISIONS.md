# Product decisions and open questions

## Confirmed

- Approved teachers and administrators have all-class access.
- Recorded scores are staff-only, per the adviser requirement.
- Sky-blue identity and Candidate 3 branding remain selected.
- User clarification, September 12: emotional wellbeing is the focus. Attendance, scores and voluntary check-ins provide context for teachers. The team has not settled how these factors should trigger an automated alert.

## Historical clarification: alert policy

The user explicitly expressed uncertainty. “All of them” is not approval that every factor is required (AND), that any factor independently triggers an alert (OR), or that the factors should receive weights. Do not invent thresholds, windows, a combined risk score, or predictive claims.

Current implementations conflict: the shared correlation engine uses a low recent summative score plus a recent negative check-in; the score-save engine also permits repeated recorded absences as an alternative and uses different history handling. Both write to the same alerts. These are implementation observations, not approved product policy.

## Recommendation for team review — not approved implementation

Frame ClassCare as a teacher support tool: attendance and academic records add context to what students voluntarily report, helping a teacher decide whether to check in with a student.

Keep dated observations individually visible. Distinguish an explicit student request to talk from an inferred pattern in records. Use neutral prompts such as “Review recent records” rather than asserting an emotional condition from absence or a low score. A teacher decides the response.

The user subsequently delegated a research-led recommendation to this planner rather than waiting for an adviser reply. See ALERT_POLICY_RECOMMENDATION.md for the concrete rules, primary sources, example cases and lifecycle. Display windows are identified as provisional design choices. Existing conflicting algorithms remain implementation observations, not endorsed policy.

## Next checkpoint

Independent reliability checks and the frontend specification are complete within their documented scope. Implement one authoritative follow-up policy with tests before integrating its UI. Document required interface changes first. Do not claim final visual or real-world approval. The existing main planner coordinates the frontend task; no parallel writer has been started.
