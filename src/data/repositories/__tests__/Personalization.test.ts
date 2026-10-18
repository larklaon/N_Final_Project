import { database } from "./database";
import { LearningRepository, type Db } from "../LearningRepository";
import { basis, factById, LIMITS } from "../../../domain/personalization";
import type { ApprovedCandidate } from "../PersonalizationStore";

let db: Db;
let repo: LearningRepository;
let now: number;
let id: number;
beforeEach(() => {
  db = database();
  id = 0;
  now = Date.UTC(2026, 9, 18, 3);
  repo = new LearningRepository(db, () => `t-${++id}`, () => now);
  db.runSync("INSERT INTO confusion_memories(id,learnerId,subjectId,conceptId,skillKey,summary,status,createdAt,lastEvidenceAt) VALUES (?,?,'info-basic','ds-queue','stack-queue-order','순서 혼동','active',?,?)", "storage-memory", repo.activeLearner, now, now);
});
const owner = () => ({
  learnerId: repo.activeLearner,
  subjectId: "info-basic",
  scope: repo.learningScope,
  generation: repo.personal.generation(repo.activeLearner),
});
const gapCandidate = (prompt: string): ApprovedCandidate => ({
  kind: "gap",
  conceptId: "ds-queue",
  memoryId: "storage-memory",
  skillKey: "stack-queue-order",
  factIds: ["f-queue-fifo"],
  prompt,
  correctOptionId: "o",
  explanation: "큐는 먼저 넣은 항목을 먼저 꺼내요.",
  model: "test-model",
  review: { verdict: "supported" },
});

test("v5 data survives the v6 migration and the new tables exist", () => {
  const s = repo.openSession("ds-queue");
  repo.submit(s.id, "b");
  db.execSync(
    "DROP TABLE check_assignments; DROP TABLE personalization_budget; DROP TABLE personalization_jobs; DROP TABLE generated_questions; DROP TABLE evidence_checkpoints; DROP TABLE confusion_evidence; DROP TABLE confusion_memories; PRAGMA user_version=5;",
  );
  const reopened = new LearningRepository(db, () => `t-${++id}`, () => now);
  expect(reopened.snapshot().attempts).toHaveLength(1);
  expect(db.getFirstSync<{ user_version: number }>("PRAGMA user_version")!.user_version).toBe(6);
  expect(reopened.snapshot().settings.personalizationEnabled).toBe(false);
  expect(reopened.personal.budget(reopened.activeLearner).dispatchCount).toBe(0);
});

test("a newer database than the app is refused instead of being changed", () => {
  db.execSync("PRAGMA user_version=7;");
  expect(() => new LearningRepository(db, () => "x", () => now)).toThrow("데이터를 열 수 없어요");
});

test("the basis only lets approved facts into skills; the DBMS-dependent fact stays out", () => {
  for (const c of basis.concepts)
    for (const skill of c.skills)
      for (const f of skill.factIds)
        expect([c.conceptId, f, factById(f)?.status]).toEqual([c.conceptId, f, "approved"]);
  const fkNull = basis.concepts.flatMap((c) => c.facts).find((f) => f.factId === "f-fk-null");
  expect(fkNull?.status).toBe("excluded");
});

test("budgets count per day, refuse past the limit, and survive reopen and reset", () => {
  const learner = repo.activeLearner;
  for (let i = 0; i < LIMITS.pipelineAttemptsPerDay; i++)
    expect(repo.personal.reserve(learner, "pipelineAttempts", LIMITS.pipelineAttemptsPerDay)).toBe(true);
  expect(repo.personal.reserve(learner, "pipelineAttempts", LIMITS.pipelineAttemptsPerDay)).toBe(false);
  const reopened = new LearningRepository(db, () => `t-${++id}`, () => now);
  expect(reopened.personal.budget(learner).pipelineAttempts).toBe(2);
  reopened.resetCurrent();
  expect(reopened.personal.budget(learner).pipelineAttempts).toBe(2);
  now += 86_400_000;
  expect(reopened.personal.reserve(learner, "pipelineAttempts", 2)).toBe(true);
  reopened.eraseAll();
  expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM personalization_budget")!.n).toBe(0);
});

test("approved questions are owned, deduplicated, capped per day and immutable", () => {
  const first = repo.personal.saveApproved(owner(), gapCandidate("큐는 먼저 넣은 것을 먼저 꺼낸다."))!;
  expect(first.quiz.id).toBe(`ai:${first.id}`);
  expect(first.quiz.short).toBe(first.quiz.prompt);
  expect(first.quiz.sourceRefs[0].url).toContain("docs.python.org");
  // Same sentence with different spacing is a duplicate.
  expect(repo.personal.saveApproved(owner(), gapCandidate("큐는  먼저 넣은 것을 먼저 꺼낸다"))).toBeNull();
  expect(repo.personal.saveApproved(owner(), gapCandidate("큐는 한쪽에 넣고 반대쪽에서 꺼낸다."))).not.toBeNull();
  expect(repo.personal.saveApproved(owner(), gapCandidate("큐에서는 처음 들어온 항목이 처음 나온다."))).not.toBeNull();
  expect(repo.personal.saveApproved(owner(), gapCandidate("큐의 꺼내는 순서는 들어온 순서와 같다."))).toBeNull();
  expect(repo.quiz(first.quiz.id).prompt).toBe("큐는 먼저 넣은 것을 먼저 꺼낸다.");
  // Another learner cannot resolve this id.
  // The first linked profile adopts the guest records; a second one is a different learner.
  repo.selectProfile("first");
  repo.selectProfile("second");
  expect(() => repo.quiz(first.quiz.id)).toThrow("문제를 찾지 못했어요");
});

test("a save from stale work (reset or subject change since) is refused", () => {
  const stale = owner();
  repo.installSubject("sqld-taste");
  expect(repo.personal.saveApproved(stale, gapCandidate("큐는 먼저 넣은 것을 먼저 꺼낸다."))).toBeNull();
  repo.installSubject("info-basic");
  // Back on the same subject, the old scope still does not count.
  expect(repo.personal.saveApproved(stale, gapCandidate("큐는 먼저 넣은 것을 먼저 꺼낸다."))).toBeNull();
  expect(repo.personal.saveApproved(owner(), gapCandidate("큐는 먼저 넣은 것을 먼저 꺼낸다."))).not.toBeNull();
});

test("facts outside the approved basis cannot back a question", () => {
  expect(
    repo.personal.saveApproved(owner(), { ...gapCandidate("외래키 열은 NULL이면 검사하지 않는다."), conceptId: "db-foreign", factIds: ["f-fk-null"] }),
  ).toBeNull();
});
