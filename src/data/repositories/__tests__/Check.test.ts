import { database } from "./database";
import { LearningRepository, type Db } from "../LearningRepository";
import { parseMemoryCandidates } from "../../../domain/personalization";
import { planInput } from "../../../domain/plan";
import { generationTargets } from "../../../services/ai/personalization";
import type { ApprovedCandidate } from "../PersonalizationStore";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let db: Db;
let repo: LearningRepository;
let now: number;
let id: number;
beforeEach(() => {
  db = database();
  id = 0;
  now = Date.UTC(2026, 9, 18, 3); // 12:00 in Seoul.
  repo = new LearningRepository(db, () => `t-${++id}`, () => now);
  repo.updateSettings({ dailyGoal: 5, personalizationEnabled: true, personalizationConsentAt: now, personalizationConsentVersion: "v4-1" });
});
const owner = () => ({ learnerId: repo.activeLearner, subjectId: "info-basic", scope: repo.learningScope });
const count = (sql: string, ...args: string[]) => db.getFirstSync<{ n: number }>(sql, ...args)!.n;

/** Active memory → approved AI card → a real answer to it at `now`. */
function answeredCard() {
  const memo = (ref: string) =>
    JSON.stringify({ candidates: [{ conceptId: "ds-queue", skillKey: "stack-queue-order", summary: "스택과 큐의 꺼내는 순서를 혼동했을 가능성", evidenceRefs: [ref], kind: "wrong-choice" }] });
  let memoryId = "";
  for (const [ev, qid] of [["g1", "ds-queue-ox"], ["g2", "ds-stack-ox"]]) {
    const q = repo.quiz(qid);
    const wrong = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    repo.ingestGapEvents([{ id: ev, learnerId: repo.activeLearner, questionId: qid, selectedOptionId: wrong, answeredAt: now }]);
    const input = repo.extractionInput();
    memoryId = repo.personal.applyCandidates(owner(), input, parseMemoryCandidates(memo(`gap:${ev}`), input))![0];
  }
  const card = repo.personal.saveApproved(owner(), {
    kind: "gap", conceptId: "ds-queue", memoryId, skillKey: "stack-queue-order", factIds: ["f-queue-fifo"],
    prompt: "큐는 먼저 넣은 것을 먼저 꺼낸다.", correctOptionId: "o", explanation: "큐는 먼저 넣은 항목을 먼저 꺼내요.", model: "m", review: { verdict: "supported" },
  })!;
  repo.ingestGapEvents([{ id: "card-1", learnerId: repo.activeLearner, questionId: card.quiz.id, selectedOptionId: "x", answeredAt: now }]);
  return memoryId;
}
const check = (memoryId: string, n = 1): ApprovedCandidate => ({
  kind: "check", conceptId: "ds-queue", memoryId, skillKey: "stack-queue-order", factIds: ["f-queue-fifo", "f-stack-lifo"],
  prompt: `줄 서기처럼 처리해야 하는 작업 목록 ${n}. 어떤 구조가 맞을까요?`,
  options: [{ id: "a", text: "큐" }, { id: "b", text: "스택" }, { id: "c", text: "트리" }, { id: "d", text: "그래프" }],
  correctOptionId: "a", explanation: "먼저 들어온 작업을 먼저 처리하니 큐예요.", model: "m", review: { verdict: "supported" },
});
const memory = (memoryId: string) => repo.personal.memory(repo.activeLearner, memoryId)!;

test("a check comes a full day and a different date after the card answer, once a day, resumable", () => {
  const memoryId = answeredCard();
  repo.personal.saveApproved(owner(), check(memoryId));
  now += 13 * HOUR; // Next local date, not 24 hours yet.
  expect(repo.checkSession()).toBeNull();
  now += 12 * HOUR;
  const s = repo.checkSession()!;
  expect([s.checkMemoryId, s.quizId.startsWith("ai:"), s.practice]).toEqual([memoryId, true, false]);
  expect(repo.checkSession()!.id).toBe(s.id); // Leaving and coming back resumes it.
  expect(repo.openSession("ds-queue").id).toBe(s.id);
  expect(repo.submit(s.id, "a")).toEqual({ selected: "a", correct: true, graded: true });
  expect(memory(memoryId).status).toBe("improving");
  // Re-tapping or replaying adds nothing; no second check today.
  repo.submit(s.id, "b");
  expect(count("SELECT COUNT(*) n FROM confusion_evidence WHERE evidenceType LIKE 'check%'")).toBe(1);
  repo.personal.saveApproved(owner(), check(memoryId, 2)); // Today's approval quota is used up.
  expect(repo.checkSession()).toBeNull();
  expect(repo.personal.budget(repo.activeLearner).checkServedCount).toBe(1);
});

test("a wrong check keeps the memory open and is not handed to the extractor again", () => {
  const memoryId = answeredCard();
  repo.personal.saveApproved(owner(), check(memoryId));
  now += 25 * HOUR;
  const s = repo.checkSession()!;
  expect(repo.submit(s.id, "b")!.correct).toBe(false);
  expect(memory(memoryId).status).toBe("active");
  expect(count("SELECT COUNT(*) n FROM confusion_evidence WHERE evidenceType='check-wrong'")).toBe(1);
  expect(repo.extractionInput().evidence.filter((e) => e.kind !== "gap" && e.kind !== "chat")).toEqual([]);
});

test("two checks on different dates and questions resolve it; the card leaves the deck", () => {
  const memoryId = answeredCard();
  repo.personal.saveApproved(owner(), check(memoryId));
  now += 25 * HOUR;
  repo.submit(repo.checkSession()!.id, "a");
  // A served check is used: the next pass wants a new one once the timing allows.
  now += 2 * HOUR;
  expect(generationTargets(repo, now).some((t) => t.wantCheck)).toBe(false);
  now += DAY;
  expect(generationTargets(repo, now).find((t) => t.memoryId === memoryId)?.wantCheck).toBe(true);
  repo.personal.saveApproved(owner(), check(memoryId, 2));
  const second = repo.checkSession()!;
  expect(second).not.toBeNull();
  repo.submit(second.id, "a");
  expect(memory(memoryId).status).toBe("resolved");
  expect(repo.deckExtras().generated).toEqual([]);
});

test("no check after the goal, before a started question, or while off", () => {
  const memoryId = answeredCard();
  repo.personal.saveApproved(owner(), check(memoryId));
  now += 25 * HOUR;
  repo.updateSettings({ personalizationEnabled: false });
  expect(repo.checkSession()).toBeNull();
  repo.updateSettings({ personalizationEnabled: true, dailyGoal: 3 });
  for (const c of ["ds-array", "net-http", "prog-variable"]) {
    const other = repo.openSession(c);
    repo.submit(other.id, repo.quiz(other.quizId).correctOptionId);
  }
  expect(repo.checkSession()).toBeNull(); // Goal met: nothing is pushed.
  repo.updateSettings({ dailyGoal: 5 });
  repo.openSession("ds-queue"); // A regular ds-queue question is already open.
  expect(repo.hasOpenSession("ds-queue")).toBe(true);
  expect(repo.checkSession()).toBeNull();
  expect(count("SELECT COUNT(*) n FROM check_assignments")).toBe(0);
});

test("a check left open yesterday takes today's slot instead of a new one", () => {
  const memoryId = answeredCard();
  repo.personal.saveApproved(owner(), check(memoryId));
  now += 25 * HOUR;
  const s = repo.checkSession()!;
  now += DAY;
  repo.personal.saveApproved(owner(), check(memoryId, 2));
  expect(repo.checkSession()!.id).toBe(s.id);
  expect(count("SELECT COUNT(*) n FROM check_assignments")).toBe(2);
  expect(count("SELECT COUNT(DISTINCT sessionId) n FROM check_assignments")).toBe(1);
});

test("the plan sees active memories as summaries only, and a dirty plan refreshes once a day", () => {
  const memoryId = answeredCard();
  repo.addChatMessage(repo.activeLearner, "ds-queue", "user", "큐도 나중에 넣은 게 먼저 나오나요?");
  const learner = repo.activeLearner;
  const confusions = repo.personal.planMemories(learner, "info-basic", now);
  expect(confusions).toEqual([
    { conceptId: "ds-queue", summary: memory(memoryId).summary, status: "active", evidence: ["wrong-answer"], daysSinceLast: 0 },
  ]);
  const input = JSON.stringify(planInput(repo.snapshot(), now, null, confusions));
  expect(input).toContain("confusions");
  expect(input).not.toContain("나중에 넣은 게");
  expect(JSON.stringify(planInput(repo.snapshot(), now, null))).not.toContain("confusions");
  repo.markPlanDirty(learner, "info-basic");
  expect(repo.planRefreshDue()).toBe(true);
  repo.notePlanRefresh();
  expect(repo.planRefreshDue()).toBe(false);
  now += DAY;
  expect(repo.planRefreshDue()).toBe(true);
  repo.updateSettings({ personalizationEnabled: false });
  expect(repo.planRefreshDue()).toBe(false);
});
