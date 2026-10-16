import { DAY } from "./review";
import type { Quiz } from "./types";

/**
 * How clearly one piece of knowledge is in the learner's head.
 * r: resolution 0–100 at lastAt. h: half-life in days (how fast it fades).
 */
export type Knowledge = {
  r: number;
  h: number;
  lastAt: number | null;
  lastCorrectAt: number | null;
};
export const freshKnowledge: Knowledge = {
  r: 0,
  h: 3,
  lastAt: null,
  lastCorrectAt: null,
};
const FLOOR = 0.4;
const H_MIN = 1;
const H_MAX = 60;
/** Base change per answer, scaled by the knowledge weight of the question. */
export const baseDelta = { ox: 8, choice: 12, app: 20 } as const;

/** Faded resolution now. Never below 40% of the last value: what was met leaves a trace. */
export function visible(k: Knowledge, now: number) {
  if (!k.lastAt) return k.r;
  const days = Math.max(0, now - k.lastAt) / DAY;
  return Math.max(k.r * Math.pow(0.5, days / k.h), k.r * FLOOR);
}

/** Questions move knowledge, not their own score. App questions lean on related pieces too. */
export function knowledgeWeights(q: Pick<Quiz, "conceptId" | "layer" | "builtOn">) {
  const others = (q.builtOn ?? []).filter((id) => id !== q.conceptId);
  if (q.layer !== "app" || others.length === 0)
    return [{ id: q.conceptId, weight: 1 }];
  return [
    { id: q.conceptId, weight: 0.7 },
    ...others.map((id) => ({ id, weight: 0.3 / others.length })),
  ];
}

export function deltaFor(q: Pick<Quiz, "layer" | "type">) {
  return q.layer === "app" ? baseDelta.app : baseDelta[q.type];
}

/**
 * Correct raises resolution, wrong lowers it, by the same amount.
 * Half-life only moves for the question's main knowledge (weight ≥ 0.5):
 * a correct answer at least a day after the previous correct doubles it, a wrong one halves it.
 * Same-day repeats raise resolution but not half-life: cramming does not last.
 */
export function applyAnswer(
  k: Knowledge,
  correct: boolean,
  amount: number,
  now: number,
  movesHalfLife: boolean,
): Knowledge {
  const base = visible(k, now);
  const r = Math.min(100, Math.max(0, base + (correct ? amount : -amount)));
  let h = k.h;
  if (movesHalfLife) {
    if (!correct) h = Math.max(H_MIN, h / 2);
    else if (k.lastCorrectAt !== null && now - k.lastCorrectAt >= DAY)
      h = Math.min(H_MAX, h * 2);
  }
  return {
    r: Math.round(r * 10) / 10,
    h,
    lastAt: now,
    lastCorrectAt: correct ? now : k.lastCorrectAt,
  };
}

export function isComplete(k: Knowledge, now: number) {
  return visible(k, now) >= 95 && k.h >= 30;
}

/** Color step 0–5. Any first correct answer lands on step 1, so progress shows early. */
export function band(k: Knowledge | undefined, now: number) {
  if (!k) return 0;
  if (isComplete(k, now)) return 5;
  const v = visible(k, now);
  if (v >= 75) return 4;
  if (v >= 50) return 3;
  if (v >= 25) return 2;
  if (v > 0) return 1;
  return 0;
}
