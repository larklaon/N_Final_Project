import { advanceProgress, DAY, localDate } from "../../../domain/review";
import { planReminders, reminderDestination } from "../scheduler";
import { defaultSettings } from "../../../data/repositories/LearningRepository";
import type { LearningSnapshot } from "../../../domain/types";
const s: LearningSnapshot = {
  learnerId: "a",
  settings: {
    ...defaultSettings,
    notificationsEnabled: true,
    reminderSlots: ["08:30", "12:30", "20:30"],
  },
  concepts: [
    {
      id: "c",
      title: "기본키",
      area: "db",
      order: 1,
      oneLiner: "",
      explanation: "",
      example: "",
      prerequisiteIds: [],
      sourceRefs: [],
      contentVersion: 1,
      reviewStatus: "draft",
    },
  ],
  progress: {},
  attempts: [],
  memoryRevision: 0,
};
const now = new Date(2026, 9, 15, 7, 0).getTime();
test("seven-day reminders are bounded, stable, future-only and profile isolated", () => {
  const a = planReminders(s, now);
  expect(a).toHaveLength(21);
  expect(new Set(a.map((d) => d.id)).size).toBe(21);
  expect(a.every((d) => d.fireAt > now)).toBe(true);
  expect(planReminders(s, now)).toEqual(a);
  expect(planReminders({ ...s, learnerId: "b" }, now)[0].id).not.toBe(a[0].id);
});
test("completed daily goal cancels only remaining reminders today", () => {
  const done = {
    ...s,
    settings: { ...s.settings, dailyGoal: 1 },
    attempts: [
      {
        id: "x",
        conceptId: "c",
        quizId: "q",
        correct: 0,
        isGraded: 1,
        answeredAt: now,
        localDate: "2026-10-15",
      },
    ],
  };
  expect(planReminders(done, now)).toHaveLength(18);
  expect(
    planReminders(
      { ...s, settings: { ...s.settings, notificationsEnabled: false } },
      now,
    ),
  ).toEqual([]);
});
test("quiet time and elapsed slots cannot be scheduled", () => {
  const quiet = {
    ...s,
    settings: { ...s.settings, reminderSlots: ["06:59", "22:00", "23:00"] },
  };
  expect(planReminders(quiet, now)).toEqual([]);
  const later = new Date(2026, 9, 15, 21, 0).getTime();
  expect(planReminders(s, later)).toHaveLength(18);
});

test("future reminders use the eligible concept at their fire time, ignoring today's completed goal", () => {
  const next = { ...s.concepts[0], id: "new", title: "새 개념", order: 2 };
  const done: LearningSnapshot = {
    ...s,
    concepts: [...s.concepts, next],
    settings: { ...s.settings, dailyGoal: 1 },
    progress: {
      c: {
        ...advanceProgress(undefined, true, now, localDate(now), "choice"),
        dueAt: now + 7 * DAY,
      },
    },
    attempts: [
      {
        id: "done",
        conceptId: "c",
        quizId: "q",
        correct: 1,
        isGraded: 1,
        answeredAt: now,
        localDate: localDate(now),
      },
    ],
  };
  const reminders = planReminders(done, now);
  expect(reminders).toHaveLength(18);
  expect(reminders.every((r) => r.conceptId === "new")).toBe(true);
  // A pending future review replaces new content only once it is actually due.
  done.progress.c.dueAt = new Date(2026, 9, 17, 10).getTime();
  const revised = planReminders(done, now);
  expect(revised.find((r) => r.fireAt < done.progress.c.dueAt)?.conceptId).toBe(
    "new",
  );
  expect(
    revised.find((r) => r.fireAt >= done.progress.c.dueAt)?.conceptId,
  ).toBe("c");
});
test("no early practice is scheduled when all known concepts are not due", () => {
  const learned = {
    ...s,
    progress: {
      c: {
        ...advanceProgress(undefined, true, now, localDate(now), "choice"),
        dueAt: now + 8 * DAY,
      },
    },
  };
  expect(planReminders(learned, now)).toEqual([]);
});
test("notification taps re-evaluate stale targets and reject other learners", () => {
  const data = { type: "learning", learnerId: "a", conceptId: "c" };
  const learned = {
    ...s,
    concepts: [...s.concepts, { ...s.concepts[0], id: "new" }],
    progress: {
      c: {
        ...advanceProgress(undefined, true, now, localDate(now), "choice"),
        dueAt: now + 8 * DAY,
      },
    },
  };
  expect(reminderDestination(learned, data, now)).toBe("new");
  expect(
    reminderDestination(learned, { ...data, learnerId: "b" }, now),
  ).toBeUndefined();
  expect(
    reminderDestination({ ...learned, concepts: s.concepts }, data, now),
  ).toBeNull();
  expect(
    reminderDestination(
      {
        ...learned,
        settings: { ...learned.settings, dailyGoal: 1 },
        attempts: [
          {
            id: "done",
            conceptId: "c",
            quizId: "q",
            isGraded: 1,
            correct: 1,
            localDate: localDate(now),
            answeredAt: now,
          },
        ],
      },
      data,
      now,
    ),
  ).toBeNull();
});
