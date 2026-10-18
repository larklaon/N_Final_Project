import { database } from "./database";
import { LearningRepository, type Db } from "../LearningRepository";
import { memoryStatus, parseMemoryCandidates, type EvidenceRecord } from "../../../domain/personalization";

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
});
const owner = () => ({ learnerId: repo.activeLearner, subjectId: "info-basic", scope: repo.learningScope, generation: repo.personal.generation(repo.activeLearner) });
const wrongGap = (eventId: string, questionId: string, at = now) => {
  const q = repo.quiz(questionId);
  const wrong = q.options.find((o) => o.id !== q.correctOptionId)!.id;
  repo.ingestGapEvents([{ id: eventId, learnerId: repo.activeLearner, questionId, selectedOptionId: wrong, answeredAt: at }]);
};
const candidate = (refs: string[], kind: "wrong-choice" | "learner-statement" = "wrong-choice") =>
  JSON.stringify({
    candidates: [{ conceptId: "ds-queue", skillKey: "stack-queue-order", summary: "스택과 큐의 꺼내는 순서를 혼동했을 가능성", evidenceRefs: refs, kind }],
  });

test("the extractor sees new wrong answers and finished learner turns of basis concepts only", () => {
  wrongGap("g1", "ds-queue-ox");
  wrongGap("g2", "net-http-ox"); // Not a V4 basis concept.
  const s = repo.openSession("ds-stack");
  const quiz = repo.quiz(s.quizId);
  repo.submit(s.id, quiz.correctOptionId); // Right answers are not evidence.
  const learner = repo.activeLearner;
  repo.addChatMessage(learner, "ds-queue", "user", "큐도 나중에 넣은 게 먼저 나오나요?");
  repo.addChatMessage(learner, "ds-queue", "assistant", "아니요, 큐는 먼저 넣은 것이 먼저 나와요.");
  repo.addChatMessage(learner, "ds-queue", "user", "스택이랑 똑같은 거 아니에요?"); // No reply yet.
  const input = repo.extractionInput();
  expect(input.evidence.filter((e) => e.kind === "gap").map((e) => e.ref)).toEqual(["gap:g1"]);
  const chats = input.evidence.filter((e) => e.kind === "chat");
  expect(chats.map((e) => e.kind === "chat" && e.text)).toEqual(["큐도 나중에 넣은 게 먼저 나오나요?"]);
  expect(input.evidence).toHaveLength(2);
  expect(input.skills.map((x) => x.conceptId)).toEqual(expect.arrayContaining(["ds-queue", "ds-stack", "db-primary", "db-foreign"]));
});

test("candidates must cite refs that were sent, and questions alone are not evidence", () => {
  wrongGap("g1", "ds-queue-ox");
  const learner = repo.activeLearner;
  repo.addChatMessage(learner, "ds-queue", "user", "왜 이게 정답이야?");
  repo.addChatMessage(learner, "ds-queue", "assistant", "큐는 FIFO라서요.");
  const input = repo.extractionInput();
  const chatRef = input.evidence.find((e) => e.kind === "chat")!.ref;
  expect(parseMemoryCandidates(candidate(["gap:g1"]), input)).toHaveLength(1);
  expect(parseMemoryCandidates(candidate(["gap:made-up"]), input)).toHaveLength(0);
  expect(parseMemoryCandidates(candidate([chatRef], "learner-statement"), input)).toHaveLength(0);
  expect(parseMemoryCandidates(candidate(["gap:g1", chatRef]), input)).toHaveLength(0);
  const unknownSkill = candidate(["gap:g1"]).replace("stack-queue-order", "made-up-skill");
  expect(parseMemoryCandidates(unknownSkill, input)).toHaveLength(0);
  const long = candidate(["gap:g1"]).replace("가능성", "가능성".repeat(60));
  expect(parseMemoryCandidates(long, input)).toHaveLength(0);
  expect(parseMemoryCandidates('{"candidates": []}', input)).toEqual([]);
  expect(() => parseMemoryCandidates("모르겠어요", input)).toThrow();
});

test("one wrong answer is a candidate; a second question makes it active; the same event counts once", () => {
  wrongGap("g1", "ds-queue-ox");
  const first = repo.extractionInput();
  const changed = repo.personal.applyCandidates(owner(), first, parseMemoryCandidates(candidate(["gap:g1"]), first))!;
  expect(repo.personal.memory(repo.activeLearner, changed[0])!.status).toBe("candidate");
  // Replaying the same input does not add evidence again, and it is no longer offered.
  repo.personal.applyCandidates(owner(), first, parseMemoryCandidates(candidate(["gap:g1"]), first));
  expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM confusion_evidence")!.n).toBe(1);
  expect(repo.extractionInput().evidence).toHaveLength(0);
  repo.ingestGapEvents([{ id: "g1", learnerId: repo.activeLearner, questionId: "ds-queue-ox", selectedOptionId: "o", answeredAt: now }]);
  expect(repo.extractionInput().evidence).toHaveLength(0);
  wrongGap("g2", "ds-stack-ox");
  const second = repo.extractionInput();
  repo.personal.applyCandidates(owner(), second, parseMemoryCandidates(candidate(["gap:g2"]), second));
  expect(repo.personal.memory(repo.activeLearner, changed[0])!.status).toBe("active");
});

test("status rules: same question needs another day; checks improve, resolve, and a new wrong reopens", () => {
  const e = (type: EvidenceRecord["evidenceType"], quizId: string, day: number, hour = 0): EvidenceRecord => ({
    sourceKind: "attempt",
    sourceId: `${type}-${quizId}-${day}-${hour}`,
    quizId,
    evidenceType: type,
    occurredAt: now + day * DAY + hour * 3_600_000,
    localDate: `2026-10-${18 + day}`,
  });
  expect(memoryStatus([e("wrong-answer", "q1", 0), e("wrong-answer", "q1", 0, 1)])).toBe("candidate");
  expect(memoryStatus([e("wrong-answer", "q1", 0), e("wrong-answer", "q1", 1)])).toBe("active");
  const active = [e("wrong-answer", "q1", 0), e("wrong-answer", "q2", 0)];
  expect(memoryStatus([...active, e("check-right", "c1", 2)])).toBe("improving");
  // Same day or same question twice is not enough to resolve.
  expect(memoryStatus([...active, e("check-right", "c1", 2), e("check-right", "c2", 2, 5)])).toBe("improving");
  expect(memoryStatus([...active, e("check-right", "c1", 2), e("check-right", "c1", 4)])).toBe("improving");
  expect(memoryStatus([...active, e("check-right", "c1", 2), e("check-right", "c2", 4)])).toBe("resolved");
  expect(memoryStatus([...active, e("check-right", "c1", 2), e("check-wrong", "c2", 3), e("check-right", "c3", 4)])).toBe("improving");
  expect(memoryStatus([...active, e("check-right", "c1", 2), e("check-right", "c2", 4), e("wrong-answer", "q3", 5)])).toBe("active");
});

test("a clear learner statement makes a memory active on its own", () => {
  const learner = repo.activeLearner;
  repo.addChatMessage(learner, "ds-queue", "user", "큐도 스택처럼 나중에 넣은 게 먼저 나오는 거죠?");
  repo.addChatMessage(learner, "ds-queue", "assistant", "아니에요. 큐는 먼저 넣은 것이 먼저 나와요.");
  const input = repo.extractionInput();
  const ref = input.evidence[0].ref;
  const [mid] = repo.personal.applyCandidates(owner(), input, parseMemoryCandidates(candidate([ref], "learner-statement"), input))!;
  expect(repo.personal.memory(learner, mid)!.status).toBe("active");
});

test("an ignored memory never comes back from the same observations, only from new ones", () => {
  wrongGap("g1", "ds-queue-ox");
  wrongGap("g2", "ds-stack-ox");
  const input = repo.extractionInput();
  const [mid] = repo.personal.applyCandidates(owner(), input, parseMemoryCandidates(candidate(["gap:g1", "gap:g2"]), input))!;
  expect(repo.personal.ignoreMemory(repo.activeLearner, mid)).toBe(true);
  expect(repo.personal.memory(repo.activeLearner, mid)!.status).toBe("archived");
  // A replay of the old observations is refused.
  repo.personal.applyCandidates(owner(), input, parseMemoryCandidates(candidate(["gap:g1"]), input));
  expect(repo.personal.memory(repo.activeLearner, mid)!.status).toBe("archived");
  now += DAY;
  wrongGap("g3", "ds-queue-ox");
  const fresh = repo.extractionInput();
  repo.personal.applyCandidates(owner(), fresh, parseMemoryCandidates(candidate(["gap:g3"]), fresh));
  expect(repo.personal.memory(repo.activeLearner, mid)!.status).toBe("candidate");
});

test("memories without news for 30 days are archived, resolved ones are kept as they are", () => {
  wrongGap("g1", "ds-queue-ox");
  const input = repo.extractionInput();
  const [mid] = repo.personal.applyCandidates(owner(), input, parseMemoryCandidates(candidate(["gap:g1"]), input))!;
  now += 29 * DAY;
  repo.personal.archiveStale(repo.activeLearner);
  expect(repo.personal.memory(repo.activeLearner, mid)!.status).toBe("candidate");
  now += 2 * DAY;
  repo.personal.archiveStale(repo.activeLearner);
  expect(repo.personal.memory(repo.activeLearner, mid)!.status).toBe("archived");
});

test("work captured before a reset or another learner cannot save memories", () => {
  wrongGap("g1", "ds-queue-ox");
  const input = repo.extractionInput();
  const stale = owner();
  repo.resetCurrent();
  expect(repo.personal.applyCandidates(stale, input, parseMemoryCandidates(candidate(["gap:g1"]), input))).toBeNull();
  expect(repo.personal.memories(repo.activeLearner)).toHaveLength(0);
});
