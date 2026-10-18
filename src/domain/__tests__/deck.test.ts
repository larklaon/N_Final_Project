import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";
import { buildDeck, type DeckExtras } from "../gap";
import type { Quiz } from "../types";
import { DAY } from "../review";

const now = Date.UTC(2026, 9, 18, 3);
function setup() {
  let id = 0;
  return new LearningRepository(database(), () => `d-${++id}`, () => now);
}
const aiFor = (conceptId: string): Quiz => ({
  id: `ai:${conceptId}`,
  conceptId,
  type: "ox",
  layer: "gap",
  prompt: `${conceptId} 문장`,
  short: `${conceptId} 문장`,
  options: [{ id: "o", text: "맞아요 (O)" }, { id: "x", text: "아니에요 (X)" }],
  correctOptionId: "o",
  explanation: "설명",
  sourceRefs: [],
  contentVersion: 1,
});

test.each([1, 4, 5, 10, 30])("a deck of %i holds at most 20%% AI cards, none adjacent, none below 5", (n) => {
  const repo = setup();
  const s = repo.snapshot();
  const generated = s.concepts.map((c) => aiFor(c.id));
  const extras: DeckExtras = {
    generated,
    generatedExpiresAt: Object.fromEntries(generated.map((q) => [q.id, now + DAY])),
    focus: [],
    memoryConcepts: [],
  };
  const deck = buildDeck(s, repo.questions(), now, n, extras);
  const ai = deck.filter((c) => c.origin === "ai");
  expect(deck).toHaveLength(n);
  expect(ai.length).toBeLessThanOrEqual(n < 5 ? 0 : Math.floor(n / 5));
  if (n >= 5) expect(ai.length).toBeGreaterThan(0);
  deck.forEach((c, i) => {
    if (c.origin === "ai") expect(deck[i + 1]?.origin).not.toBe("ai");
  });
  // AI cards are the same O/X everywhere: no widget variants to swap them out.
  for (const c of ai) expect(c.variants).toEqual({});
  // The deck still covers the same pieces in the same order.
  expect(deck.map((c) => c.conceptId)).toEqual(buildDeck(s, repo.questions(), now, n).map((c) => c.conceptId));
});

test("expired AI cards never enter the deck", () => {
  const repo = setup();
  const s = repo.snapshot();
  const q = aiFor(s.concepts[0].id);
  const deck = buildDeck(s, repo.questions(), now, 10, { generated: [q], generatedExpiresAt: { [q.id]: now }, focus: [], memoryConcepts: [] });
  expect(deck.some((c) => c.origin === "ai")).toBe(false);
});

test("plan focus reorders inside a bucket but never pulls a later piece ahead of a due one", () => {
  const repo = setup();
  const learner = repo.activeLearner;
  // ds-stack becomes due (answered yesterday wrong), db-foreign is answered right (not due yet).
  repo.ingestGapEvents([
    { id: "e1", learnerId: learner, questionId: "ds-stack-ox", selectedOptionId: "zz", answeredAt: now - 2 * DAY },
    { id: "e2", learnerId: learner, questionId: "ds-stack-ox", selectedOptionId: repo.quiz("ds-stack-ox").correctOptionId === "o" ? "x" : "o", answeredAt: now - 2 * DAY },
    { id: "e3", learnerId: learner, questionId: "db-foreign-ox", selectedOptionId: repo.quiz("db-foreign-ox").correctOptionId, answeredAt: now },
  ]);
  const s = repo.snapshot();
  const plain = buildDeck(s, repo.questions(), now, 60).map((c) => c.conceptId);
  const focused = buildDeck(s, repo.questions(), now, 60, { generated: [], generatedExpiresAt: {}, focus: ["db-foreign", "net-dns"], memoryConcepts: [] }).map((c) => c.conceptId);
  expect(focused[0]).toBe("ds-stack"); // Due stays first.
  expect(focused.indexOf("db-foreign")).toBe(plain.indexOf("db-foreign")); // Not due: stays in "later".
  expect(focused.indexOf("net-dns")).toBeLessThan(plain.indexOf("net-dns")); // Unseen bucket: moves up.
});
