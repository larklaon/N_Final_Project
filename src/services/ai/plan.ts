import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthSnapshot, ModelChoice } from "../../../modules/siwc-android";
import { runRequest } from "./requestCoordinator";
import { packOf } from "../../data/content/packs";
import type { LearningRepository } from "../../data/repositories/LearningRepository";
import { needsPlan, parsePlan, planInput, planInstructions, type Plan } from "../../domain/plan";

/** Asks the coach for the next seven days and stores the plan. One retry on a malformed answer. */
export async function requestPlan(
  repo: LearningRepository,
  auth: AuthSnapshot,
  models: ModelChoice[],
  now = Date.now(),
  signal?: AbortSignal,
): Promise<Plan> {
  const scope = repo.learningScope;
  const snapshot = repo.snapshot();
  if (auth.status !== "ready" || !auth.profileId || !snapshot.settings.aiConsentAt)
    throw Error("not_ready");
  const model =
    snapshot.settings.selectedModel && models.some((m) => m.slug === snapshot.settings.selectedModel)
      ? snapshot.settings.selectedModel
      : models[0]?.slug;
  if (!model) throw Error("no_model");
  const learner = snapshot.learnerId;
  const subject = packOf(snapshot.settings.subjectId).id;
  const input = [
    { role: "user" as const, content: JSON.stringify(planInput(snapshot, now, repo.plan())) },
  ];
  const controller = new AbortController();
  const abort = () => controller.abort();
  const unsubscribe = repo.onScopeChange(abort);
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) abort();
  const assertCurrent = () => {
    if (controller.signal.aborted || repo.learningScope !== scope || !repo.snapshot().settings.aiConsentAt)
      throw Error("plan_invalidated");
  };
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      assertCurrent();
      const text = await runRequest("plan", {
        profileId: auth.profileId,
        model,
        instructions: planInstructions,
        input,
      }, controller.signal);
      assertCurrent();
      let plan: Plan;
      try {
        plan = parsePlan(text, snapshot, now);
      } catch (e) {
        lastError = e;
        continue; // Retry only malformed output, never a stale or refused save.
      }
      if (!repo.savePlan(learner, subject, plan, scope)) throw Error("plan_invalidated");
      return plan;
    }
    throw lastError;
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Keeps a fresh 7-day plan around while ChatGPT is usable. Requests when one day is left
 * or when extra study used up the plan; throttled so a failure does not loop.
 */
export function usePlan(
  repo: LearningRepository,
  auth: AuthSnapshot,
  models: ModelChoice[],
  revision: number,
  onSaved: () => void,
) {
  const [plan, setPlan] = useState<Plan | null>(() => repo.plan());
  const [planning, setPlanning] = useState(false);
  const lastTry = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const ready = auth.status === "ready" && models.length > 0;
  const ensure = useCallback(
    (force = false) => {
      const current = repo.plan();
      const now = Date.now();
      if (!ready || active.current) return;
      if (!force && !needsPlan(current, repo.snapshot(), now)) return;
      if (now - lastTry.current < 10 * 60_000) return;
      lastTry.current = now;
      const controller = new AbortController();
      const scope = repo.learningScope;
      active.current = controller;
      setPlanning(true);
      requestPlan(repo, auth, models, now, controller.signal)
        .then((p) => {
          if (active.current !== controller || repo.learningScope !== scope) return;
          setPlan(p);
          onSaved();
        })
        .catch(() => {})
        .finally(() => {
          if (active.current !== controller) return;
          active.current = null;
          setPlanning(false);
        });
    },
    [repo, auth, models, ready, onSaved],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      setPlan(repo.plan());
      ensure();
    }, 0);
    return () => clearTimeout(t);
  }, [repo, revision, ensure]);
  return { plan, planning, ensure };
}
