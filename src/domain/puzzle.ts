import { DAY, localDate } from "./review";
import { band, isComplete, visible } from "./resolution";
import type { LearningSnapshot, Quiz } from "./types";

export type PieceState = "none" | "seen" | "fitted";

/** Fitted = an app question answered correctly while graded. Seen = answered on a gap surface. */
export function pieceState(s: LearningSnapshot, conceptId: string): PieceState {
  if ((s.progress[conceptId]?.correctAttempts ?? 0) > 0) return "fitted";
  if ((s.gapProgress[conceptId]?.seen ?? 0) > 0) return "seen";
  return "none";
}

export type Piece = {
  conceptId: string;
  title: string;
  state: PieceState;
  /** Color step 0–5 from resolution. */
  band: number;
  percent: number;
  halfLife: number;
};
export type AreaPuzzle = {
  area: string;
  pieces: Piece[];
  fitted: number;
  seen: number;
  /** Mean visible resolution of the area, 0–100. */
  average: number;
};
export function resolutionOf(s: LearningSnapshot, conceptId: string, now: number) {
  const k = s.knowledge[conceptId];
  return {
    percent: k ? Math.round(visible(k, now)) : 0,
    band: band(k, now),
    halfLife: k?.h ?? 3,
    complete: !!k && isComplete(k, now),
  };
}

/** Areas keep curriculum order (by their first concept); clearest pieces first. */
export function puzzle(s: LearningSnapshot, now = Date.now()): AreaPuzzle[] {
  const areas = new Map<string, AreaPuzzle>();
  for (const c of s.concepts) {
    const a = areas.get(c.area) ?? {
      area: c.area,
      pieces: [],
      fitted: 0,
      seen: 0,
      average: 0,
    };
    const state = pieceState(s, c.id);
    const res = resolutionOf(s, c.id, now);
    a.pieces.push({
      conceptId: c.id,
      title: c.title,
      state,
      band: res.band,
      percent: res.percent,
      halfLife: res.halfLife,
    });
    if (state === "fitted") a.fitted++;
    if (state === "seen") a.seen++;
    areas.set(c.area, a);
  }
  return [...areas.values()].map((a) => ({
    ...a,
    average: Math.round(
      a.pieces.reduce((n, p) => n + p.percent, 0) / Math.max(1, a.pieces.length),
    ),
    pieces: [...a.pieces].sort((x, y) => y.percent - x.percent),
  }));
}

export function puzzleTotals(s: LearningSnapshot, now = Date.now()) {
  const all = puzzle(s, now);
  const pieces = all.flatMap((a) => a.pieces);
  return {
    total: s.concepts.length,
    fitted: all.reduce((n, a) => n + a.fitted, 0),
    seen: all.reduce((n, a) => n + a.seen, 0),
    average: Math.round(
      pieces.reduce((n, p) => n + p.percent, 0) / Math.max(1, pieces.length),
    ),
    complete: pieces.filter((p) => p.band === 5).length,
  };
}

/** The most recently seen gap piece this question leans on, for "this helped" moments. */
export function seenPieceUsed(
  s: LearningSnapshot,
  quiz: Pick<Quiz, "builtOn">,
): { conceptId: string; title: string; lastSeenAt: number } | null {
  let best: { conceptId: string; title: string; lastSeenAt: number } | null =
    null;
  for (const id of quiz.builtOn ?? []) {
    const at = s.gapProgress[id]?.lastSeenAt;
    if (!at || (s.gapProgress[id]?.seen ?? 0) === 0) continue;
    if (!best || at > best.lastSeenAt)
      best = {
        conceptId: id,
        title: s.concepts.find((c) => c.id === id)?.title ?? id,
        lastSeenAt: at,
      };
  }
  return best;
}

/** "오늘 오후", "어제", "3일 전" — coarse on purpose. */
export function whenSeen(at: number, now: number) {
  const days = Math.round(
    (new Date(localDate(now)).getTime() - new Date(localDate(at)).getTime()) /
      DAY,
  );
  if (days <= 0) return new Date(at).getHours() < 12 ? "오늘 오전" : "오늘 오후";
  if (days === 1) return "어제";
  return `${days}일 전`;
}
