import { database } from "./database";
import { LearningRepository, type Db } from "../LearningRepository";
import { dailyCount } from "../../../domain/selection";
import type { GapEvent } from "../../../domain/types";
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
test("gap sync preserves a newer job revision when an old sync finishes", () => {
  repo.queueNotifications();
  const job = repo.notificationJobs()[0];
  repo.updateSettings({ dailyGoal: 10 });
  repo.markGapSynced(job.learnerId, job.revision);
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
  ).toBe(5);
});

test("reset disables only the current learner gap cards and survives reopen", () => {
  repo.selectProfile("a");
  repo.updateSettings({ gapEnabled: true });
  const learnerA = repo.activeLearner;
  repo.selectProfile("b");
  repo.updateSettings({ gapEnabled: true });
  repo.resetCurrent();
  const reopened = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
  expect(reopened.snapshot().settings.gapEnabled).toBe(false);
  expect(reopened.snapshot(learnerA).settings.gapEnabled).toBe(true);
  expect(
    reopened
      .notificationJobs()
      .some((j) => j.learnerId === reopened.activeLearner),
  ).toBe(true);
});

const gapEvent = (over: Partial<GapEvent> = {}): GapEvent => ({
  id: "event-1",
  learnerId: repo.activeLearner,
  questionId: "db-primary-ox",
  selectedOptionId: repo.quiz("db-primary-ox").correctOptionId,
  answeredAt: now,
  ...over,
});

test("app sessions use the deeper app-layer question", () => {
  const session = repo.openSession("db-primary");
  expect(session.quizId).toBe("db-primary-deep");
  expect(repo.quiz(session.quizId).layer).toBe("app");
  expect(session.options).toHaveLength(4);
});

test("gap answers are recorded once, recomputed from the catalog and mark the piece seen", () => {
  const before = repo.snapshot().memoryRevision;
  // A forged "correct" flag cannot exist: correctness comes from the catalog.
  const wrong = repo.quiz("db-primary-ox").options.find(
    (o) => o.id !== repo.quiz("db-primary-ox").correctOptionId,
  )!.id;
  expect(repo.ingestGapEvents([gapEvent({ selectedOptionId: wrong })])).toEqual(
    ["event-1"],
  );
  expect(repo.ingestGapEvents([gapEvent({ selectedOptionId: wrong })])).toEqual(
    ["event-1"],
  );
  const g = repo.snapshot().gapProgress["db-primary"];
  expect(g).toMatchObject({ seen: 1, correct: 0, stage: 0, lastType: "ox" });
  expect(g.dueAt).toBe(now + 86_400_000);
  expect(repo.snapshot().memoryRevision).toBe(before + 1);
  // Gap answers never grade the app layer.
  expect(repo.snapshot().progress["db-primary"]).toBeUndefined();
});

test("gap events for unknown learners, unknown or app questions are acknowledged but dropped", () => {
  const ids = repo.ingestGapEvents([
    gapEvent({ id: "x1", learnerId: "deleted-learner" }),
    gapEvent({ id: "x2", questionId: "missing" }),
    gapEvent({ id: "x3", questionId: "db-primary-deep", selectedOptionId: "a" }),
    gapEvent({ id: "x4", selectedOptionId: "zzz" }),
  ]);
  expect(ids).toEqual(["x1", "x2", "x3", "x4"]);
  expect(repo.snapshot().gapProgress).toEqual({});
});

test("events are attributed to the learner that answered, not the active one", () => {
  const guest = repo.activeLearner;
  repo.selectProfile("a");
  repo.selectProfile("b");
  repo.ingestGapEvents([gapEvent({ learnerId: guest })]);
  expect(repo.snapshot().gapProgress).toEqual({});
  expect(repo.snapshot(guest).gapProgress["db-primary"].seen).toBe(1);
});

test("a wrong graded app answer puts the piece on the lock screen tomorrow", () => {
  repo.ingestGapEvents([gapEvent()]);
  expect(repo.snapshot().gapProgress["db-primary"].dueAt).toBe(
    now + 86_400_000,
  );
  now += 3 * 86_400_000;
  const s = repo.openSession("db-primary");
  repo.submit(s.id, "b");
  expect(repo.snapshot().gapProgress["db-primary"]).toMatchObject({
    stage: 0,
    seen: 1,
    dueAt: now + 86_400_000,
  });
});

test("pre-V2 settings are normalized and v2 data migrates to v3", () => {
  const learner = repo.activeLearner;
  db.runSync(
    "UPDATE learner_settings SET data=? WHERE learnerId=?",
    JSON.stringify({
      dailyGoal: 1,
      notificationsEnabled: true,
      reminderSlots: ["20:30"],
      quietStart: "22:00",
      quietEnd: "07:00",
      selectedModel: null,
      aiConsentAt: null,
      onboarded: true,
    }),
    learner,
  );
  db.execSync(
    "DROP TABLE plans; DROP TABLE knowledge_state; DROP TABLE subjects; DROP TABLE chat_messages; DROP TABLE gap_events; DROP TABLE gap_progress; PRAGMA user_version=2;",
  );
  const reopened = new LearningRepository(
    db,
    () => `test-${++id}`,
    () => now,
  );
  const settings = reopened.snapshot().settings as unknown as Record<
    string,
    unknown
  >;
  expect(settings).toMatchObject({
    dailyGoal: 3,
    gapEnabled: false,
    onboarded: true,
  });
  expect(settings.reminderSlots).toBeUndefined();
  expect(reopened.snapshot().gapProgress).toEqual({});
});

test("settings reject unsupported goals, intervals and inverted card hours", () => {
  expect(() => repo.updateSettings({ dailyGoal: 4 })).toThrow();
  expect(() => repo.updateSettings({ gapIntervalMinutes: 5 })).toThrow();
  expect(() =>
    repo.updateSettings({ gapStart: "22:00", gapEnd: "07:00" }),
  ).toThrow();
  repo.updateSettings({ dailyGoal: 10, gapIntervalMinutes: 60 });
  expect(repo.snapshot().settings).toMatchObject({
    dailyGoal: 10,
    gapIntervalMinutes: 60,
  });
});

test("chat history is kept per concept and learner, survives reopen and resets with the learner", () => {
  const guest = repo.activeLearner;
  repo.addChatMessage(guest, "db-primary", "user", "후보키가 뭐예요?", "기본키는 후보키 중 하나");
  now += 1;
  repo.addChatMessage(guest, "db-primary", "assistant", "유일하게 구별할 수 있는 키예요.");
  repo.addChatMessage(guest, "db-foreign", "user", "다른 개념");
  expect(repo.addChatMessage("someone-else", "db-primary", "user", "x")).toBeNull();
  const reopened = new LearningRepository(db, () => `test-${++id}`, () => now);
  expect(reopened.chatMessages("db-primary").map((m) => [m.role, m.quote])).toEqual([
    ["user", "기본키는 후보키 중 하나"],
    ["assistant", null],
  ]);
  reopened.selectProfile("a");
  reopened.selectProfile("b");
  expect(reopened.chatMessages("db-primary")).toEqual([]);
  reopened.selectProfile(null);
  reopened.resetCurrent();
  expect(reopened.chatMessages("db-primary")).toEqual([]);
  expect(
    db.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version,
  ).toBe(5);
});

test("installing a subject switches the learner to that pack only; records stay per subject", () => {
  expect(repo.installedSubjects()).toEqual([]);
  repo.installSubject("sqld-taste");
  expect(repo.installedSubjects()).toEqual(["sqld-taste"]);
  const s = repo.snapshot();
  expect(s.settings.subjectId).toBe("sqld-taste");
  expect(s.concepts).toHaveLength(12);
  expect(s.concepts.every((c) => c.subjectId === "sqld-taste")).toBe(true);
  const session = repo.openSession("sqld-select");
  repo.submit(session.id, "a");
  repo.installSubject("info-basic");
  expect(repo.snapshot().concepts).toHaveLength(60);
  expect(repo.snapshot().progress["sqld-select"]).toBeDefined();
  expect(() => repo.installSubject("toeic-words")).toThrow("아직 열리지 않은 과목");
});

test("V2 learners keep studying the information-processing basics after the V3 upgrade", () => {
  repo.updateSettings({ onboarded: true });
  db.execSync(
    "DROP TABLE plans; DROP TABLE knowledge_state; DROP TABLE subjects; PRAGMA user_version=4;",
  );
  const reopened = new LearningRepository(db, () => `test-${++id}`, () => now);
  expect(reopened.installedSubjects()).toEqual(["info-basic"]);
  expect(reopened.snapshot().settings.subjectId).toBe("info-basic");
  expect(reopened.snapshot().concepts).toHaveLength(60);
});

test("upgrading to V3 replays earlier answers into resolution", () => {
  const s = repo.openSession("db-primary");
  repo.submit(s.id, "a");
  repo.ingestGapEvents([
    { id: "old-gap", learnerId: repo.activeLearner, questionId: "net-http-ox", selectedOptionId: "o", answeredAt: now },
  ]);
  db.execSync(
    "DROP TABLE plans; DROP TABLE knowledge_state; DROP TABLE subjects; PRAGMA user_version=4;",
  );
  const reopened = new LearningRepository(db, () => `test-${++id}`, () => now);
  const k = reopened.snapshot().knowledge;
  expect(k["db-primary"].r).toBe(20);
  expect(k["net-http"].r).toBe(8);
});
