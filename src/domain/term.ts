import type { Concept, Quiz } from "./types";

/**
 * Widget-only "which term is this?" questions, generated from the concepts themselves.
 * Prompt: the one-liner with its term hidden. Options: the term and three neighbours
 * from the same area, so the wrong ones are the plausible ones.
 */
const TERM = "~term";

/** One-liners that name the answer twice are rewritten by hand. */
const cues: Record<string, string> = {
  "net-stateless": "HTTP가 앞선 요청의 상태를 자동으로 기억하지 않는 성질이에요.",
  "sec-authn": "누구인지 확인하고, 무엇을 할 수 있는지 판단하는 두 단계예요.",
  "net-latency": "전달에 걸리는 시간과, 단위 시간에 전송할 수 있는 양이에요.",
  "sec-symmetric": "공유 비밀키를 쓰는 방식과, 공개키·개인키 쌍을 쓰는 방식이에요.",
  "sqld-groupby": "같은 값끼리 묶어 집계하고, 묶은 결과를 다시 거르는 두 절이에요.",
};

export const termId = (conceptId: string) => conceptId + TERM;
export const isTermId = (id: string) => id.endsWith(TERM);

/** Small stable hash so a concept always gets the same neighbours and order. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function shuffled<T>(items: T[], seed: string, key: (t: T) => string) {
  return [...items].sort((a, b) => hash(seed + key(a)) - hash(seed + key(b)));
}

export function cue(c: Concept) {
  if (cues[c.id]) return cues[c.id];
  let s = c.oneLiner.replace(/^.{1,14}?[은는] /, "이것은 ");
  for (const t of [c.title].filter((t) => s.includes(t))) s = s.split(t).join("○○");
  return s;
}

export function termQuestion(c: Concept, concepts: Concept[]): Quiz | null {
  const others = concepts.filter(
    (o) => o.id !== c.id && o.area === c.area && o.subjectId === c.subjectId,
  );
  if (others.length < 3) return null;
  const picks = shuffled(others, c.id, (o) => o.id).slice(0, 3);
  return {
    id: termId(c.id),
    conceptId: c.id,
    type: "choice",
    layer: "gap",
    prompt: cue(c),
    options: shuffled([c, ...picks], c.id + "/order", (o) => o.id).map((o) => ({
      id: o.id,
      text: o.title,
    })),
    correctOptionId: c.id,
    explanation: c.oneLiner,
    sourceRefs: c.sourceRefs,
    contentVersion: 1,
  };
}
