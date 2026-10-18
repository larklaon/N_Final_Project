import { DAY } from "./review";
import { shuffled, termQuestion } from "./term";
import { LIMITS } from "./personalization";
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
  /** What the collapsed lock-screen card shows; the expanded card shows the full prompt. */
  short?: string;
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
  /**
   * Same piece, other shapes. The widget rotates through the ones its size can hold:
   * small ox; default term·ox; large term·choice·ox.
   */
  variants: { ox?: GapVariant; choice?: GapVariant; term?: GapVariant };
  /** V4: an AI-made card. The surfaces label it and skip it once it expires. */
  origin?: "ai";
  expiresAt?: number;
};

/** V4 inputs to the deck: approved AI cards, today's plan focus, concepts with open memories. */
export type DeckExtras = {
  generated: Quiz[];
  generatedExpiresAt: Record<string, number>;
  focus: string[];
  memoryConcepts: string[];
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

/**
 * The lock screen asks O/X: it fits two lines beside the keys and needs no expanding.
 * Choices and term questions live on the widget and in the app.
 */
function pickQuestion(concept: Concept, byConcept: Map<string, Quiz[]>) {
  const own = byConcept.get(concept.id) ?? [];
  return own.find((q) => q.type === "ox") ?? own[0];
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
  extras?: DeckExtras,
): GapCard[] {
  const byConcept = new Map<string, Quiz[]>();
  for (const q of questions)
    if (q.layer === "gap")
      byConcept.set(q.conceptId, [...(byConcept.get(q.conceptId) ?? []), q]);
  const gp = s.gapProgress;
  // The plan focus and open memories reorder only within the same bucket: a piece that is
  // not due yet never jumps ahead of an overdue one.
  const preferred = (c: Concept) =>
    extras && (extras.focus.includes(c.id) || extras.focus.includes(c.area) || extras.memoryConcepts.includes(c.id)) ? 0 : 1;
  const due = s.concepts
    .filter((c) => gp[c.id] && gp[c.id].dueAt <= now)
    .sort((a, b) => preferred(a) - preferred(b) || gp[a.id].dueAt - gp[b.id].dueAt || a.order - b.order);
  const unseen = s.concepts.filter((c) => !gp[c.id]).sort((a, b) => preferred(a) - preferred(b) || a.order - b.order);
  const later = s.concepts
    .filter((c) => gp[c.id] && gp[c.id].dueAt > now)
    .sort((a, b) => preferred(a) - preferred(b) || gp[a.id].dueAt - gp[b.id].dueAt || a.order - b.order);
  const cards: GapCard[] = [];
  for (const concept of [...due, ...unseen, ...later]) {
    if (cards.length >= size) break;
    const q = pickQuestion(concept, byConcept);
    if (!q) continue;
    const cardId = `${s.learnerId}:${s.memoryRevision}:${cards.length}`;
    const { questionId, ...main } = variant(q, concept, cardId);
    const own = byConcept.get(concept.id) ?? [];
    const ox = own.find((x) => x.type === "ox");
    const choice = own.find((x) => x.type === "choice");
    const term = termQuestion(concept, s.concepts);
    cards.push({
      cardId,
      short: q.short,
      learnerId: s.learnerId,
      questionId,
      conceptId: concept.id,
      conceptTitle: concept.title,
      area: concept.area,
      ...main,
      variants: {
        ox: ox && variant(ox, concept, cardId),
        choice: choice && variant(choice, concept, cardId),
        term: term ? variant(term, concept, cardId) : undefined,
      },
    });
  }
  return extras ? withGenerated(cards, s, extras, now) : cards;
}

/**
 * Puts AI cards in the place their concept already had, one per concept, at most
 * floor(N x 20%) of the final deck (none below 5 cards), never two in a row. The AI card is
 * the same O/X on the lock screen and every widget size (no term/choice variants).
 */
function withGenerated(cards: GapCard[], s: LearningSnapshot, extras: DeckExtras, now: number): GapCard[] {
  const n = cards.length;
  const allowed = n >= LIMITS.deckMinForGenerated ? Math.floor(n * LIMITS.deckShare) : 0;
  if (allowed === 0) return cards;
  const out = [...cards];
  const used = new Set<string>();
  let placed = 0;
  for (const q of extras.generated) {
    if (placed >= allowed) break;
    if (q.layer !== "gap" || q.type !== "ox" || used.has(q.conceptId)) continue;
    const expiresAt = extras.generatedExpiresAt[q.id];
    if (!expiresAt || expiresAt <= now) continue;
    const i = out.findIndex((c) => c.conceptId === q.conceptId);
    if (i < 0) continue;
    if (out[i - 1]?.origin === "ai" || out[i + 1]?.origin === "ai") continue;
    const concept = s.concepts.find((c) => c.id === q.conceptId)!;
    out[i] = {
      cardId: out[i].cardId,
      short: q.prompt,
      learnerId: s.learnerId,
      questionId: q.id,
      conceptId: q.conceptId,
      conceptTitle: concept.title,
      area: concept.area,
      type: "ox",
      prompt: q.prompt,
      options: q.options,
      correctOptionId: q.correctOptionId,
      feedback: q.explanation.length <= 120 ? q.explanation : concept.oneLiner,
      variants: {},
      origin: "ai",
      expiresAt,
    };
    used.add(q.conceptId);
    placed++;
  }
  return out;
}

/** HH:MM inside [start, end). Used to validate settings and mirror native gating. */
export function withinWindow(time: Date, start: string, end: string) {
  const hm = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  return hm >= start && hm < end;
}
