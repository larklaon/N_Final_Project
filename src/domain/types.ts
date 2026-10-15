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
  prerequisiteIds: string[];
  sourceRefs: SourceRef[];
  contentVersion: number;
  reviewStatus: string;
};
export type Quiz = {
  id: string;
  conceptId: string;
  type: "choice" | "ox";
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  sourceRefs: SourceRef[];
  contentVersion: number;
};
export type Settings = {
  dailyGoal: number;
  notificationsEnabled: boolean;
  reminderSlots: string[];
  quietStart: string;
  quietEnd: string;
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
export type LearningSnapshot = {
  learnerId: string;
  settings: Settings;
  concepts: Concept[];
  progress: Record<string, Progress>;
  attempts: Attempt[];
  memoryRevision: number;
};
