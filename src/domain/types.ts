import type { Progress } from "./review";
export type SourceRef = { title: string; url: string; checkedAt: string };
export type Concept = {
  id: string;
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
  context?: string;
  contextIsCode?: boolean;
  /** Concepts an app question leans on; seen gap pieces among them are surfaced. */
  builtOn?: string[];
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  sourceRefs: SourceRef[];
  contentVersion: number;
};
export type Settings = {
  dailyGoal: number;
  gapEnabled: boolean;
  gapIntervalMinutes: number;
  gapStart: string;
  gapEnd: string;
  selectedModel: string | null;
  aiConsentAt: number | null;
  onboarded: boolean;
  planWelcomeDismissed?: boolean;
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
