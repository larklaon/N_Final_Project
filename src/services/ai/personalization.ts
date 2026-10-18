import type { AuthSnapshot, ModelChoice } from "../../../modules/siwc-android";
import { packOf } from "../../data/content/packs";
import type { LearningRepository } from "../../data/repositories/LearningRepository";
import {
  LIMITS,
  RULES,
  checkTimingOk,
  approvedByReview,
  basis,
  contentInstructions,
  factById,
  fingerprint,
  memoryInstructions,
  parseContentCandidates,
  parseMemoryCandidates,
  reviewInput,
  reviewInstructions,
  skillFor,
  type GenerationTarget,
} from "../../domain/personalization";
import { localDate } from "../../domain/review";
import { runRequest } from "./requestCoordinator";

export type PersonalizationResult = {
  status: "skipped" | "succeeded" | "failed" | "cancelled";
  reason?: string;
  memoriesChanged: number;
  approvedGap: number;
  approvedCheck: number;
};
const skipped = (reason: string): PersonalizationResult => ({
  status: "skipped",
  reason,
  memoriesChanged: 0,
  approvedGap: 0,
  approvedCheck: 0,
});

/** Can this learner's memory get a check question now? (PLAN_V4 §8.2) */
export function checkReady(repo: LearningRepository, memoryId: string, now: number) {
  const learner = repo.activeLearner;
  const m = repo.personal.memory(learner, memoryId);
  if (!m || (m.status !== "active" && m.status !== "improving")) return false;
  const answer = repo.personal.firstCardAnswer(learner, memoryId);
  return checkTimingOk(answer?.answeredAt ?? null, m.lastCheckAt, now);
}

/** Which memories need a card or a check, within today's remaining quota. */
export function generationTargets(repo: LearningRepository, now: number): GenerationTarget[] {
  const learner = repo.activeLearner;
  const subject = packOf(repo.snapshot().settings.subjectId).id;
  const budget = repo.personal.budget(learner);
  let gapLeft = RULES.gapApprovedPerDay - budget.gapApprovedCount;
  let checkLeft = RULES.checkApprovedPerDay - budget.checkApprovedCount;
  const out: GenerationTarget[] = [];
  for (const m of repo.personal.memories(learner, subject)) {
    if (m.status !== "active" && m.status !== "improving") continue;
    const skill = skillFor(m.conceptId, m.skillKey);
    if (!skill) continue;
    const wantGap = gapLeft > 0 && repo.personal.forMemory(learner, m.id, "gap", now).length === 0;
    const wantCheck = checkLeft > 0 && checkReady(repo, m.id, now) && repo.personal.unservedChecks(learner, m.id, now).length === 0;
    if (!wantGap && !wantCheck) continue;
    if (wantGap) gapLeft--;
    if (wantCheck) checkLeft--;
    out.push({
      memoryId: m.id,
      conceptId: m.conceptId,
      skillKey: m.skillKey,
      summary: m.summary,
      facts: skill.factIds
        .map((id) => factById(id))
        .filter((f) => f?.status === "approved")
        .map((f) => ({ factId: f!.factId, text: f!.text, condition: f!.condition })),
      wantGap,
      wantCheck,
    });
  }
  return out;
}

/**
 * One foreground personalization pass: memory extraction → generation → independent review
 * → approval. At most three calls, two passes a day, nothing saved if the learner, subject,
 * scope or consent changed meanwhile. Failure leaves the bundled content as it is.
 */
export async function runPersonalization(
  repo: LearningRepository,
  auth: AuthSnapshot,
  models: ModelChoice[],
  signal: AbortSignal,
  now = Date.now(),
): Promise<PersonalizationResult> {
  const snapshot = repo.snapshot();
  const { settings } = snapshot;
  if (!settings.personalizationEnabled || !settings.personalizationConsentAt || !settings.aiConsentAt)
    return skipped("off");
  if (auth.status !== "ready" || !auth.profileId) return skipped("not_ready");
  const model = settings.selectedModel && models.some((m) => m.slug === settings.selectedModel) ? settings.selectedModel : models[0]?.slug;
  if (!model) return skipped("no_model");
  const owner = { learnerId: snapshot.learnerId, subjectId: packOf(settings.subjectId).id, scope: repo.learningScope, generation: repo.personal.generation(snapshot.learnerId) };
  const current = () => {
    const s = repo.snapshot().settings;
    return !signal.aborted && repo.personal.isOwnerCurrent(owner) && !!s.aiConsentAt && repo.learningScope === owner.scope && repo.activeLearner === owner.learnerId &&
      packOf(s.subjectId).id === owner.subjectId && s.personalizationEnabled && s.personalizationConsentAt === settings.personalizationConsentAt;
  };
  repo.personal.recoverInterrupted(owner.learnerId);
  repo.personal.archiveStale(owner.learnerId);
  repo.personal.expireOld(now);
  const last = repo.personal.lastJob(owner.learnerId);
  if (last?.status === "failed" && now - last.updatedAt < RULES.retryAfterMs) return skipped("retry_later");

  const input = repo.extractionInput();
  const targetsBefore = generationTargets(repo, now);
  if (input.evidence.length === 0 && targetsBefore.length === 0) return skipped("nothing_new");
  const fp = fingerprint([
    basis.version,
    localDate(now),
    ...input.evidence.map((e) => e.ref),
    ...repo.personal.memories(owner.learnerId, owner.subjectId).map((m) => `${m.id}:${m.status}:${m.lastEvidenceAt}`),
    ...targetsBefore.map((t) => `${t.memoryId}:${t.wantGap}:${t.wantCheck}`),
  ]);
  const job = repo.personal.startJob(owner, fp);
  if (!job) return skipped("already_done");
  if (!repo.personal.reserve(owner.learnerId, "pipelineAttempts", RULES.attemptsPerDay)) {
    repo.personal.finishJob(job, "cancelled", "daily_limit");
    return skipped("daily_limit");
  }

  const call = async (instructions: string, payload: object) => {
    if (!current()) throw Error("invalidated");
    if (!repo.personal.reserve(owner.learnerId, "dispatchCount", RULES.dispatchesPerDay))
      throw Error("daily_limit");
    const text = await runRequest(
      "background",
      { profileId: auth.profileId, model, instructions, input: [{ role: "user", content: JSON.stringify(payload) }] },
      signal,
      LIMITS.timeoutMs,
    );
    if (!current()) throw Error("invalidated");
    return text;
  };
  const result: PersonalizationResult = { status: "succeeded", memoriesChanged: 0, approvedGap: 0, approvedCheck: 0 };
  try {
    if (input.evidence.length > 0) {
      const text = await call(memoryInstructions, input);
      const changed = repo.personal.applyCandidates(owner, input, parseMemoryCandidates(text, input));
      if (changed === null) throw Error("invalidated");
      result.memoriesChanged = changed.length;
      if (changed.length) repo.markPlanDirty(owner.learnerId, owner.subjectId);
    }
    const targets = generationTargets(repo, now);
    if (targets.length > 0) {
      const text = await call(contentInstructions, { basisId: basis.basisId, targets });
      const drafts = parseContentCandidates(text, targets);
      // Development builds only: see why nothing passed the checks (never shipped to users).
      if (__DEV__ && drafts.length === 0) console.warn("[V4] no usable drafts", text.slice(0, 1500));
      if (drafts.length > 0) {
        const reviewText = await call(reviewInstructions, reviewInput(drafts));
        for (const { draft, review } of approvedByReview(reviewText, drafts)) {
          const saved = repo.personal.saveApproved(owner, {
            kind: draft.kind,
            conceptId: draft.conceptId,
            memoryId: draft.memoryId,
            skillKey: draft.skillKey,
            factIds: draft.factIds,
            prompt: draft.prompt,
            ...(draft.kind === "check" ? { context: draft.context, options: draft.options } : {}),
            correctOptionId: draft.kind === "gap" ? draft.answer : draft.correctOptionId,
            explanation: draft.explanation,
            model,
            review,
          });
          if (saved?.kind === "gap") result.approvedGap++;
          if (saved?.kind === "check") result.approvedCheck++;
        }
      }
    }
    repo.personal.finishJob(job, "succeeded");
    if (result.approvedGap || result.approvedCheck || result.memoriesChanged) repo.touchLearner(owner.learnerId);
    return result;
  } catch (e) {
    const code = e instanceof Error ? e.message : "failed";
    const cancelled = signal.aborted || code === "invalidated" || code === "plan_invalidated";
    repo.personal.finishJob(job, cancelled ? "cancelled" : "failed", code);
    return { ...result, status: cancelled ? "cancelled" : "failed", reason: code };
  }
}
