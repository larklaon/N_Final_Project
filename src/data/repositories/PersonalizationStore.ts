import { localDate } from "../../domain/review";
import {
  LIMITS,
  PROMPT_VERSION,
  basis,
  approvedFacts,
  contentHash,
} from "../../domain/personalization";
import type { Quiz, QuizOrigin } from "../../domain/types";
import type { Db } from "./LearningRepository";

export type BudgetField =
  | "dispatchCount"
  | "pipelineAttempts"
  | "gapApprovedCount"
  | "checkApprovedCount"
  | "checkServedCount";
export type Budget = Record<BudgetField, number> & { localDate: string };

export type GeneratedStatus = "pending" | "approved" | "rejected" | "hidden" | "expired";
export type GeneratedRow = {
  id: string;
  learnerId: string;
  subjectId: string;
  conceptId: string;
  memoryId: string | null;
  kind: "gap" | "check";
  quiz: Quiz;
  basisId: string;
  basisVersion: number;
  factIds: string[];
  model: string;
  createdAt: number;
  expiresAt: number;
  status: GeneratedStatus;
};

/** A candidate that passed local checks and the independent review. */
export type ApprovedCandidate = {
  kind: "gap" | "check";
  conceptId: string;
  memoryId: string;
  skillKey: string;
  factIds: string[];
  prompt: string;
  context?: string;
  options?: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  model: string;
  review: object;
};

/** Who may write: the owner and scope captured before the AI call started. */
export type Owner = { learnerId: string; subjectId: string; scope: string };

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
const quotaOf: Record<"gap" | "check", { field: BudgetField; limit: number }> = {
  gap: { field: "gapApprovedCount", limit: LIMITS.gapApprovedPerDay },
  check: { field: "checkApprovedCount", limit: LIMITS.checkApprovedPerDay },
};

/**
 * Storage for V4 personalization. Shares the learning database; the repository passes in
 * what it knows about the current owner so stale work can be refused at save time.
 */
export class PersonalizationStore {
  constructor(
    private db: Db,
    private uuid: () => string,
    private clock: () => number,
    private isCurrent: (owner: Owner) => boolean,
  ) {}

  budget(learnerId: string, date = localDate(this.clock())): Budget {
    const row = this.db.getFirstSync<Budget>(
      "SELECT localDate,dispatchCount,pipelineAttempts,gapApprovedCount,checkApprovedCount,checkServedCount FROM personalization_budget WHERE learnerId=? AND localDate=?",
      learnerId,
      date,
    );
    return (
      row ?? {
        localDate: date,
        dispatchCount: 0,
        pipelineAttempts: 0,
        gapApprovedCount: 0,
        checkApprovedCount: 0,
        checkServedCount: 0,
      }
    );
  }
  /** Increments a counter only while it is under the limit. Never refunded. */
  reserve(learnerId: string, field: BudgetField, limit: number, by = 1): boolean {
    let ok = false;
    this.db.withTransactionSync(() => {
      ok = this.reserveIn(learnerId, field, limit, by);
    });
    return ok;
  }
  /** Same as reserve, for use inside an open transaction. */
  reserveIn(learnerId: string, field: BudgetField, limit: number, by = 1): boolean {
    const date = localDate(this.clock());
    this.db.runSync(
      "INSERT OR IGNORE INTO personalization_budget(learnerId,localDate,timezone) VALUES (?,?,?)",
      learnerId,
      date,
      timezone(),
    );
    if (this.budget(learnerId, date)[field] + by > limit) return false;
    this.db.runSync(
      `UPDATE personalization_budget SET ${field}=${field}+? WHERE learnerId=? AND localDate=?`,
      by,
      learnerId,
      date,
    );
    return true;
  }

  /**
   * Stores an approved question. Refused when the owner moved on, today's quota is used,
   * or the same content was already approved for this learner and subject.
   */
  saveApproved(owner: Owner, c: ApprovedCandidate): GeneratedRow | null {
    if (!this.isCurrent(owner)) return null;
    const now = this.clock();
    const facts = approvedFacts(c.conceptId).filter((f) => c.factIds.includes(f.factId));
    if (facts.length !== c.factIds.length || facts.length === 0) return null;
    const optionTexts = (c.options ?? []).map((o) => o.text);
    const hashKey = contentHash([c.kind, c.conceptId, c.prompt, ...optionTexts]);
    const id = this.uuid();
    const origin: QuizOrigin = {
      kind: "generated",
      generatedId: id,
      memoryId: c.memoryId,
      skillKey: c.skillKey,
      basisId: basis.basisId,
      basisVersion: basis.version,
      factIds: c.factIds,
    };
    const quiz: Quiz =
      c.kind === "gap"
        ? {
            id: `ai:${id}`,
            conceptId: c.conceptId,
            type: "ox",
            layer: "gap",
            prompt: c.prompt,
            // V4: the collapsed card shows the same sentence, so no shorter wording can flip it.
            short: c.prompt,
            options: [
              { id: "o", text: "맞아요 (O)" },
              { id: "x", text: "아니에요 (X)" },
            ],
            correctOptionId: c.correctOptionId,
            explanation: c.explanation,
            sourceRefs: facts.map((f) => ({ title: f.source.title, url: f.source.url, checkedAt: f.checkedAt })),
            contentVersion: 1,
            origin,
          }
        : {
            id: `ai:${id}`,
            conceptId: c.conceptId,
            type: "choice",
            layer: "app",
            prompt: c.prompt,
            ...(c.context ? { context: c.context } : {}),
            builtOn: [c.conceptId],
            options: c.options ?? [],
            correctOptionId: c.correctOptionId,
            explanation: c.explanation,
            sourceRefs: facts.map((f) => ({ title: f.source.title, url: f.source.url, checkedAt: f.checkedAt })),
            contentVersion: 1,
            origin,
          };
    let saved: GeneratedRow | null = null;
    this.db.withTransactionSync(() => {
      const dup = this.db.getFirstSync<{ id: string }>(
        "SELECT id FROM generated_questions WHERE learnerId=? AND subjectId=? AND contentHash=?",
        owner.learnerId,
        owner.subjectId,
        hashKey,
      );
      if (dup) return;
      const quota = quotaOf[c.kind];
      if (!this.reserveIn(owner.learnerId, quota.field, quota.limit)) return;
      const expiresAt = now + (c.kind === "gap" ? LIMITS.gapCardLifeMs : LIMITS.archiveAfterMs);
      this.db.runSync(
        "INSERT INTO generated_questions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        owner.learnerId,
        owner.subjectId,
        c.conceptId,
        c.memoryId,
        c.kind,
        JSON.stringify(quiz),
        basis.basisId,
        basis.version,
        JSON.stringify(c.factIds),
        PROMPT_VERSION,
        c.model,
        hashKey,
        now,
        expiresAt,
        "approved",
        JSON.stringify(c.review),
      );
      saved = this.row(id, owner.learnerId);
    });
    return saved;
  }

  private parse(r: {
    id: string;
    learnerId: string;
    subjectId: string;
    conceptId: string;
    memoryId: string | null;
    kind: "gap" | "check";
    quiz: string;
    basisId: string;
    basisVersion: number;
    factIds: string;
    model: string;
    createdAt: number;
    expiresAt: number;
    status: GeneratedStatus;
  }): GeneratedRow {
    return { ...r, quiz: JSON.parse(r.quiz) as Quiz, factIds: JSON.parse(r.factIds) as string[] };
  }
  private static columns =
    "id,learnerId,subjectId,conceptId,memoryId,kind,quiz,basisId,basisVersion,factIds,model,createdAt,expiresAt,status";

  /** One generated question, only for its owner. Includes hidden/expired originals for history. */
  row(id: string, learnerId: string): GeneratedRow | null {
    const r = this.db.getFirstSync<Parameters<PersonalizationStore["parse"]>[0]>(
      `SELECT ${PersonalizationStore.columns} FROM generated_questions WHERE id=? AND learnerId=?`,
      id,
      learnerId,
    );
    return r ? this.parse(r) : null;
  }
  /** The stored quiz for an `ai:` id, owner-checked. */
  quiz(quizId: string, learnerId: string): Quiz | null {
    if (!quizId.startsWith("ai:")) return null;
    const row = this.row(quizId.slice(3), learnerId);
    return row && (row.status === "approved" || row.status === "hidden" || row.status === "expired") ? row.quiz : null;
  }
  /** Every past or present question of the learner, for grading history and replays. */
  allQuizzes(learnerId: string): Quiz[] {
    return this.db
      .getAllSync<{ quiz: string }>(
        "SELECT quiz FROM generated_questions WHERE learnerId=? AND status IN ('approved','hidden','expired')",
        learnerId,
      )
      .map((r) => JSON.parse(r.quiz) as Quiz);
  }
  /** Questions that may still be shown: approved, owned, in this subject and not expired. */
  live(learnerId: string, subjectId: string, kind: "gap" | "check", now = this.clock()): GeneratedRow[] {
    return this.db
      .getAllSync<Parameters<PersonalizationStore["parse"]>[0]>(
        `SELECT ${PersonalizationStore.columns} FROM generated_questions WHERE learnerId=? AND subjectId=? AND kind=? AND status='approved' AND expiresAt>? ORDER BY createdAt`,
        learnerId,
        subjectId,
        kind,
        now,
      )
      .map((r) => this.parse(r));
  }
  /** Stops new showings; the original stays for history and late answers. */
  hide(learnerId: string, generatedId: string) {
    return (
      this.db.runSync(
        "UPDATE generated_questions SET status='hidden' WHERE id=? AND learnerId=? AND status='approved'",
        generatedId,
        learnerId,
      ).changes === 1
    );
  }
  expireOld(now = this.clock()) {
    this.db.runSync("UPDATE generated_questions SET status='expired' WHERE status='approved' AND expiresAt<=?", now);
  }

  /** "Reset learning" removes personal V4 records but keeps today's budget rows. */
  resetLearner(learnerId: string) {
    for (const table of [
      "check_assignments",
      "personalization_jobs",
      "generated_questions",
      "confusion_evidence",
      "confusion_memories",
      "evidence_checkpoints",
    ])
      this.db.runSync(`DELETE FROM ${table} WHERE learnerId=?`, learnerId);
  }
}
