# Academic calendar and study planner

What was built from the AI Academic Calendar master spec, how it works, and what is still missing. The student side comes first (Phase 1 plus the AI study planner from Phase 2). Enterprise is unchanged.

## How it fits the app today

The app has no database, no sign-in and no school accounts yet: each student's notes, progress and profile live in their own browser. The calendar follows the same model, so it is **a student's own school calendar**, not an institution-wide one.

| Piece | Where |
| --- | --- |
| Data model, school-day rules, recurrence, checks, reminders, ICS import/export, sample term | `apps/web/src/lib/calendar.ts` (tests in `calendar.test.ts`) |
| English/Tamil labels and date formats | `apps/web/src/lib/calendarText.ts` |
| Study planner client (gathers real inputs, accepts a plan) | `apps/web/src/lib/planner.ts` |
| Calendar page and views | `apps/web/src/pages/student/Calendar.tsx` |
| Drawer, form, setup, planner, reminder toasts | `apps/web/src/components/calendar/` |
| Study planner API (`POST /api/calendar/plan`) | `apps/api/app/calendar.py` (tests in `tests/test_calendar.py`) |

Storage key: `localStorage["sr.calendar"]`. Dates are local `YYYY-MM-DD` and times local `HH:MM`, so classes never shift with timezones; ICS times in UTC are converted to local time on import.

### Who can change what

- **School items** (imported from the school's `.ics` file) are read-only. A student can tick the chapters they've studied on a school exam, but can't move or delete it.
- **My items** (homework, exams, events the student adds) and **planner items** (accepted study sessions) can be edited and deleted.
- Moving an exam marks it *Rescheduled*, keeps the old date and triggers a "has moved" reminder. Re-importing an updated school file does the same.

### AI study planner

1. The page sends the chosen exams (date, subject, chapters and which are ticked), daily minutes for school days and weekends, holidays in range, the student's standard and language, and practice results per subject from the activity log (only subjects with real results).
2. The API's deterministic scheduler builds the plan: a learn session per unticked chapter, an extra practice session only when real results average under 60%, a revision of every chapter, and a timed practice paper on the last study day before each exam. Work is spread across the days (each exam gets its fair share per day) and interleaved between subjects. Session length and daily cap follow the stage: Std 1–3 15 min (max 30/day), Std 4–7 25 min (max 60), Std 8–10 40 min (max 150).
3. It reports what doesn't fit ("Not enough study time…") instead of squeezing, and flags exams that are close together.
4. With a model configured, the model writes only the 2–3 sentence summary, from the plan's facts. If the summary contains any number that isn't in the facts, it is thrown away and the rule-based summary is used.
5. Nothing is added to the calendar until the student presses **Add to my calendar**. Accepting replaces unfinished sessions from the last plan and keeps finished ones.

Without practice results the plan says so and gives every chapter the same time: it never infers weak spots without assessment data.

## Spec coverage

**Done (student side):** day/week/month/agenda/academic-year views; daily timetable with now/next, completed/ongoing/upcoming states, room, teacher and subject icons; colour coding for classes, exams, homework, assignments, holidays, meetings, activities, study and results; exam countdowns; filters by category and subject, search; event detail drawer; exam details (code, type, date and times, reporting time, room, marks, paper type, syllabus, instructions, permitted materials, status, result date); academic year, terms, Saturday rules, special working days, holidays; recurring weekly timetable with holiday, term and one-off cancellation exceptions; validation (times, marks, reporting time) and conflict warnings (overlapping exams, same-day exams, timetable clashes, holidays); workload warnings (three exams in three days, back-to-back exams, three or more deadlines on one day); reminders with configurable timing, quiet hours, delivery log and duplicate prevention; ICS import and private ICS export; English and Tamil labels; responsive layouts down to phone width; keyboard shortcuts, ARIA roles and labels; links from items to the matching notes and Study coach; AI study planner with human approval; student home shows the next calendar exam and today's classes.

**Not done yet, and why:**

| Spec item | Blocked by |
| --- | --- |
| Teacher, parent, principal, exam-controller and college faculty dashboards; role-based permissions; parents seeing only linked children | No sign-in, user accounts or roles. The only roles today are implied by the URL. |
| Institution-level tenant isolation, campuses, sections, batches, multi-institution config | No database and no school/organisation entities. |
| Exam workflow: draft → approval → publication, invigilators, room allocation, double-booking prevention for rooms/invigilators/student groups | Needs staff accounts, rooms and invigilators as shared data, and a server-side store with atomic publication. |
| AI exam timetable generator for staff | Needs real rooms, halls, groups and teacher availability in a database. The deterministic-scheduler pattern used by the study planner is the template for it. |
| Natural-language calendar assistant (Phase 3) | Possible next on the student side over the student's own calendar; staff questions ("which teachers are free on Friday") need institutional data. |
| Teacher announcements, attendance shortcut, submissions, results module, evaluation and moderation | Those modules don't exist yet. |
| Push notifications when the app is closed, email, SMS, WhatsApp | Needs a server, a background job runner and a messaging provider (cost). Today reminders fire only while the app is open. |
| Audit history and versioning, background reminder processing | Needs the server-side store. |
| Live Google Calendar / Outlook sync | Needs OAuth apps; one-way `.ics` import and export work today. |
| Drag-and-drop rescheduling | Left for Phase 2 (forms work today). |
| Dark theme | The app has no dark theme yet; it should be added app-wide, not just here. |
| Repeating events inside imported `.ics` files (RRULE) | Only the first date is imported, and the import message says so. |

## Running the tests

```bash
cd apps/api && pytest            # includes tests/test_calendar.py
cd apps/web && npm test          # calendar logic (vitest)
```
