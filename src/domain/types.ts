import type { Progress } from "./review";
import type { Knowledge } from "./resolution";
export type SourceRef = { title: string; url: string; checkedAt: string };
/** V4: where an AI-made question came from. Bundled questions have no origin. */
export type QuizOrigin = {
  kind: "generated";
  generatedId: string;
  memoryId: string | null;
  skillKey: string;
  basisId: string;
  basisVersion: number;
  factIds: string[];
};
export type Concept = {
  id: string;
  /** Which study pack this piece belongs to. */
  subjectId: string;
  area: string;
  order: number;
  title: string;
  oneLiner: string;
  explanation: string;
  example: string;
  /** Level 3: everything worth knowing for the exam. */
  deep: string;
  prerequisiteIds: string[];
  sourceRefs: SourceRef[];
  contentVersion: number;
  reviewStatus: string;
};
export type Quiz = {
  id: string;
  conceptId: string;
  type: "choice" | "ox";
  /** gap: glanceable card outside the app. app: deeper in-app question. */
  layer: "gap" | "app";
  prompt: string;
  /** Lock-screen wording that fits the collapsed card; same truth value as the prompt. */
  short?: string;
  context?: string;
  contextIsCode?: boolean;
  /** Concepts an app question leans on; seen gap pieces among them are surfaced. */
  builtOn?: string[];
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  sourceRefs: SourceRef[];
  contentVersion: number;
  origin?: QuizOrigin;
};
export type Settings = {
  /** The one subject being studied now (V3: one at a time). */
  subjectId: string | null;
  dailyGoal: number;
  gapEnabled: boolean;
  gapIntervalMinutes: number;
  gapStart: string;
  gapEnd: string;
  /** "방해 금지": when off, cards may appear at any hour and the window is not applied. */
  quietEnabled: boolean;
  selectedModel: string | null;
  aiConsentAt: number | null;
  onboarded: boolean;
  planWelcomeDismissed?: boolean;
  /** V4 "AI 맞춤 학습": off until the learner turns it on, separate from aiConsentAt. */
  personalizationEnabled: boolean;
  personalizationConsentAt: number | null;
  personalizationConsentVersion: string | null;
};
export type Session = {
  id: string;
  learnerId: string;
  conceptId: string;
  quizId: string;
  options: Quiz["options"];
  occurrenceId: string;
  revision: number;
  practice: boolean;
  startedAt: number;
  answer?: { selected: string; correct: boolean; graded: boolean };
  /** V4: this session is today's check question for a confusion memory. */
  checkMemoryId?: string;
};
export type Attempt = {
  id: string;
  conceptId: string;
  quizId: string;
  correct: number;
  isGraded: number;
  answeredAt: number;
  localDate: string;
};
export type GapProgress = {
  stage: number;
  dueAt: number;
  seen: number;
  correct: number;
  lastSeenAt: number | null;
  lastType: "choice" | "ox" | null;
};
/** One answer given on a gap surface (lock-screen card or widget), recorded natively. */
export type GapEvent = {
  id: string;
  learnerId: string;
  questionId: string;
  selectedOptionId: string;
  answeredAt: number;
};
export type LearningSnapshot = {
  learnerId: string;
  settings: Settings;
  concepts: Concept[];
  progress: Record<string, Progress>;
  gapProgress: Record<string, GapProgress>;
  /** Resolution per piece of knowledge (concept id), V3. */
  knowledge: Record<string, Knowledge>;
  attempts: Attempt[];
  memoryRevision: number;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The passage the learner dragged out of an explanation, if any. */
  quote: string | null;
  createdAt: number;
};
