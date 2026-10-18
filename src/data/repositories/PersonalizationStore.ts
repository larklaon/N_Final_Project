import { localDate } from "../../domain/review";
import {
  LIMITS,
  PROMPT_VERSION,
  basis,
  basisFor,
  approvedFacts,
  contentHash,
  isStale,
  memoryStatus,
  type EvidenceItem,
  type EvidenceRecord,
  type ExtractionInput,
  type MemoryCandidate,
  type MemoryStatus,
  type MemoryView,
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

  /* ───────────── C2: evidence and memories ───────────── */

  private processed(learnerId: string, kind: string, id: string) {
    return !!this.db.getFirstSync(
      "SELECT 1 FROM evidence_checkpoints WHERE learnerId=? AND sourceKind=? AND sourceId=?",
      learnerId,
      kind,
      id,
    );
  }

  /**
   * New observations for the extractor: wrong graded app answers and wrong gap answers of the
   * last 14 days, and the learner's completed chat messages, all for basis concepts of this
   * subject and not processed before. Unanswered (failed/cancelled) chat turns are left out.
   */
  extractionInput(
    learnerId: string,
    conceptIds: string[],
    quizOf: (quizId: string) => { prompt: string; options: { id: string; text: string }[]; correctOptionId: string; contentVersion: number } | null,
  ): ExtractionInput {
    const now = this.clock();
    const since = now - LIMITS.evidenceDays * 86_400_000;
    const inBasis = conceptIds.filter((c) => basisFor(c));
    const marks = inBasis.map(() => "?").join(",") || "''";
    const evidence: EvidenceItem[] = [];
    const answers = [
      ...this.db
        .getAllSync<{ id: string; conceptId: string; quizId: string; selectedOptionId: string; answeredAt: number; localDate: string }>(
          `SELECT id,conceptId,quizId,selectedOptionId,answeredAt,localDate FROM attempts WHERE learnerId=? AND isGraded=1 AND correct=0 AND answeredAt>=? AND conceptId IN (${marks}) ORDER BY answeredAt DESC`,
          learnerId,
          since,
          ...inBasis,
        )
        .map((r) => ({ ...r, kind: "attempt" as const })),
      ...this.db
        .getAllSync<{ id: string; conceptId: string; quizId: string; selectedOptionId: string; answeredAt: number; localDate: string }>(
          `SELECT id,conceptId,questionId AS quizId,selectedOptionId,answeredAt,localDate FROM gap_events WHERE learnerId=? AND correct=0 AND answeredAt>=? AND conceptId IN (${marks}) ORDER BY answeredAt DESC`,
          learnerId,
          since,
          ...inBasis,
        )
        .map((r) => ({ ...r, kind: "gap" as const })),
    ].sort((a, b) => b.answeredAt - a.answeredAt);
    for (const a of answers) {
      if (evidence.length >= LIMITS.maxWrongAnswers) break;
      if (this.processed(learnerId, a.kind, a.id)) continue;
      const q = quizOf(a.quizId);
      if (!q) continue;
      const text = (id: string) => q.options.find((o) => o.id === id)?.text ?? id;
      evidence.push({
        ref: `${a.kind}:${a.id}`,
        kind: a.kind,
        sourceId: a.id,
        conceptId: a.conceptId,
        quizId: a.quizId,
        contentVersion: q.contentVersion,
        prompt: q.prompt,
        chosen: text(a.selectedOptionId),
        correct: text(q.correctOptionId),
        answeredAt: a.answeredAt,
        localDate: a.localDate,
      });
    }
    let chars = 0;
    let chats = 0;
    for (const conceptId of inBasis) {
      const messages = this.db.getAllSync<{ id: string; role: "user" | "assistant"; text: string; createdAt: number }>(
        "SELECT id,role,text,createdAt FROM chat_messages WHERE learnerId=? AND conceptId=? AND createdAt>=? ORDER BY createdAt,rowid",
        learnerId,
        conceptId,
        since,
      );
      messages.forEach((m, i) => {
        if (m.role !== "user" || chats >= LIMITS.maxChatMessages) return;
        if (messages[i + 1]?.role !== "assistant") return; // No completed reply: failed, cancelled or streaming.
        if (this.processed(learnerId, "chat", m.id)) return;
        const before = i > 0 && messages[i - 1].role === "assistant" ? messages[i - 1].text.slice(0, 300) : null;
        const size = m.text.length + (before?.length ?? 0);
        if (chars + size > LIMITS.maxChatChars) return;
        chars += size;
        chats++;
        evidence.push({
          ref: `chat:${m.id}`,
          kind: "chat",
          sourceId: m.id,
          conceptId,
          text: m.text,
          contextBefore: before,
          answeredAt: m.createdAt,
          localDate: localDate(m.createdAt),
        });
      });
    }
    return {
      evidence,
      memories: this.memories(learnerId).filter((m) => inBasis.includes(m.conceptId) && m.status !== "archived"),
      skills: inBasis.flatMap((c) => basisFor(c)!.skills.map((s) => ({ conceptId: c, skillKey: s.skillKey, label: s.label }))),
    };
  }

  memories(learnerId: string, subjectId?: string): (MemoryView & { subjectId: string })[] {
    return this.db.getAllSync<MemoryView & { subjectId: string }>(
      `SELECT id,subjectId,conceptId,skillKey,summary,status,lastEvidenceAt,lastCheckAt FROM confusion_memories WHERE learnerId=?${subjectId ? " AND subjectId=?" : ""} ORDER BY lastEvidenceAt DESC`,
      ...(subjectId ? [learnerId, subjectId] : [learnerId]),
    );
  }
  memory(learnerId: string, memoryId: string) {
    return this.memories(learnerId).find((m) => m.id === memoryId) ?? null;
  }
  private evidenceOf(memoryId: string): EvidenceRecord[] {
    return this.db.getAllSync<EvidenceRecord>(
      "SELECT sourceKind,sourceId,quizId,evidenceType,occurredAt,localDate FROM confusion_evidence WHERE memoryId=?",
      memoryId,
    );
  }
  /** Recomputes and stores the status of one memory from its evidence. Inside a transaction. */
  private restatus(memoryId: string) {
    const m = this.db.getFirstSync<{ status: MemoryStatus; data: string }>(
      "SELECT status,data FROM confusion_memories WHERE id=?",
      memoryId,
    );
    if (!m || m.status === "archived") return;
    const next = memoryStatus(this.evidenceOf(memoryId));
    if (next && next !== m.status)
      this.db.runSync("UPDATE confusion_memories SET status=?,revision=revision+1 WHERE id=?", next, memoryId);
  }

  /**
   * Saves validated candidates with their evidence and marks every sent observation as
   * processed. Refused as a whole if the owner moved on while the AI was working.
   * Returns the ids of memories that changed.
   */
  applyCandidates(owner: Owner, input: ExtractionInput, candidates: MemoryCandidate[]): string[] | null {
    if (!this.isCurrent(owner)) return null;
    const now = this.clock();
    const byRef = new Map(input.evidence.map((e) => [e.ref, e]));
    const changed: string[] = [];
    this.db.withTransactionSync(() => {
      for (const c of candidates) {
        const ignored = c.evidenceRefs.some((r) => {
          const e = byRef.get(r)!;
          return !!this.db.getFirstSync(
            "SELECT 1 FROM evidence_checkpoints WHERE learnerId=? AND sourceKind=? AND sourceId=? AND ignored=1",
            owner.learnerId,
            e.kind,
            e.sourceId,
          );
        });
        if (ignored) continue;
        let row = this.db.getFirstSync<{ id: string; status: MemoryStatus }>(
          "SELECT id,status FROM confusion_memories WHERE learnerId=? AND subjectId=? AND conceptId=? AND skillKey=?",
          owner.learnerId,
          owner.subjectId,
          c.conceptId,
          c.skillKey,
        );
        if (!row) {
          const open = this.db.getFirstSync<{ n: number }>(
            "SELECT COUNT(*) n FROM confusion_memories WHERE learnerId=? AND subjectId=? AND conceptId=? AND status IN ('candidate','active','improving')",
            owner.learnerId,
            owner.subjectId,
            c.conceptId,
          )!.n;
          if (open >= LIMITS.memoriesPerConcept) continue;
          const id = this.uuid();
          this.db.runSync(
            "INSERT INTO confusion_memories(id,learnerId,subjectId,conceptId,skillKey,summary,status,revision,createdAt,lastEvidenceAt,lastCheckAt,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            id,
            owner.learnerId,
            owner.subjectId,
            c.conceptId,
            c.skillKey,
            c.summary,
            "candidate",
            0,
            now,
            now,
            null,
            "{}",
          );
          row = { id, status: "candidate" };
        } else if (row.status === "archived") {
          // New evidence after an ignore or a long pause starts the memory over.
          this.db.runSync(
            "UPDATE confusion_memories SET status='candidate',summary=?,data='{}',revision=revision+1 WHERE id=?",
            c.summary,
            row.id,
          );
        }
        let added = 0;
        for (const r of c.evidenceRefs) {
          const e = byRef.get(r)!;
          added += this.db.runSync(
            "INSERT OR IGNORE INTO confusion_evidence VALUES (?,?,?,?,?,?,?,?,?,?)",
            this.uuid(),
            row.id,
            owner.learnerId,
            e.kind,
            e.sourceId,
            e.kind === "chat" ? "chat" : String(e.contentVersion),
            e.kind === "chat" ? null : e.quizId,
            e.localDate,
            e.answeredAt,
            e.kind === "chat" ? "learner-statement" : "wrong-answer",
          ).changes;
        }
        if (added === 0) continue;
        const latest = Math.max(...c.evidenceRefs.map((r) => byRef.get(r)!.answeredAt));
        this.db.runSync(
          "UPDATE confusion_memories SET lastEvidenceAt=MAX(lastEvidenceAt,?),summary=?,revision=revision+1 WHERE id=?",
          latest,
          c.summary,
          row.id,
        );
        this.restatus(row.id);
        changed.push(row.id);
      }
      for (const e of input.evidence)
        this.db.runSync(
          "INSERT OR IGNORE INTO evidence_checkpoints VALUES (?,?,?,?,0)",
          owner.learnerId,
          e.kind,
          e.sourceId,
          now,
        );
    });
    return changed;
  }

  /** The learner dismissed a memory: archive it and never reuse those observations. */
  /** "삭제": the memory and its evidence go; its questions stop being given, answer history stays. */
  deleteMemory(learnerId: string, memoryId: string) {
    let ok = false;
    this.db.withTransactionSync(() => {
      if (!this.db.getFirstSync("SELECT 1 FROM confusion_memories WHERE id=? AND learnerId=?", memoryId, learnerId)) return;
      this.db.runSync(
        "UPDATE generated_questions SET status='hidden' WHERE memoryId=? AND learnerId=? AND status='approved'",
        memoryId,
        learnerId,
      );
      this.db.runSync("DELETE FROM confusion_memories WHERE id=?", memoryId);
      ok = true;
    });
    return ok;
  }
  ignoreMemory(learnerId: string, memoryId: string) {
    let ok = false;
    this.db.withTransactionSync(() => {
      const m = this.db.getFirstSync<{ id: string }>(
        "SELECT id FROM confusion_memories WHERE id=? AND learnerId=?",
        memoryId,
        learnerId,
      );
      if (!m) return;
      for (const e of this.evidenceOf(memoryId))
        this.db.runSync(
          "INSERT INTO evidence_checkpoints VALUES (?,?,?,?,1) ON CONFLICT(learnerId,sourceKind,sourceId) DO UPDATE SET ignored=1",
          learnerId,
          e.sourceKind,
          e.sourceId,
          this.clock(),
        );
      this.db.runSync("DELETE FROM confusion_evidence WHERE memoryId=?", memoryId);
      this.db.runSync(
        "UPDATE confusion_memories SET status='archived',data=?,revision=revision+1 WHERE id=?",
        JSON.stringify({ ignoredAt: this.clock() }),
        memoryId,
      );
      ok = true;
    });
    return ok;
  }
  /** Memories without new evidence or checks for 30 days fade to archived (not resolved). */
  archiveStale(learnerId: string) {
    const now = this.clock();
    for (const m of this.memories(learnerId))
      if (isStale(m, now))
        this.db.runSync("UPDATE confusion_memories SET status='archived',revision=revision+1 WHERE id=?", m.id);
  }

  /* ───────────── C3: jobs and generation targets ───────────── */

  /** Starts a job unless the same input already succeeded. Returns the job id or null. */
  startJob(owner: Owner, inputFingerprint: string): string | null {
    const now = this.clock();
    let id: string | null = null;
    this.db.withTransactionSync(() => {
      if (
        this.db.getFirstSync(
          "SELECT 1 FROM personalization_jobs WHERE learnerId=? AND inputFingerprint=? AND status='succeeded'",
          owner.learnerId,
          inputFingerprint,
        )
      )
        return;
      id = this.uuid();
      this.db.runSync(
        "INSERT INTO personalization_jobs VALUES (?,?,?,?,?,?,?,?,?,?)",
        id,
        owner.learnerId,
        owner.subjectId,
        owner.scope,
        inputFingerprint,
        "running",
        1,
        now,
        now,
        null,
      );
    });
    return id;
  }
  finishJob(id: string, status: "succeeded" | "failed" | "cancelled", errorCode: string | null = null) {
    this.db.runSync(
      "UPDATE personalization_jobs SET status=?,errorCode=?,updatedAt=? WHERE id=? AND status='running'",
      status,
      errorCode,
      this.clock(),
      id,
    );
  }
  /** A job left running by a killed app is a failure, never a success. */
  recoverInterrupted(learnerId: string) {
    this.db.runSync(
      "UPDATE personalization_jobs SET status='failed',errorCode='interrupted',updatedAt=? WHERE learnerId=? AND status='running'",
      this.clock(),
      learnerId,
    );
  }
  lastJob(learnerId: string) {
    return this.db.getFirstSync<{ status: string; errorCode: string | null; updatedAt: number }>(
      "SELECT status,errorCode,updatedAt FROM personalization_jobs WHERE learnerId=? ORDER BY updatedAt DESC,rowid DESC LIMIT 1",
      learnerId,
    );
  }
  /** Live questions made for one memory. */
  forMemory(learnerId: string, memoryId: string, kind: "gap" | "check", now = this.clock()) {
    return this.db
      .getAllSync<{ id: string; createdAt: number }>(
        "SELECT id,createdAt FROM generated_questions WHERE learnerId=? AND memoryId=? AND kind=? AND status='approved' AND expiresAt>?",
        learnerId,
        memoryId,
        kind,
        now,
      );
  }
  /** The first real answer (not just a showing) to one of the memory's gap cards. */
  firstCardAnswer(learnerId: string, memoryId: string) {
    return this.db.getFirstSync<{ id: string; answeredAt: number; localDate: string; correct: number }>(
      "SELECT e.id,e.answeredAt,e.localDate,e.correct FROM gap_events e JOIN generated_questions g ON e.questionId='ai:'||g.id AND g.learnerId=e.learnerId WHERE e.learnerId=? AND g.memoryId=? AND g.kind='gap' ORDER BY e.answeredAt LIMIT 1",
      learnerId,
      memoryId,
    );
  }

  /* ───────────── C5: check questions ───────────── */

  /** Approved, unexpired check questions of a memory that were never given to the learner. */
  unservedChecks(learnerId: string, memoryId: string, now = this.clock()): GeneratedRow[] {
    return this.db
      .getAllSync<Parameters<PersonalizationStore["parse"]>[0]>(
        `SELECT ${PersonalizationStore.columns} FROM generated_questions g WHERE learnerId=? AND memoryId=? AND kind='check' AND status='approved' AND expiresAt>? AND NOT EXISTS (SELECT 1 FROM check_assignments a WHERE a.learnerId=g.learnerId AND a.quizId='ai:'||g.id) ORDER BY createdAt`,
        learnerId,
        memoryId,
        now,
      )
      .map((r) => this.parse(r));
  }
  /** Today's check slot, answered or not. */
  checkSlot(learnerId: string, date: string) {
    return this.db.getFirstSync<{ sessionId: string; quizId: string; memoryId: string; assignedAt: number }>(
      "SELECT sessionId,quizId,memoryId,assignedAt FROM check_assignments WHERE learnerId=? AND localDate=?",
      learnerId,
      date,
    );
  }
  /**
   * Takes the day's single check slot and counts it as served. Inside the caller's
   * transaction; false when the slot or today's served quota is already used.
   */
  claimCheckSlot(learnerId: string, date: string, sessionId: string, quizId: string, memoryId: string) {
    if (this.checkSlot(learnerId, date)) return false;
    if (!this.reserveIn(learnerId, "checkServedCount", LIMITS.checkServedPerDay)) return false;
    this.db.runSync(
      "INSERT INTO check_assignments VALUES (?,?,?,?,?,?)",
      learnerId,
      date,
      sessionId,
      quizId,
      memoryId,
      this.clock(),
    );
    return true;
  }
  /**
   * A graded check answer becomes check-right/check-wrong evidence of its memory, once per
   * attempt. The attempt is marked processed so the extractor does not count it again.
   * Inside the caller's transaction.
   */
  recordCheck(learnerId: string, memoryId: string, attemptId: string, quizId: string, correct: boolean, at: number) {
    const m = this.db.getFirstSync<{ status: MemoryStatus }>(
      "SELECT status FROM confusion_memories WHERE id=? AND learnerId=?",
      memoryId,
      learnerId,
    );
    this.db.runSync("INSERT OR IGNORE INTO evidence_checkpoints VALUES (?,?,?,?,0)", learnerId, "attempt", attemptId, at);
    if (!m || m.status === "archived") return false;
    const added = this.db.runSync(
      "INSERT OR IGNORE INTO confusion_evidence VALUES (?,?,?,?,?,?,?,?,?,?)",
      this.uuid(),
      memoryId,
      learnerId,
      "attempt",
      attemptId,
      "1",
      quizId,
      localDate(at),
      at,
      correct ? "check-right" : "check-wrong",
    ).changes;
    if (added !== 1) return false;
    this.db.runSync(
      "UPDATE confusion_memories SET lastCheckAt=?,lastEvidenceAt=MAX(lastEvidenceAt,?),revision=revision+1 WHERE id=?",
      at,
      at,
      memoryId,
    );
    this.restatus(memoryId);
    return true;
  }
  /** What the 7-day coach may know: active memories as short summaries, never chat text. */
  planMemories(learnerId: string, subjectId: string, now = this.clock()) {
    return this.memories(learnerId, subjectId)
      .filter((m) => m.status === "active")
      .slice(0, LIMITS.memoriesForPlan)
      .map((m) => ({
        conceptId: m.conceptId,
        summary: m.summary,
        status: m.status,
        evidence: this.db
          .getAllSync<{ evidenceType: string }>(
            "SELECT DISTINCT evidenceType FROM confusion_evidence WHERE memoryId=? ORDER BY evidenceType",
            m.id,
          )
          .map((r) => r.evidenceType),
        daysSinceLast: Math.floor((now - m.lastEvidenceAt) / 86_400_000),
      }));
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
