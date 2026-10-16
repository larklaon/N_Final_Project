import type { SQLiteDatabase } from "expo-sqlite";
import catalog from "../content/catalog.json";
import { chatSchema, gapSchema, schema } from "../db/schema";
import { advanceGap, requeueGap } from "../../domain/gap";
import {
  advanceProgress,
  canGrade,
  localDate,
  occurrenceId,
  type Progress,
} from "../../domain/review";
import type {
  Attempt,
  ChatMessage,
  Concept,
  GapEvent,
  GapProgress,
  LearningSnapshot,
  Quiz,
  Session,
  Settings,
} from "../../domain/types";
export type Db = Pick<
  SQLiteDatabase,
  "execSync" | "getFirstSync" | "getAllSync" | "runSync" | "withTransactionSync"
>;
export const dailyGoals = [3, 5, 10];
export const gapIntervals = [15, 30, 60];
export const defaultSettings: Settings = {
  dailyGoal: 5,
  gapEnabled: false,
  gapIntervalMinutes: 30,
  gapStart: "07:00",
  gapEnd: "22:00",
  selectedModel: null,
  aiConsentAt: null,
  onboarded: false,
  planWelcomeDismissed: false,
};
export class LearningRepository {
  constructor(
    private db: Db,
    private uuid: () => string,
    private clock: () => number = Date.now,
  ) {
    db.execSync("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    const version = db.getFirstSync<{ user_version: number }>(
      "PRAGMA user_version",
    )!.user_version;
    if (version > 4)
      throw Error(
        "이 버전의 앱에서 데이터를 열 수 없어요. 앱 업데이트를 확인해 주세요.",
      );
    if (version === 0) db.withTransactionSync(() => db.execSync(schema));
    if (version < 2)
      db.withTransactionSync(() =>
        db.execSync(
          "ALTER TABLE ai_cache ADD COLUMN conceptId TEXT REFERENCES concepts(id); PRAGMA user_version=2;",
        ),
      );
    if (version < 3) db.withTransactionSync(() => db.execSync(gapSchema));
    if (version < 4) db.withTransactionSync(() => db.execSync(chatSchema));
    db.withTransactionSync(() => {
      for (const c of catalog.concepts)
        db.runSync(
          "INSERT INTO concepts(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
          c.id,
          JSON.stringify(c),
        );
      for (const q of catalog.questions)
        db.runSync(
          "INSERT INTO quizzes(id,conceptId,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
          q.id,
          q.conceptId,
          JSON.stringify(q),
        );
      if (!this.meta("activeLearner"))
        this.setMeta("activeLearner", this.createLearner(null));
    });
  }
  private meta(key: string) {
    return this.db.getFirstSync<{ value: string }>(
      "SELECT value FROM app_meta WHERE key=?",
      key,
    )?.value;
  }
  private setMeta(key: string, value: string) {
    this.db.runSync(
      "INSERT INTO app_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      value,
    );
  }
  private createLearner(profileId: string | null) {
    const id = this.uuid();
    this.db.runSync(
      "INSERT INTO learners VALUES (?,?,?)",
      id,
      profileId,
      this.clock(),
    );
    this.db.runSync(
      "INSERT INTO learner_settings VALUES (?,?)",
      id,
      JSON.stringify(defaultSettings),
    );
    this.db.runSync("INSERT INTO memory_state VALUES (?,0)", id);
    return id;
  }
  get activeLearner() {
    return this.meta("activeLearner")!;
  }
  snapshot(learnerId = this.activeLearner): LearningSnapshot {
    const settings = normalizeSettings(
      JSON.parse(
        this.db.getFirstSync<{ data: string }>(
          "SELECT data FROM learner_settings WHERE learnerId=?",
          learnerId,
        )!.data,
      ),
    );
    const concepts = this.db
      .getAllSync<{ data: string }>("SELECT data FROM concepts")
      .map((r) => JSON.parse(r.data) as Concept)
      .sort((a, b) => a.order - b.order);
    const progress: Record<string, Progress> = {};
    for (const row of this.db.getAllSync<{ conceptId: string; data: string }>(
      "SELECT conceptId,data FROM concept_progress WHERE learnerId=?",
      learnerId,
    ))
      progress[row.conceptId] = JSON.parse(row.data);
    const gapProgress: Record<string, GapProgress> = {};
    for (const row of this.db.getAllSync<{ conceptId: string; data: string }>(
      "SELECT conceptId,data FROM gap_progress WHERE learnerId=?",
      learnerId,
    ))
      gapProgress[row.conceptId] = JSON.parse(row.data);
    const attempts = this.db.getAllSync<Attempt>(
      "SELECT id,conceptId,quizId,correct,isGraded,answeredAt,localDate FROM attempts WHERE learnerId=? ORDER BY answeredAt DESC",
      learnerId,
    );
    return {
      learnerId,
      settings,
      concepts,
      progress,
      gapProgress,
      attempts,
      memoryRevision: this.db.getFirstSync<{ revision: number }>(
        "SELECT revision FROM memory_state WHERE learnerId=?",
        learnerId,
      )!.revision,
    };
  }
  updateSettings(patch: Partial<Settings>) {
    const learner = this.activeLearner;
    const old = this.snapshot().settings;
    const settings = { ...old, ...patch };
    if (!dailyGoals.includes(settings.dailyGoal))
      throw Error("하루에 풀 문제는 3·5·10개 중에서 골라 주세요.");
    if (!gapIntervals.includes(settings.gapIntervalMinutes))
      throw Error("카드가 바뀌는 간격은 15·30·60분 중에서 골라 주세요.");
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      !time.test(settings.gapStart) ||
      !time.test(settings.gapEnd) ||
      settings.gapStart >= settings.gapEnd
    )
      throw Error("카드를 보여 줄 시간은 시작이 끝보다 앞서야 해요.");
    this.db.withTransactionSync(() => {
      this.db.runSync(
        "UPDATE learner_settings SET data=? WHERE learnerId=?",
        JSON.stringify(settings),
        learner,
      );
      this.touch(learner);
    });
  }
  private touch(learner: string) {
    this.db.runSync(
      "UPDATE memory_state SET revision=revision+1 WHERE learnerId=?",
      learner,
    );
    this.db.runSync(
      "INSERT INTO automation_jobs(learnerId,revision) SELECT learnerId,revision FROM memory_state WHERE learnerId=? ON CONFLICT(learnerId) DO UPDATE SET revision=excluded.revision,attempts=0",
      learner,
    );
  }
  selectProfile(profileId: string | null) {
    this.db.withTransactionSync(() => {
      let learner = this.db.getFirstSync<{ id: string }>(
        "SELECT id FROM learners WHERE profileId IS ?",
        profileId,
      )?.id;
      if (!learner && profileId) {
        const linked = this.db.getFirstSync<{ n: number }>(
          "SELECT COUNT(*) n FROM learners WHERE profileId IS NOT NULL",
        )!.n;
        const current = this.db.getFirstSync<{
          id: string;
          profileId: string | null;
        }>("SELECT id,profileId FROM learners WHERE id=?", this.activeLearner)!;
        if (
          linked === 0 &&
          current.profileId === null &&
          !this.meta("guestAttached")
        ) {
          learner = current.id;
          this.db.runSync(
            "UPDATE learners SET profileId=? WHERE id=?",
            profileId,
            learner,
          );
          this.setMeta("guestAttached", "1");
        }
      }
      learner ||= this.createLearner(profileId);
      if (learner === this.activeLearner) return;
      this.setMeta("activeLearner", learner);
      this.touch(learner);
    });
  }
  quiz(id: string): Quiz {
    const row = this.db.getFirstSync<{ data: string }>(
      "SELECT data FROM quizzes WHERE id=?",
      id,
    );
    if (!row) throw Error("문제를 찾지 못했어요.");
    return JSON.parse(row.data);
  }
  private allQuestions: Quiz[] | null = null;
  questions(): Quiz[] {
    this.allQuestions ??= this.db
      .getAllSync<{ data: string }>("SELECT data FROM quizzes")
      .map((r) => JSON.parse(r.data) as Quiz);
    return this.allQuestions;
  }
  private saveGap(learner: string, conceptId: string, g: GapProgress) {
    this.db.runSync(
      "INSERT INTO gap_progress VALUES (?,?,?,?) ON CONFLICT(learnerId,conceptId) DO UPDATE SET dueAt=excluded.dueAt,data=excluded.data",
      learner,
      conceptId,
      g.dueAt,
      JSON.stringify(g),
    );
  }
  /**
   * Record answers given on gap surfaces. Idempotent per event id. Correctness is
   * recomputed from the catalog; events for unknown learners or questions are dropped.
   * Returns the ids that are safe to acknowledge to the native side.
   */
  ingestGapEvents(events: GapEvent[]): string[] {
    const handled: string[] = [];
    const byId = new Map(this.questions().map((q) => [q.id, q]));
    this.db.withTransactionSync(() => {
      const touched = new Set<string>();
      for (const e of [...events].sort((a, b) => a.answeredAt - b.answeredAt)) {
        handled.push(e.id);
        const q = byId.get(e.questionId);
        const known = this.db.getFirstSync<{ id: string }>(
          "SELECT id FROM learners WHERE id=?",
          e.learnerId,
        );
        if (
          !q ||
          q.layer !== "gap" ||
          !known ||
          !q.options.some((o) => o.id === e.selectedOptionId) ||
          !Number.isFinite(e.answeredAt)
        )
          continue;
        const correct = e.selectedOptionId === q.correctOptionId;
        const inserted = this.db.runSync(
          "INSERT OR IGNORE INTO gap_events VALUES (?,?,?,?,?,?,?,?)",
          e.id,
          e.learnerId,
          q.conceptId,
          q.id,
          e.selectedOptionId,
          correct ? 1 : 0,
          e.answeredAt,
          localDate(e.answeredAt),
        );
        if (inserted.changes !== 1) continue;
        const old = this.db.getFirstSync<{ data: string }>(
          "SELECT data FROM gap_progress WHERE learnerId=? AND conceptId=?",
          e.learnerId,
          q.conceptId,
        );
        this.saveGap(
          e.learnerId,
          q.conceptId,
          advanceGap(
            old ? JSON.parse(old.data) : undefined,
            correct,
            e.answeredAt,
            q.type,
          ),
        );
        touched.add(e.learnerId);
      }
      for (const learner of touched) this.touch(learner);
    });
    return handled;
  }
  openSession(conceptId: string): Session {
    const s = this.snapshot();
    const concept = s.concepts.find((c) => c.id === conceptId);
    if (!concept) throw Error("개념을 찾지 못했어요.");
    const p = s.progress[conceptId];
    const revision = p?.revision ?? 0;
    const occurrence = occurrenceId(s.learnerId, conceptId, revision);
    const practice = !canGrade(p, revision, this.clock());
    const rows = this.db.getAllSync<{ data: string }>(
      "SELECT data FROM learning_sessions WHERE learnerId=? AND occurrenceId=?",
      s.learnerId,
      occurrence,
    );
    const existing = rows
      .map((r) => JSON.parse(r.data) as Session)
      .find((row) => !row.answer && row.practice === practice);
    if (existing) return existing;
    const quiz = this.quiz(`${conceptId}-deep`);
    // Shuffle once at session creation; the persisted order survives reopening.
    const options = [...quiz.options];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const session: Session = {
      id: this.uuid(),
      learnerId: s.learnerId,
      conceptId,
      quizId: quiz.id,
      options,
      occurrenceId: occurrence,
      revision,
      practice,
      startedAt: this.clock(),
    };
    this.db.runSync(
      "INSERT INTO learning_sessions VALUES (?,?,?,?,?)",
      session.id,
      session.learnerId,
      conceptId,
      occurrence,
      JSON.stringify(session),
    );
    return session;
  }
  submit(sessionId: string, selected: string): Session["answer"] {
    let answer: Session["answer"];
    this.db.withTransactionSync(() => {
      const row = this.db.getFirstSync<{ data: string }>(
        "SELECT data FROM learning_sessions WHERE id=? AND learnerId=?",
        sessionId,
        this.activeLearner,
      );
      if (!row) throw Error("학습 세션이 변경됐어요. 다시 열어 주세요.");
      const session = JSON.parse(row.data) as Session;
      if (session.answer) {
        answer = session.answer;
        return;
      }
      if (!session.options.some((o) => o.id === selected))
        throw Error("선택지를 확인해 주세요.");
      const quiz = this.quiz(session.quizId);
      const now = this.clock();
      const date = localDate(now);
      const learner = session.learnerId;
      const old = this.db.getFirstSync<{ data: string }>(
        "SELECT data FROM concept_progress WHERE learnerId=? AND conceptId=?",
        learner,
        session.conceptId,
      );
      const p = old ? (JSON.parse(old.data) as Progress) : undefined;
      const graded = !session.practice && canGrade(p, session.revision, now);
      const correct = selected === quiz.correctOptionId;
      answer = { selected, correct, graded };
      session.answer = answer;
      this.db.runSync(
        "INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        this.uuid(),
        learner,
        sessionId,
        session.conceptId,
        quiz.id,
        session.occurrenceId,
        selected,
        correct ? 1 : 0,
        graded ? 1 : 0,
        now,
        date,
        Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
      );
      if (graded) {
        const next = advanceProgress(p, correct, now, date, quiz.type);
        next.distinctCorrectDays = this.db.getFirstSync<{ n: number }>(
          "SELECT COUNT(DISTINCT localDate) n FROM attempts WHERE learnerId=? AND conceptId=? AND isGraded=1 AND correct=1",
          learner,
          session.conceptId,
        )!.n;
        this.db.runSync(
          "INSERT INTO concept_progress VALUES (?,?,?,?,?) ON CONFLICT(learnerId,conceptId) DO UPDATE SET dueAt=excluded.dueAt,revision=excluded.revision,data=excluded.data",
          learner,
          session.conceptId,
          next.dueAt,
          next.revision,
          JSON.stringify(next),
        );
        if (!correct) {
          // The piece returns to the lock screen tomorrow.
          const gap = this.db.getFirstSync<{ data: string }>(
            "SELECT data FROM gap_progress WHERE learnerId=? AND conceptId=?",
            learner,
            session.conceptId,
          );
          this.saveGap(
            learner,
            session.conceptId,
            requeueGap(gap ? JSON.parse(gap.data) : undefined, now),
          );
        }
        this.touch(learner);
      }
      this.db.runSync(
        "UPDATE learning_sessions SET data=? WHERE id=?",
        JSON.stringify(session),
        sessionId,
      );
    });
    return answer;
  }
  chatMessages(conceptId: string, learnerId = this.activeLearner): ChatMessage[] {
    return this.db.getAllSync<ChatMessage>(
      "SELECT id,role,text,quote,createdAt FROM chat_messages WHERE learnerId=? AND conceptId=? ORDER BY createdAt,rowid",
      learnerId,
      conceptId,
    );
  }
  /** Ignored when the learner changed meanwhile, like cached explanations. */
  addChatMessage(
    learner: string,
    conceptId: string,
    role: ChatMessage["role"],
    text: string,
    quote: string | null = null,
  ): ChatMessage | null {
    if (!text.trim() || text.length > 8000 || learner !== this.activeLearner)
      return null;
    const message: ChatMessage = {
      id: this.uuid(),
      role,
      text,
      quote: quote?.slice(0, 500) || null,
      createdAt: this.clock(),
    };
    this.db.runSync(
      "INSERT INTO chat_messages VALUES (?,?,?,?,?,?,?)",
      message.id,
      learner,
      conceptId,
      role,
      text,
      message.quote,
      message.createdAt,
    );
    return message;
  }
  clearChat(conceptId: string) {
    this.db.runSync(
      "DELETE FROM chat_messages WHERE learnerId=? AND conceptId=?",
      this.activeLearner,
      conceptId,
    );
  }
  readCache(key: string): string | null {
    const now = this.clock();
    const row = this.db.getFirstSync<{ text: string; createdAt: number }>(
      "SELECT text,createdAt FROM ai_cache WHERE learnerId=? AND key=?",
      this.activeLearner,
      key,
    );
    if (!row || now - row.createdAt > 7 * 86_400_000) return null;
    this.db.runSync(
      "UPDATE ai_cache SET accessedAt=? WHERE learnerId=? AND key=?",
      now,
      this.activeLearner,
      key,
    );
    return row.text;
  }
  cacheCompleted(
    learner: string,
    key: string,
    text: string,
    conceptId: string | null = null,
  ) {
    if (!text.trim() || text.length > 8000 || learner !== this.activeLearner)
      return;
    this.db.withTransactionSync(() => {
      this.db.runSync(
        "INSERT INTO ai_cache(learnerId,key,text,createdAt,accessedAt,conceptId) VALUES (?,?,?,?,?,?) ON CONFLICT(learnerId,key) DO UPDATE SET text=excluded.text,createdAt=excluded.createdAt,accessedAt=excluded.accessedAt,conceptId=excluded.conceptId",
        learner,
        key,
        text,
        this.clock(),
        this.clock(),
        conceptId,
      );
      this.db.runSync(
        "DELETE FROM ai_cache WHERE learnerId=? AND key NOT IN (SELECT key FROM ai_cache WHERE learnerId=? ORDER BY accessedAt DESC,rowid DESC LIMIT 100)",
        learner,
        learner,
      );
    });
  }
  latestSavedExplanation(conceptId: string): string | null {
    return (
      this.db.getFirstSync<{ text: string }>(
        "SELECT text FROM ai_cache WHERE learnerId=? AND conceptId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 1",
        this.activeLearner,
        conceptId,
        this.clock() - 7 * 86_400_000,
      )?.text ?? null
    );
  }
  notificationJobs() {
    return this.db.getAllSync<{
      learnerId: string;
      revision: number;
      attempts: number;
    }>("SELECT * FROM automation_jobs");
  }
  markGapSynced(learner: string, revision: number) {
    this.db.withTransactionSync(() => {
      this.db.runSync(
        "DELETE FROM automation_jobs WHERE learnerId=? AND revision=?",
        learner,
        revision,
      );
    });
  }
  queueNotifications() {
    this.db.runSync(
      "INSERT INTO automation_jobs(learnerId,revision) SELECT learnerId,revision FROM memory_state WHERE learnerId=? ON CONFLICT(learnerId) DO UPDATE SET revision=excluded.revision,attempts=0",
      this.activeLearner,
    );
  }
  consumeEvent(id: string) {
    const result = this.db.runSync(
      "INSERT OR IGNORE INTO consumed_notification_events VALUES (?,?)",
      id,
      this.clock(),
    );
    return result.changes === 1;
  }
  resetCurrent() {
    const learner = this.activeLearner;
    this.db.withTransactionSync(() => {
      for (const table of [
        "learning_sessions",
        "attempts",
        "concept_progress",
        "gap_progress",
        "gap_events",
        "chat_messages",
        "ai_cache",
        "automation_jobs",
      ])
        this.db.runSync(`DELETE FROM ${table} WHERE learnerId=?`, learner);
      const settings = {
        ...this.snapshot().settings,
        gapEnabled: false,
      };
      this.db.runSync(
        "UPDATE learner_settings SET data=? WHERE learnerId=?",
        JSON.stringify(settings),
        learner,
      );
      this.touch(learner);
    });
  }
  eraseAll() {
    this.db.withTransactionSync(() => {
      this.db.runSync("DELETE FROM learners");
      this.db.runSync("DELETE FROM app_meta");
      this.db.runSync("DELETE FROM consumed_notification_events");
      this.setMeta("activeLearner", this.createLearner(null));
    });
  }
}

/** Stored settings may predate V2 (old reminder fields, daily goal 1). */
export function normalizeSettings(raw: Partial<Settings>): Settings {
  const merged = { ...defaultSettings, ...raw } as Settings &
    Record<string, unknown>;
  for (const old of [
    "notificationsEnabled",
    "reminderSlots",
    "quietStart",
    "quietEnd",
  ])
    delete merged[old];
  if (!dailyGoals.includes(merged.dailyGoal))
    merged.dailyGoal =
      dailyGoals.find((n) => n >= merged.dailyGoal) ?? defaultSettings.dailyGoal;
  if (!gapIntervals.includes(merged.gapIntervalMinutes))
    merged.gapIntervalMinutes = defaultSettings.gapIntervalMinutes;
  return merged;
}
