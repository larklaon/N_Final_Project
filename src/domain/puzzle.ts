import { DAY, localDate } from "./review";
import type { LearningSnapshot, Quiz } from "./types";

export type PieceState = "none" | "seen" | "fitted";

/** Fitted = an app question answered correctly while graded. Seen = answered on a gap surface. */
export function pieceState(s: LearningSnapshot, conceptId: string): PieceState {
  if ((s.progress[conceptId]?.correctAttempts ?? 0) > 0) return "fitted";
  if ((s.gapProgress[conceptId]?.seen ?? 0) > 0) return "seen";
  return "none";
}

export type AreaPuzzle = {
  area: string;
  pieces: { conceptId: string; title: string; state: PieceState }[];
  fitted: number;
  seen: number;
};

/** Areas keep curriculum order (by their first concept); pieces fitted → seen → none. */
export function puzzle(s: LearningSnapshot): AreaPuzzle[] {
  const areas = new Map<string, AreaPuzzle>();
  for (const c of s.concepts) {
    const a = areas.get(c.area) ?? {
      area: c.area,
      pieces: [],
      fitted: 0,
      seen: 0,
    };
    const state = pieceState(s, c.id);
    a.pieces.push({ conceptId: c.id, title: c.title, state });
    if (state === "fitted") a.fitted++;
    if (state === "seen") a.seen++;
    areas.set(c.area, a);
  }
  const rank: Record<PieceState, number> = { fitted: 0, seen: 1, none: 2 };
  return [...areas.values()].map((a) => ({
    ...a,
    pieces: [...a.pieces].sort((x, y) => rank[x.state] - rank[y.state]),
  }));
}

export function puzzleTotals(s: LearningSnapshot) {
  const all = puzzle(s);
  return {
    total: s.concepts.length,
    fitted: all.reduce((n, a) => n + a.fitted, 0),
    seen: all.reduce((n, a) => n + a.seen, 0),
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
