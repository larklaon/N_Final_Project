import { database } from "./database";
import { LearningRepository, type Db } from "../LearningRepository";
import { dailyCount } from "../../../domain/selection";
let db: Db;
let repo: LearningRepository;
let now: number;
let id: number;
beforeEach(() => {
  db = database();
  id = 0;
  now = Date.UTC(2026, 9, 15, 12);
  repo = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
});
test("grading is idempotent across repeated submit and repository reopen", () => {
  const session = repo.openSession("db-primary");
  const quiz = repo.quiz(session.quizId);
  repo.submit(session.id, quiz.correctOptionId);
  repo.submit(session.id, "b");
  const reopened = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
  expect(reopened.snapshot().attempts).toHaveLength(1);
  expect(reopened.snapshot().progress["db-primary"].gradedAttempts).toBe(1);
  expect(dailyCount(reopened.snapshot(), now)).toBe(1);
});
test("early practice does not change progress or daily count", () => {
  const first = repo.openSession("net-http");
  repo.submit(first.id, "a");
  const before = repo.snapshot();
  const practice = repo.openSession("net-http");
  expect(practice.practice).toBe(true);
  repo.submit(practice.id, repo.quiz(practice.quizId).correctOptionId);
  expect(repo.snapshot().progress).toEqual(before.progress);
  expect(dailyCount(repo.snapshot(), now)).toBe(1);
});
test("transaction abort rolls back attempt, progress, memory and outbox", () => {
  const session = repo.openSession("ds-stack");
  const before = repo.snapshot();
  db.execSync(
    "CREATE TRIGGER prevent_progress BEFORE INSERT ON concept_progress BEGIN SELECT RAISE(ABORT,'disk failure fixture'); END;",
  );
  expect(() => repo.submit(session.id, "a")).toThrow();
  expect(repo.snapshot().attempts).toHaveLength(0);
  expect(repo.snapshot().memoryRevision).toBe(before.memoryRevision);
  expect(repo.notificationJobs()).toHaveLength(0);
});
test("first registration attaches guest; other registrations and caches stay isolated", () => {
  const guest = repo.activeLearner;
  repo.cacheCompleted(guest, "key", "첫 설명");
  repo.selectProfile("account-a");
  expect(repo.activeLearner).toBe(guest);
  repo.selectProfile("account-b");
  expect(repo.activeLearner).not.toBe(guest);
  expect(repo.readCache("key")).toBeNull();
  repo.selectProfile("account-a");
  expect(repo.readCache("key")).toBe("첫 설명");
});
test("wrong answer becomes graded review only after due; same concept counts once", () => {
  let s = repo.openSession("ds-stack");
  repo.submit(s.id, "b");
  now += 600_000;
  s = repo.openSession("ds-stack");
  expect(s.practice).toBe(false);
  repo.submit(s.id, repo.quiz(s.quizId).correctOptionId);
  expect(repo.snapshot().progress["ds-stack"].stage).toBe(1);
  expect(dailyCount(repo.snapshot(), now)).toBe(1);
});
test("cache expires and stale learner completion is ignored", () => {
  const a = repo.activeLearner;
  repo.cacheCompleted(a, "key", "ok");
  now += 8 * 86_400_000;
  expect(repo.readCache("key")).toBeNull();
  repo.selectProfile("other");
  const other = repo.activeLearner;
  repo.selectProfile(null);
  repo.cacheCompleted(other, "cross", "bad");
  expect(repo.readCache("cross")).toBeNull();
});
test("notifications preserve newer job revision when old reconciliation finishes", () => {
  repo.queueNotifications();
  const job = repo.notificationJobs()[0];
  repo.updateSettings({ dailyGoal: 5 });
  repo.markNotifications(job.learnerId, job.revision, []);
  expect(repo.notificationJobs()).toHaveLength(1);
});

test("migration and reopening preserve records while adding saved explanation metadata", () => {
  const session = repo.openSession("db-primary");
  repo.submit(session.id, repo.quiz(session.quizId).correctOptionId);
  const learner = repo.activeLearner;
  repo.cacheCompleted(learner, "saved", "보관 설명", "db-primary");
  const reopened = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
  expect(reopened.latestSavedExplanation("db-primary")).toBe("보관 설명");
  expect(reopened.snapshot().attempts).toHaveLength(1);
  repo.queueNotifications();
  expect(repo.snapshot().memoryRevision).toBe(
    reopened.snapshot().memoryRevision,
  );
});

test("v1 migration retains an existing graded attempt", () => {
  const session = repo.openSession("net-http");
  repo.submit(session.id, "a");
  db.execSync(
    "ALTER TABLE ai_cache DROP COLUMN conceptId; PRAGMA user_version=1;",
  );
  const reopened = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
  expect(reopened.snapshot().attempts).toHaveLength(1);
  expect(
    db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
      ?.user_version,
  ).toBe(2);
});

test("reset disables only the current learner reminders and survives reopen", () => {
  repo.selectProfile("a");
  repo.updateSettings({ notificationsEnabled: true });
  const learnerA = repo.activeLearner;
  repo.selectProfile("b");
  repo.updateSettings({ notificationsEnabled: true });
  repo.resetCurrent();
  const reopened = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
  expect(reopened.snapshot().settings.notificationsEnabled).toBe(false);
  expect(reopened.snapshot(learnerA).settings.notificationsEnabled).toBe(true);
  expect(
    reopened
      .notificationJobs()
      .some((j) => j.learnerId === reopened.activeLearner),
  ).toBe(true);
});
