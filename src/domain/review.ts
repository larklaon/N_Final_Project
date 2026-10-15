export type Progress = { stage: number; revision: number; dueAt: number; gradedAttempts: number; correctAttempts: number; correctStreak: number; distinctCorrectDays: number; lastCorrectLocalDate: string | null; lastGradedLocalDate: string; lastQuizType: 'choice' | 'ox' };
export const DAY = 86_400_000;
const intervals = [1, 3, 7, 14, 30];
export function localDate(time: number): string {
 const d = new Date(time);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function occurrenceId(learner: string, concept: string, revision: number): string {
 return JSON.stringify([learner, concept, revision]);
}
export function advanceProgress(previous: Progress | undefined, correct: boolean, now: number, date: string, quizType: 'choice' | 'ox'): Progress {
 const stage = correct ? Math.min((previous?.stage ?? 0) + 1, 5) : 0;
 return { stage, revision: (previous?.revision ?? 0)+1, dueAt: now + (correct ? intervals[stage-1]*DAY : 600_000),
 gradedAttempts: (previous?.gradedAttempts ?? 0)+1, correctAttempts: (previous?.correctAttempts ?? 0)+(correct?1:0),
 correctStreak: correct ? (previous?.correctStreak ?? 0)+1 : 0,
 distinctCorrectDays: (previous?.distinctCorrectDays ?? 0)+(correct && previous?.lastCorrectLocalDate!==date ? 1:0),
 lastCorrectLocalDate: correct ? date : previous?.lastCorrectLocalDate ?? null, lastGradedLocalDate: date, lastQuizType: quizType };
}
export function canGrade(previous: Progress | undefined, revision: number, now: number): boolean {
 return (previous?.revision ?? 0)===revision && (!previous || previous.dueAt <= now);
}
