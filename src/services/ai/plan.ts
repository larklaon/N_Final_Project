import { useCallback, useEffect, useRef, useState } from "react";
import { getSiwc, type AiEvent, type AuthSnapshot, type ModelChoice } from "../../../modules/siwc-android";
import { packOf } from "../../data/content/packs";
import type { LearningRepository } from "../../data/repositories/LearningRepository";
import { needsPlan, parsePlan, planInput, planInstructions, type Plan } from "../../domain/plan";

/** Runs one Responses request and resolves with the completed text. */
function complete(request: object, timeoutMs = 90_000): Promise<string> {
  const gateway = getSiwc();
  return new Promise((resolve, reject) => {
    let requestId: string | null = null;
    const early: AiEvent[] = [];
    let text = "";
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      sub.remove();
      fn();
    };
    const handle = (e: AiEvent) => {
      if (requestId === null) return void early.push(e);
      if (e.requestId !== requestId) return;
      if (e.type === "delta") text += e.text ?? "";
      if (e.type === "completed") finish(() => resolve(e.text ?? text));
      if (e.type === "failed" || e.type === "cancelled")
        finish(() => reject(Error(e.code ?? e.type)));
    };
    const sub = gateway.addListener("onResponse", handle);
    const timer = setTimeout(() => {
      if (requestId) void gateway.cancelResponse(requestId);
      finish(() => reject(Error("plan_timeout")));
    }, timeoutMs);
    gateway.startResponse(JSON.stringify(request)).then(
      (r) => {
        requestId = r.requestId;
        // Completion can arrive before the start promise resolves.
        for (const e of early.splice(0)) handle(e);
      },
      (err) => finish(() => reject(err)),
    );
  });
}

/** Asks the coach for the next seven days and stores the plan. One retry on a malformed answer. */
export async function requestPlan(
  repo: LearningRepository,
  auth: AuthSnapshot,
  models: ModelChoice[],
  now = Date.now(),
): Promise<Plan> {
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete({
      profileId: auth.profileId,
      model,
      instructions: planInstructions,
      input,
    });
    try {
      const plan = parsePlan(text, snapshot, now);
      repo.savePlan(learner, subject, plan);
      return plan;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
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
  const ready = auth.status === "ready" && models.length > 0;
  const ensure = useCallback(
    (force = false) => {
      const current = repo.plan();
      const now = Date.now();
      if (!ready || planning) return;
      if (!force && !needsPlan(current, repo.snapshot(), now)) return;
      if (now - lastTry.current < 10 * 60_000) return;
      lastTry.current = now;
      setPlanning(true);
      requestPlan(repo, auth, models)
        .then((p) => {
          setPlan(p);
          onSaved();
        })
        .catch(() => {})
        .finally(() => setPlanning(false));
    },
    [repo, auth, models, ready, planning, onSaved],
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
