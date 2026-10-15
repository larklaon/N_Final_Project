import { localDate } from "./review";
import type { LearningSnapshot } from "./types";
export function dailyCount(s: LearningSnapshot, now: number) {
  return new Set(
    s.attempts
      .filter((a) => a.isGraded === 1 && a.localDate === localDate(now))
      .map((a) => a.conceptId),
  ).size;
}
export function dueConcepts(s: LearningSnapshot, now: number) {
  return s.concepts
    .filter((c) => s.progress[c.id] && s.progress[c.id].dueAt <= now)
    .sort(
      (a, b) =>
        s.progress[a.id].dueAt - s.progress[b.id].dueAt ||
        s.progress[a.id].correctStreak - s.progress[b.id].correctStreak ||
        a.order - b.order,
    );
}
export function nextConcept(s: LearningSnapshot, now: number) {
  if (dailyCount(s, now) >= s.settings.dailyGoal) return null;
  return (
    dueConcepts(s, now)[0] ??
    s.concepts.find(
      (c) =>
        !s.progress[c.id] && c.prerequisiteIds.every((id) => !!s.progress[id]),
    ) ??
    null
  );
}
