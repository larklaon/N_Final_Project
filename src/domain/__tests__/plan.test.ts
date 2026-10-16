import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";
import { DAY, localDate } from "../review";
import { needsPlan, parsePlan, planDay, planDates, type Plan } from "../plan";
import { planConcept } from "../selection";

const now = new Date(2026, 9, 16, 9).getTime();
function setup() {
  let id = 0;
  const repo = new LearningRepository(database(), () => `p-${++id}`, () => now);
  repo.updateSettings({ onboarded: true, dailyGoal: 3 });
  return repo;
}
const reply = (days: unknown[]) => JSON.stringify({ summary: "키부터 다져요", days });

test("the plan uses our own calendar, keeps known focus only, and clamps counts", () => {
  const s = setup().snapshot();
  const plan = parsePlan(
    "```json\n" +
      reply([
        { date: "1999-01-01", focus: ["데이터베이스", "nope", "db-primary"], newCount: 2, reviewCount: 1, note: "오늘은 키부터 볼게요" },
        { focus: [], newCount: 0, reviewCount: 0 },
        { focus: "x", newCount: 99, reviewCount: -3, note: 5 },
      ]) +
      "\n```",
    s,
    now,
  );
  expect(plan.days.map((d) => d.date)).toEqual(planDates(now).slice(0, 3));
  expect(plan.days[0]).toMatchObject({ focus: ["데이터베이스", "db-primary"], newCount: 2, reviewCount: 1 });
  expect(plan.days[1]).toMatchObject({ focus: [], newCount: 3, reviewCount: 0 });
  expect(plan.days[2]).toMatchObject({ focus: [], newCount: 20, reviewCount: 0, note: "" });
  expect(plan.summary).toBe("키부터 다져요");
  expect(() => parsePlan("죄송해요", s, now)).toThrow();
  expect(() => parsePlan('{"days":[]}', s, now)).toThrow();
});

test("a new plan is needed with no plan, one day left, or the plan used up by extra study", () => {
  const repo = setup();
  const plan = (n: number, count = 3): Plan => ({
    createdAt: now - 1000,
    summary: "",
    days: planDates(now).slice(0, n).map((date) => ({ date, focus: [], newCount: count, reviewCount: 0, note: "" })),
  });
  expect(needsPlan(null, repo.snapshot(), now)).toBe(true);
  expect(needsPlan(plan(1), repo.snapshot(), now)).toBe(true);
  expect(needsPlan(plan(7), repo.snapshot(), now)).toBe(false);
  const tiny = plan(7, 0);
  tiny.days.forEach((d) => (d.newCount = d.reviewCount = 0));
  tiny.days[0].newCount = 1;
  const s = repo.openSession("net-http");
  repo.submit(s.id, "a");
  expect(needsPlan(tiny, repo.snapshot(), now)).toBe(true);
});

test("with a plan, today's focus decides; without one, the pick is random but stable", () => {
  const repo = setup();
  const s = repo.snapshot();
  const plan: Plan = {
    createdAt: now,
    summary: "",
    days: [{ date: localDate(now), focus: ["운영체제"], newCount: 3, reviewCount: 0, note: "오늘은 운영체제" }],
  };
  expect(planDay(plan, now)?.note).toBe("오늘은 운영체제");
  expect(planConcept(s, now, plan, false)?.area).toBe("운영체제");
  const a = planConcept(s, now, null, false);
  expect(planConcept(s, now, null, false)).toBe(a);
  expect(planDay(plan, now + DAY)).toBeNull();
});
