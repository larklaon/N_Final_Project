import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";
import { advanceGap, buildDeck, withinWindow } from "../gap";
import { DAY } from "../review";

const now = Date.UTC(2026, 9, 15, 12);
function setup() {
  let id = 0;
  return new LearningRepository(database(), () => `t-${++id}`, () => now);
}

test("gap spacing grows 1·3·7 days on correct answers and resets to tomorrow on a miss", () => {
  let g = advanceGap(undefined, true, now, "ox");
  expect([g.stage, g.dueAt - now]).toEqual([1, DAY]);
  g = advanceGap(g, true, now, "choice");
  expect([g.stage, g.dueAt - now]).toEqual([2, 3 * DAY]);
  g = advanceGap(g, true, now, "ox");
  g = advanceGap(g, true, now, "ox");
  expect([g.stage, g.dueAt - now]).toEqual([3, 7 * DAY]);
  g = advanceGap(g, false, now, "ox");
  expect([g.stage, g.dueAt - now, g.seen, g.correct]).toEqual([0, DAY, 5, 4]);
});

test("a fresh deck starts with O/X cards in curriculum order and never uses app questions", () => {
  const repo = setup();
  const deck = buildDeck(repo.snapshot(), repo.questions(), now, 5);
  expect(deck.map((c) => c.conceptId)).toEqual(
    repo.snapshot().concepts.slice(0, 5).map((c) => c.id),
  );
  expect(deck.every((c) => c.type === "ox")).toBe(true);
  expect(deck.every((c) => !c.questionId.endsWith("-deep"))).toBe(true);
  expect(new Set(deck.map((c) => c.cardId)).size).toBe(5);
});

test("due pieces come first and alternate card type; future pieces fill the tail", () => {
  const repo = setup();
  const learner = repo.activeLearner;
  const ox = repo.quiz("ds-stack-ox");
  repo.ingestGapEvents([
    { id: "e1", learnerId: learner, questionId: "ds-stack-ox", selectedOptionId: "zz", answeredAt: now - 2 * DAY },
    { id: "e2", learnerId: learner, questionId: "ds-stack-ox", selectedOptionId: ox.correctOptionId, answeredAt: now - 2 * DAY + 1 },
    { id: "e3", learnerId: learner, questionId: "net-http-ox", selectedOptionId: repo.quiz("net-http-ox").correctOptionId, answeredAt: now },
  ]);
  const s = repo.snapshot();
  const deck = buildDeck(s, repo.questions(), now, 60);
  expect(deck[0]).toMatchObject({ conceptId: "ds-stack", type: "choice" });
  expect(deck[deck.length - 1].conceptId).toBe("net-http");
  expect(deck).toHaveLength(60);
});

test("feedback stays short enough for a notification line", () => {
  const repo = setup();
  for (const card of buildDeck(repo.snapshot(), repo.questions(), now, 60))
    expect(card.feedback.length).toBeLessThanOrEqual(120);
});

test("card window is half-open", () => {
  const at = (h: number, m: number) => new Date(2026, 9, 15, h, m);
  expect(withinWindow(at(7, 0), "07:00", "22:00")).toBe(true);
  expect(withinWindow(at(21, 59), "07:00", "22:00")).toBe(true);
  expect(withinWindow(at(22, 0), "07:00", "22:00")).toBe(false);
  expect(withinWindow(at(6, 59), "07:00", "22:00")).toBe(false);
});
