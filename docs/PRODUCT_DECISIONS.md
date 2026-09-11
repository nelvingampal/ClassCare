# Product decisions and open questions

## Confirmed

- Approved teachers and administrators have all-class access.
- Recorded scores are staff-only, per the adviser requirement.
- Sky-blue identity and Candidate 3 branding remain selected.
- User clarification, September 12: emotional wellbeing is the focus. Attendance, scores and voluntary check-ins provide context for teachers. The team has not settled how these factors should trigger an automated alert.

## Unresolved: alert policy

The user explicitly expressed uncertainty. “All of them” is not approval that every factor is required (AND), that any factor independently triggers an alert (OR), or that the factors should receive weights. Do not invent thresholds, windows, a combined risk score, or predictive claims.

Current implementations conflict: the shared correlation engine uses a low recent summative score plus a recent negative check-in; the score-save engine also permits repeated recorded absences as an alternative and uses different history handling. Both write to the same alerts. These are implementation observations, not approved product policy.

## Recommendation for team review — not approved implementation

Frame ClassCare as a teacher support tool: attendance and academic records add context to what students voluntarily report, helping a teacher decide whether to check in with a student.

Keep dated observations individually visible. Distinguish an explicit student request to talk from an inferred pattern in records. Use neutral prompts such as “Review recent records” rather than asserting an emotional condition from absence or a low score. A teacher decides the response.

Before enabling a unified automatic rule, ask the adviser for concrete example cases and the expected action: one low score alone; repeated absences with no check-in; a student asking to talk despite good attendance and scores; several concerning responses together with attendance or score changes. Use those examples to specify which evidence is sufficient, how much history is needed, who sees the prompt, and how it is acknowledged. Do not require the user to choose a formula without this context.

## Next checkpoint

Complete independent stabilization and feature mapping. Prepare the aligned design with observed records and explicitly unresolved analytics behavior. Do not integrate conflicting analytics or claim final design approval. The existing main planner coordinates the frontend task after the checkpoint.
