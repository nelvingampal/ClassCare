# Students directory — September 13

The Students destination now starts with a searchable loaded roster, class selector and explicit Review records actions. Enrollment remains accessible. The existing recorded-arrival picker remains below, named Classroom activity picker; IDs and handlers are retained.

Review records reuses `updateRecordOverviewCard` and navigates to Overview, focusing the selected record heading. It does not copy record DOM, create another data listener or add a save handler. Search persists when returning. The new directory DOM and search are cleared on sign-out.

This is an incremental directory-to-record connection, not completion of the standalone V3 student detail presentation. Existing score/history rendering limitations remain. No analytics semantics, queries, permissions, schema or production configuration changed.

## Newly confirmed implementation conflict

The existing scanner `getTeacherAssignedSections`, `sectionQueries`, initial roster load and `listenUsers` still scope teachers' loaded data by assignment. This conflicts with the approved school-wide access requirement even if rules allow it. The new selector says All loaded classes rather than claiming school-wide coverage. Resolve query scope in a separate tested change covering cross-class reads and account permissions; do not infer that broader backend permission means the UI loads every class.

## Checks

- PASS: 13 unit/queue checks; scanner syntax and diff whitespace checks.
- PASS on initial emulator integration run: 30-row fixture, ID search, empty results, class filter, keyboard review action, correct selected record, focus transfer, preserved search and single retained picker control; six tabs captured in both themes.
- Final run also checks directory clearing on sign-out. See STATUS.md for final outcome.
- NOT RUN: school-wide directory coverage (known loader conflict), full record-history/action parity, mobile redesign, physical equipment or production validation.

Current captures: `test-results/integration/light-students.png` and `dark-students.png`. Original prototype remains unchanged.
