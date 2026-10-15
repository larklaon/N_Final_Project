import { planReminders } from "../scheduler";
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
