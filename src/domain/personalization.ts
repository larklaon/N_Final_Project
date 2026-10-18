import basisJson from "../data/content/generation-basis.json";
import { hash } from "./term";

/**
 * V4 personalization: confusion memories, AI-made gap cards and check questions.
 * Pure rules live here; storage is in LearningRepository, AI calls in services/ai.
 * The numbers are starting values from PLAN_V4 §2, not tested learning parameters.
 */
export const LIMITS = {
  gapApprovedPerDay: 3,
  /** Generated cards may fill at most this share of the final deck (floor), none below 5 cards. */
  deckShare: 0.2,
  deckMinForGenerated: 5,
  checkApprovedPerDay: 1,
  checkServedPerDay: 1,
  pipelineAttemptsPerDay: 2,
  /** Extraction + generation + independent review. */
  callsPerPipeline: 3,
  retryAfterMs: 10 * 60_000,
  idleBeforeWorkMs: 30_000,
  evidenceDays: 14,
  maxWrongAnswers: 20,
  maxChatMessages: 20,
  maxChatChars: 8000,
  memoriesPerConcept: 3,
  memoriesForPlan: 10,
  gapCardLifeMs: 14 * 86_400_000,
  checkAfterMs: 24 * 3_600_000,
  archiveAfterMs: 30 * 86_400_000,
  timeoutMs: 90_000,
  summaryChars: 120,
} as const;

export const CONSENT_VERSION = "v4-1";
export const PROMPT_VERSION = "v4-1";

export type MemoryStatus = "candidate" | "active" | "improving" | "resolved" | "archived";
export type EvidenceType = "wrong-answer" | "learner-statement";
export type SourceKind = "attempt" | "gap" | "chat";

export type BasisFact = {
  factId: string;
  text: string;
  condition: string;
  source: { title: string; url: string };
  checkedAt: string;
  status: "approved" | "excluded";
};
export type BasisSkill = { skillKey: string; label: string; factIds: string[] };
export type BasisConcept = { conceptId: string; skills: BasisSkill[]; facts: BasisFact[] };
export type Basis = { basisId: string; version: number; concepts: BasisConcept[] };

export const basis = basisJson as unknown as Basis;

/** Only these concepts may get memories and generated questions in V4. */
export function basisFor(conceptId: string): BasisConcept | null {
  return basis.concepts.find((c) => c.conceptId === conceptId) ?? null;
}
/** Facts by id across the whole basis; a pair confusion (stack–queue) cites both sides. */
export function factById(factId: string): BasisFact | null {
  for (const c of basis.concepts) {
    const f = c.facts.find((x) => x.factId === factId);
    if (f) return f;
  }
  return null;
}
/** The approved facts a concept's skills may cite. */
export function approvedFacts(conceptId: string): BasisFact[] {
  const ids = new Set(basisFor(conceptId)?.skills.flatMap((s) => s.factIds) ?? []);
  return [...ids].map(factById).filter((f): f is BasisFact => f?.status === "approved");
}
export function skillFor(conceptId: string, skillKey: string): BasisSkill | null {
  return basisFor(conceptId)?.skills.find((s) => s.skillKey === skillKey) ?? null;
}
/** A fact a question may cite: approved and listed under the memory's skill. */
export function factAllowed(conceptId: string, skillKey: string, factId: string) {
  const skill = skillFor(conceptId, skillKey);
  return !!skill?.factIds.includes(factId) && factById(factId)?.status === "approved";
}

/** Normalized text for duplicate detection: case, spaces and punctuation do not count. */
export function normalized(text: string) {
  return text.toLowerCase().replace(/[\s.,!?·:;"'()[\]{}~\-]/g, "");
}
export function contentHash(parts: string[]) {
  return parts.map((p) => hash(normalized(p)).toString(36)).join(".");
}
/** Stable fingerprint of a job's input, so a succeeded job with the same input is not rerun. */
export function fingerprint(parts: (string | number)[]) {
  return contentHash(parts.map(String));
}
