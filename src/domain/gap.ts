import { DAY } from "./review";
import { shuffled, termQuestion } from "./term";
import type { Concept, GapProgress, LearningSnapshot, Quiz } from "./types";

const gapIntervals = [1, 3, 7];

/** Gap answers only steer gap cards and "seen" pieces; app grading is untouched. */
export function advanceGap(
  previous: GapProgress | undefined,
  correct: boolean,
  now: number,
  type: Quiz["type"],
): GapProgress {
  const stage = correct ? Math.min((previous?.stage ?? 0) + 1, 3) : 0;
  return {
    stage,
    dueAt: now + (correct ? gapIntervals[stage - 1] : 1) * DAY,
    seen: (previous?.seen ?? 0) + 1,
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
    lastSeenAt: now,
    lastType: type,
  };
}

/** A wrong app answer puts the piece back on the lock screen tomorrow. */
export function requeueGap(
  previous: GapProgress | undefined,
  now: number,
): GapProgress {
  return {
    stage: 0,
    dueAt: now + DAY,
    seen: previous?.seen ?? 0,
    correct: previous?.correct ?? 0,
    lastSeenAt: previous?.lastSeenAt ?? null,
    lastType: previous?.lastType ?? null,
  };
}

/** One question a surface can show for the card's piece. */
export type GapVariant = {
  questionId: string;
  type: Quiz["type"];
  prompt: string;
  options: Quiz["options"];
  correctOptionId: string;
  feedback: string;
};

export type GapCard = {
  cardId: string;
  learnerId: string;
  questionId: string;
  conceptId: string;
  conceptTitle: string;
  area: string;
  type: Quiz["type"];
  prompt: string;
  options: Quiz["options"];
  correctOptionId: string;
  feedback: string;
  /** Same piece, other shapes: the widget picks one by its size (small: ox, larger: term). */
  variants: { ox?: GapVariant; term?: GapVariant };
};

function variant(q: Quiz, concept: Concept, seed: string): GapVariant {
  return {
    questionId: q.id,
    type: q.type,
    prompt: q.prompt,
    // Authored choices list the answer first; shuffle so the first button is not always right.
    options: q.type === "ox" ? q.options : shuffled(q.options, seed, (o) => o.id),
    correctOptionId: q.correctOptionId,
    feedback: q.explanation.length <= 120 ? q.explanation : concept.oneLiner,
  };
}

function pickQuestion(
  concept: Concept,
  progress: GapProgress | undefined,
  byConcept: Map<string, Quiz[]>,
) {
  const own = byConcept.get(concept.id) ?? [];
  // Start with O/X (easiest), then alternate so the same card is not repeated.
  const want = progress?.lastType === "ox" ? "choice" : "ox";
  return own.find((q) => q.type === want) ?? own[0];
}

/**
 * Cards the native side cycles through until the app opens again.
 * Order: due pieces, then unseen pieces in curriculum order, then the rest by due time.
 */
export function buildDeck(
  s: LearningSnapshot,
  questions: Quiz[],
  now: number,
  size = 30,
): GapCard[] {
  const byConcept = new Map<string, Quiz[]>();
  for (const q of questions)
    if (q.layer === "gap")
      byConcept.set(q.conceptId, [...(byConcept.get(q.conceptId) ?? []), q]);
  const gp = s.gapProgress;
  const due = s.concepts
    .filter((c) => gp[c.id] && gp[c.id].dueAt <= now)
    .sort((a, b) => gp[a.id].dueAt - gp[b.id].dueAt || a.order - b.order);
  const unseen = s.concepts.filter((c) => !gp[c.id]);
  const later = s.concepts
    .filter((c) => gp[c.id] && gp[c.id].dueAt > now)
    .sort((a, b) => gp[a.id].dueAt - gp[b.id].dueAt || a.order - b.order);
  const cards: GapCard[] = [];
  for (const concept of [...due, ...unseen, ...later]) {
    if (cards.length >= size) break;
    const q = pickQuestion(concept, gp[concept.id], byConcept);
    if (!q) continue;
    const cardId = `${s.learnerId}:${s.memoryRevision}:${cards.length}`;
    const { questionId, ...main } = variant(q, concept, cardId);
    const ox = (byConcept.get(concept.id) ?? []).find((x) => x.type === "ox");
    const term = termQuestion(concept, s.concepts);
    cards.push({
      cardId,
      learnerId: s.learnerId,
      questionId,
      conceptId: concept.id,
      conceptTitle: concept.title,
      area: concept.area,
      ...main,
      variants: {
        ox: ox && variant(ox, concept, cardId),
        term: term ? variant(term, concept, cardId) : undefined,
      },
    });
  }
  return cards;
}

/** HH:MM inside [start, end). Used to validate settings and mirror native gating. */
export function withinWindow(time: Date, start: string, end: string) {
  const hm = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  return hm >= start && hm < end;
}
