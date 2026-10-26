import { describe, expect, it } from "vitest";
import {
  canEdit,
  dayItems,
  deliver,
  dueReminders,
  emptyCalendar,
  inQuietHours,
  isSchoolDay,
  mergeSchool,
  monthGrid,
  nowAndNext,
  parseIcs,
  periodClashes,
  removeEvent,
  removeSample,
  sampleTerm,
  toIcs,
  upsertEvent,
  validate,
  workload,
  type CalEvent,
  type CalendarData,
  type Period,
} from "./calendar";

const base = (): CalendarData => ({
  ...emptyCalendar(),
  year: { name: "2026–27", start: "2026-06-01", end: "2027-03-31", terms: [], saturdays: "off", specialWorkingDays: [] },
  periods: [
    { id: "p1", day: 1, start: "08:30", end: "09:15", subject: "Mathematics", kind: "class" },
    { id: "p2", day: 1, start: "09:15", end: "10:00", subject: "English", kind: "class" },
    { id: "b1", day: 1, start: "10:00", end: "10:15", subject: "Morning break", kind: "break" },
  ],
});

const examOn = (date: string, subject = "Mathematics", extra: Partial<CalEvent> = {}): CalEvent => ({
  id: `ex-${subject}-${date}`,
  title: `${subject} exam`,
  category: "exam",
  date,
  start: "09:30",
  end: "12:30",
  subject,
  source: "me",
  exam: { kind: "half-yearly", syllabus: ["Ch 1"], status: "scheduled" },
  ...extra,
});

describe("school days and the timetable", () => {
  it("shows Monday's classes on a Monday, in time order", () => {
    const items = dayItems(base(), "2026-11-16");
    expect(items.map((i) => i.title)).toEqual(["Mathematics", "English", "Morning break"]);
    expect(items[2].isBreak).toBe(true);
  });

  it("drops classes on holidays and Sundays, but keeps the holiday itself", () => {
    const cal = base();
    cal.events.push({ id: "h", title: "Deepavali", category: "holiday", date: "2026-11-09", endDate: "2026-11-10", source: "school" });
    expect(isSchoolDay(cal, "2026-11-09")).toBe(false);
    expect(dayItems(cal, "2026-11-09").map((i) => i.title)).toEqual(["Deepavali"]);
    expect(dayItems(cal, "2026-11-10").map((i) => i.title)).toEqual(["Deepavali"]);
    expect(isSchoolDay(cal, "2026-11-15")).toBe(false); // Sunday
  });

  it("follows the alternate-Saturday rule and special working days", () => {
    const cal = base();
    cal.year!.saturdays = "alternate";
    expect(isSchoolDay(cal, "2026-11-07")).toBe(true); // 1st Saturday
    expect(isSchoolDay(cal, "2026-11-14")).toBe(false); // 2nd Saturday
    cal.year!.specialWorkingDays = ["2026-11-14"];
    expect(isSchoolDay(cal, "2026-11-14")).toBe(true);
    // A special working Saturday with no Saturday periods runs Monday's timetable.
    expect(dayItems(cal, "2026-11-14")[0].title).toBe("Mathematics");
  });

  it("closes school outside the terms and the academic year", () => {
    const cal = base();
    cal.year!.terms = [{ name: "Term 2", start: "2026-10-01", end: "2026-12-20" }];
    expect(isSchoolDay(cal, "2026-12-28")).toBe(false);
    expect(isSchoolDay(cal, "2027-05-03")).toBe(false);
  });

  it("marks one cancelled class without touching other weeks", () => {
    const cal = { ...base(), cancelled: ["p1@2026-11-16"] };
    expect(dayItems(cal, "2026-11-16")[0].cancelledClass).toBe(true);
    expect(dayItems(cal, "2026-11-23")[0].cancelledClass).toBe(false);
  });

  it("finds what is on now and next", () => {
    const items = dayItems(base(), "2026-11-16");
    const { current, next } = nowAndNext(items, 8 * 60 + 40);
    expect(current?.title).toBe("Mathematics");
    expect(next?.title).toBe("English");
  });

  it("finds overlapping periods", () => {
    const clash: Period = { id: "p3", day: 1, start: "09:00", end: "09:30", subject: "Art", kind: "class" };
    expect(periodClashes([...base().periods, clash]).length).toBe(2);
  });

  it("builds a Monday-first month grid of whole weeks", () => {
    const grid = monthGrid("2026-11-16");
    expect(grid[0]).toBe("2026-10-26");
    expect(grid.length % 7).toBe(0);
    expect(grid).toContain("2026-11-30");
  });
});

describe("checks", () => {
  it("blocks impossible times and marks", () => {
    const bad = examOn("2027-01-10", "Mathematics", { end: "09:00", exam: { kind: "unit", syllabus: [], status: "scheduled", totalMarks: 25, passMarks: 30 } });
    const errors = validate(bad, base()).filter((i) => i.level === "error").map((i) => i.message);
    expect(errors).toContain("The end time must be after the start time.");
    expect(errors).toContain("Pass marks can't be more than total marks.");
  });

  it("warns about two exams at the same time", () => {
    const cal = base();
    cal.events.push(examOn("2099-01-10", "Science"));
    const issues = validate(examOn("2099-01-10", "Mathematics"), cal);
    expect(issues.some((i) => i.message.includes("overlaps with Science exam"))).toBe(true);
  });

  it("flags bunched exams and piled-up homework", () => {
    const cal = base();
    cal.events.push(examOn("2026-11-16", "Mathematics"), examOn("2026-11-17", "Science"), examOn("2026-11-18", "English"));
    for (const n of [1, 2, 3]) cal.events.push({ id: `hw${n}`, title: `HW ${n}`, category: "homework", date: "2026-11-12", source: "school" });
    const msgs = workload(cal, "2026-11-10").map((i) => i.message);
    expect(msgs.some((m) => m.startsWith("Three exams within three days"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("No gap between Mathematics and Science"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("3 homework deadlines on 2026-11-12"))).toBe(true);
  });
});

describe("who can change what", () => {
  it("keeps school items read-only", () => {
    const cal = base();
    const school = examOn("2026-12-01", "Science", { source: "school" });
    cal.events.push(school);
    expect(canEdit(school)).toBe(false);
    expect(() => upsertEvent(cal, { ...school, date: "2026-12-02" })).toThrow();
    expect(() => removeEvent(cal, school.id)).toThrow();
  });

  it("marks a moved exam as rescheduled and remembers the old date", () => {
    const mine = examOn("2026-12-01");
    const cal = upsertEvent(base(), mine);
    const moved = upsertEvent(cal, { ...mine, date: "2026-12-03" }).events[0];
    expect(moved.exam?.status).toBe("rescheduled");
    expect(moved.exam?.previousDate).toBe("2026-12-01");
  });
});

describe("reminders", () => {
  it("reminds about an exam at the nearest step and never twice", () => {
    const cal = base();
    cal.events.push(examOn("2026-11-19"));
    const now = new Date(2026, 10, 16, 18, 0);
    expect(dueReminders(cal, now).map((r) => r.title)).toEqual(["Mathematics exam in 3 days"]);
    const first = deliver(cal, "in-app", now);
    expect(first.fresh.length).toBe(1);
    expect(deliver(first.cal, "in-app", now).fresh.length).toBe(0);
    // A new step (1 day before) is a new reminder.
    expect(deliver(first.cal, "in-app", new Date(2026, 10, 18, 18, 0)).fresh[0].title).toBe("Mathematics exam is tomorrow");
  });

  it("reminds about homework due within the window, and announces moved exams", () => {
    const cal = base();
    cal.events.push({ id: "hw", title: "Maths worksheet", category: "homework", date: "2026-11-17", start: "08:30", source: "school" });
    cal.events.push(examOn("2026-11-30", "Science", { exam: { kind: "unit", syllabus: [], status: "rescheduled", previousDate: "2026-11-25" } }));
    const titles = dueReminders(cal, new Date(2026, 10, 16, 18, 0)).map((r) => r.title);
    expect(titles).toContain("Maths worksheet is due tomorrow");
    expect(titles).toContain("Science exam has moved");
  });

  it("knows quiet hours that cross midnight", () => {
    const s = { ...emptyCalendar().reminders, quietStart: "21:30", quietEnd: "07:00" };
    expect(inQuietHours(s, new Date(2026, 10, 16, 23, 0))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 10, 16, 6, 0))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 10, 16, 12, 0))).toBe(false);
  });
});

describe("calendar files", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:exam-1",
    "SUMMARY:Half-yearly exam: Science",
    "DTSTART:20261201T093000",
    "DTEND:20261201T123000",
    "LOCATION:Exam Hall A",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:hol-1",
    "SUMMARY:Pongal holidays",
    "DTSTART;VALUE=DATE:20270114",
    "DTEND;VALUE=DATE:20270117",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ptm-1",
    "SUMMARY:Parent-teacher",
    "  meeting", // folded: the first space is the fold marker
    "DTSTART:20261205T043000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads a school .ics file as read-only school items", () => {
    const { events, skipped } = parseIcs(ics);
    expect(skipped).toBe(0);
    const [exam, hol, ptm] = events;
    expect(exam).toMatchObject({ category: "exam", date: "2026-12-01", start: "09:30", end: "12:30", room: "Exam Hall A", source: "school" });
    expect(hol).toMatchObject({ category: "holiday", date: "2027-01-14", endDate: "2027-01-16" }); // DTEND is exclusive
    expect(ptm.title).toBe("Parent-teacher meeting"); // folded line joined
    expect(ptm.category).toBe("meeting");
  });

  it("re-importing an updated file moves the exam and keeps the student's progress", () => {
    const first = mergeSchool(base(), parseIcs(ics).events).cal;
    const withProgress = { ...first, events: first.events.map((e) => (e.exam ? { ...e, exam: { ...e.exam, syllabus: ["Light"], done: ["Light"] } } : e)) };
    const { cal, updated } = mergeSchool(withProgress, parseIcs(ics.replace(/20261201/g, "20261203")).events);
    const exam = cal.events.find((e) => e.category === "exam")!;
    expect(updated).toBe(3);
    expect(exam.date).toBe("2026-12-03");
    expect(exam.exam).toMatchObject({ status: "rescheduled", previousDate: "2026-12-01", done: ["Light"], syllabus: ["Light"] });
  });

  it("exports classes as weekly repeats that skip holidays", () => {
    const cal = base();
    cal.events.push({ id: "h", title: "Deepavali", category: "holiday", date: "2026-11-09", source: "school" });
    const out = toIcs(cal);
    expect(out).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270331T235959");
    expect(out).toContain("20261109T083000");
    expect(out).toContain("DTSTART;VALUE=DATE:20261109");
    expect(out).not.toContain("Morning break");
  });
});

describe("sample term", () => {
  it("is labelled and comes out cleanly", () => {
    const cal = sampleTerm(9, "2026-11-16");
    expect(cal.events.every((e) => e.sample) && cal.periods.every((p) => p.sample)).toBe(true);
    expect(cal.events.some((e) => e.category === "exam")).toBe(true);
    const mine = upsertEvent(cal, { id: "mine", title: "Tuition", category: "event", date: "2026-11-18", source: "me" });
    const left = removeSample(mine);
    expect(left.events.map((e) => e.id)).toEqual(["mine"]);
    expect(left.periods).toEqual([]);
    expect(left.year).toBeNull();
  });
});
