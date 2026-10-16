import { DAY } from "../review";
import {
  applyAnswer,
  band,
  freshKnowledge,
  isComplete,
  knowledgeWeights,
  visible,
} from "../resolution";
import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";

const t0 = Date.UTC(2026, 9, 1, 12);

test("correct raises and wrong lowers by the same amount; values stay within 0–100", () => {
  let k = applyAnswer(freshKnowledge, true, 20, t0, true);
  expect(k.r).toBe(20);
  k = applyAnswer(k, false, 14, t0, true);
  expect(k.r).toBe(6);
  k = applyAnswer(k, false, 14, t0, true);
  expect(k.r).toBe(0);
});

test("resolution halves over one half-life but never drops below 40% of the last value", () => {
  const k = { r: 60, h: 3, lastAt: t0, lastCorrectAt: t0 };
  expect(visible(k, t0 + 3 * DAY)).toBeCloseTo(30);
  expect(visible(k, t0 + 30 * DAY)).toBeCloseTo(24);
});

test("half-life doubles only for answers spaced a day apart; cramming does not count; wrong halves", () => {
  let k = applyAnswer(freshKnowledge, true, 20, t0, true);
  expect(k.h).toBe(3);
  k = applyAnswer(k, true, 20, t0 + 3_600_000, true);
  expect(k.h).toBe(3);
  k = applyAnswer(k, true, 20, t0 + DAY + 3_600_000, true);
  expect(k.h).toBe(6);
  k = applyAnswer(k, false, 20, t0 + 2 * DAY, true);
  expect(k.h).toBe(3);
  // Side knowledge (weight < 0.5) never moves half-life.
  expect(applyAnswer(k, false, 6, t0 + 3 * DAY, false).h).toBe(3);
});

test("complete needs both resolution 95+ and a 30-day half-life", () => {
  expect(isComplete({ r: 100, h: 24, lastAt: t0, lastCorrectAt: t0 }, t0)).toBe(false);
  expect(isComplete({ r: 96, h: 48, lastAt: t0, lastCorrectAt: t0 }, t0)).toBe(true);
  expect(band({ r: 96, h: 48, lastAt: t0, lastCorrectAt: t0 }, t0)).toBe(5);
});

test("the very first correct answer already shows a color step", () => {
  expect(band(undefined, t0)).toBe(0);
  expect(band(applyAnswer(freshKnowledge, true, 8, t0, true), t0)).toBe(1);
  expect(band({ r: 30, h: 3, lastAt: t0, lastCorrectAt: t0 }, t0)).toBe(2);
  expect(band({ r: 60, h: 3, lastAt: t0, lastCorrectAt: t0 }, t0)).toBe(3);
  expect(band({ r: 80, h: 3, lastAt: t0, lastCorrectAt: t0 }, t0)).toBe(4);
});

test("app questions spread weight to the knowledge they build on", () => {
  expect(knowledgeWeights({ conceptId: "a", layer: "gap" })).toEqual([{ id: "a", weight: 1 }]);
  expect(knowledgeWeights({ conceptId: "a", layer: "app", builtOn: ["a"] })).toEqual([{ id: "a", weight: 1 }]);
  expect(knowledgeWeights({ conceptId: "a", layer: "app", builtOn: ["a", "b", "c"] })).toEqual([
    { id: "a", weight: 0.7 },
    { id: "b", weight: 0.15 },
    { id: "c", weight: 0.15 },
  ]);
});

test("answers in the app and on gap surfaces both move knowledge in the repository", () => {
  let now = t0;
  let id = 0;
  const repo = new LearningRepository(database(), () => `k-${++id}`, () => now);
  const s = repo.openSession("db-foreign");
  repo.submit(s.id, "a"); // deep question: 0.7 own, 0.3 on 기본키
  let k = repo.snapshot().knowledge;
  expect(k["db-foreign"].r).toBe(14);
  expect(k["db-primary"].r).toBe(6);
  now += DAY;
  repo.ingestGapEvents([
    { id: "g1", learnerId: repo.activeLearner, questionId: "db-primary-ox", selectedOptionId: "x", answeredAt: now },
  ]);
  k = repo.snapshot().knowledge;
  // Wrong on the gap card: faded 6 → minus 8, floored at 0.
  expect(k["db-primary"].r).toBe(0);
});
