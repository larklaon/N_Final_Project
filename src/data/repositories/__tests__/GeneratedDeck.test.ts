import { database } from "./database";
import { LearningRepository, type Db } from "../LearningRepository";
import { parseMemoryCandidates } from "../../../domain/personalization";
import { buildDeck } from "../../../domain/gap";
import type { ApprovedCandidate } from "../PersonalizationStore";

const DAY = 86_400_000;
let db: Db;
let repo: LearningRepository;
let now: number;
let id: number;
beforeEach(() => {
  db = database();
  id = 0;
  now = Date.UTC(2026, 9, 18, 3);
  repo = new LearningRepository(db, () => `t-${++id}`, () => now);
  repo.updateSettings({ personalizationEnabled: true, personalizationConsentAt: now, personalizationConsentVersion: "v4-1" });
});
const owner = () => ({ learnerId: repo.activeLearner, subjectId: "info-basic", scope: repo.learningScope, generation: repo.personal.generation(repo.activeLearner) });
const wrongGap = (eventId: string, questionId: string) => {
  const q = repo.quiz(questionId);
  const wrong = q.options.find((o) => o.id !== q.correctOptionId)!.id;
  repo.ingestGapEvents([{ id: eventId, learnerId: repo.activeLearner, questionId, selectedOptionId: wrong, answeredAt: now }]);
};
/** Two wrong answers on different questions make an active memory, then one approved AI card. */
function activeCard() {
  const memo = JSON.stringify({
    candidates: [{ conceptId: "ds-queue", skillKey: "stack-queue-order", summary: "스택과 큐의 꺼내는 순서를 혼동했을 가능성", evidenceRefs: [] as string[], kind: "wrong-choice" }],
  });
  let memoryId = "";
  for (const [ev, q] of [["g1", "ds-queue-ox"], ["g2", "ds-stack-ox"]]) {
    wrongGap(ev, q);
    const input = repo.extractionInput();
    memoryId = repo.personal.applyCandidates(owner(), input, parseMemoryCandidates(memo.replace("[]", `["gap:${ev}"]`), input))![0];
  }
  expect(repo.personal.memory(repo.activeLearner, memoryId)!.status).toBe("active");
  const c: ApprovedCandidate = {
    kind: "gap",
    conceptId: "ds-queue",
    memoryId,
    skillKey: "stack-queue-order",
    factIds: ["f-queue-fifo"],
    prompt: "큐는 먼저 넣은 것을 먼저 꺼낸다.",
    correctOptionId: "o",
    explanation: "큐는 먼저 넣은 항목을 먼저 꺼내요.",
    model: "test-model",
    review: { verdict: "supported" },
  };
  const row = repo.personal.saveApproved(owner(), c)!;
  now += DAY; // The wrong answers make ds-queue due again; its slot is where the AI card goes.
  return row;
}
const deck = () => buildDeck(repo.snapshot(), repo.questions(), now, 30, repo.deckExtras());

test("an approved card of an open memory enters the deck only while personalization is on", () => {
  const row = activeCard();
  expect(deck().filter((c) => c.origin === "ai").map((c) => c.questionId)).toEqual([row.quiz.id]);
  repo.updateSettings({ personalizationEnabled: false });
  expect(deck().some((c) => c.origin === "ai")).toBe(false);
});

test("an offline answer to an AI card is collected for its owner and counts toward the piece", () => {
  const row = activeCard();
  const learner = repo.activeLearner;
  const progress = () => db.getFirstSync<{ data: string }>("SELECT data FROM gap_progress WHERE learnerId=? AND conceptId='ds-queue'", learner)!.data;
  const before = progress();
  const handled = repo.ingestGapEvents([{ id: "ai-1", learnerId: learner, questionId: row.quiz.id, selectedOptionId: "o", answeredAt: now + 1000 }]);
  expect(handled).toEqual(["ai-1"]);
  const last = repo.lastGapAnswer("ds-queue")!;
  expect([last.quiz.id, last.correct, last.selectedOptionId]).toEqual([row.quiz.id, true, "o"]);
  expect(progress()).not.toEqual(before);
  // Replaying after a crash before ack adds nothing.
  repo.ingestGapEvents([{ id: "ai-1", learnerId: learner, questionId: row.quiz.id, selectedOptionId: "x", answeredAt: now + 2000 }]);
  expect(repo.lastGapAnswer("ds-queue")!.correct).toBe(true);
  expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM gap_events WHERE questionId=?", row.quiz.id)!.n).toBe(1);
});

test("another learner's answer with the same AI id is acknowledged but never recorded", () => {
  const row = activeCard();
  repo.selectProfile("first");
  repo.selectProfile("second");
  const other = repo.activeLearner;
  expect(repo.ingestGapEvents([{ id: "x-1", learnerId: other, questionId: row.quiz.id, selectedOptionId: "o", answeredAt: now }])).toEqual(["x-1"]);
  expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM gap_events WHERE id='x-1'")!.n).toBe(0);
  expect(() => repo.quiz(row.quiz.id)).toThrow();
});

test("hiding or expiring takes the card out of the next deck but keeps its history readable", () => {
  const row = activeCard();
  const learner = repo.activeLearner;
  repo.ingestGapEvents([{ id: "ai-1", learnerId: learner, questionId: row.quiz.id, selectedOptionId: "x", answeredAt: now + 1 }]);
  expect(repo.personal.hide(learner, row.id)).toBe(true);
  expect(deck().some((c) => c.origin === "ai")).toBe(false);
  expect(repo.lastGapAnswer("ds-queue")!.quiz.id).toBe(row.quiz.id);
  expect(repo.quiz(row.quiz.id).prompt).toBe(row.quiz.prompt);
  // An answer given on the lock screen just before the hide still lands.
  repo.ingestGapEvents([{ id: "ai-2", learnerId: learner, questionId: row.quiz.id, selectedOptionId: "o", answeredAt: now + 2 }]);
  expect(repo.lastGapAnswer("ds-queue")!.correct).toBe(true);

  const second = repo.personal.saveApproved(owner(), {
    kind: "gap", conceptId: "ds-queue", memoryId: row.memoryId!, skillKey: "stack-queue-order", factIds: ["f-queue-fifo", "f-stack-lifo"],
    prompt: "큐는 나중에 넣은 것을 먼저 꺼낸다.", correctOptionId: "x", explanation: "나중 것을 먼저 꺼내는 건 스택이에요.", model: "m", review: { verdict: "supported" },
  })!;
  // ds-queue was just answered right, so it is not in today's deck; the card is still offered.
  expect(repo.deckExtras().generated.map((q) => q.id)).toEqual([second.quiz.id]);
  now += 14 * DAY; // 14 days after approval.
  expect(repo.deckExtras().generated).toEqual([]);
  expect(deck().some((c) => c.origin === "ai")).toBe(false);
  repo.personal.expireOld();
  expect(repo.quiz(second.quiz.id).prompt).toBe(second.quiz.prompt);
});
