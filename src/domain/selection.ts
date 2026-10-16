import { localDate } from "./review";
import type { LearningSnapshot } from "./types";
import { pickConcept, type Plan } from "./plan";
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
/** "조금 더 풀기": ignores the daily goal, then falls back to the next review as practice. */
export function extraConcept(s: LearningSnapshot, now: number) {
  return (
    dueConcepts(s, now)[0] ??
    s.concepts.find(
      (c) =>
        !s.progress[c.id] && c.prerequisiteIds.every((id) => !!s.progress[id]),
    ) ??
    s.concepts
      .filter((c) => s.progress[c.id])
      .sort((a, b) => s.progress[a.id].dueAt - s.progress[b.id].dueAt)[0] ??
    null
  );
}
/** Concepts answered correctly (graded) today, oldest first, for the day's closing line. */
export function fittedToday(s: LearningSnapshot, now: number) {
  const ids: string[] = [];
  for (const a of [...s.attempts].reverse())
    if (
      a.isGraded === 1 &&
      a.correct === 1 &&
      a.localDate === localDate(now) &&
      !ids.includes(a.conceptId)
    )
      ids.push(a.conceptId);
  return ids
    .map((id) => s.concepts.find((c) => c.id === id))
    .filter((c) => !!c);
}
/** Every concept that can be opened now (prerequisites met), in curriculum order. */
export function freshConcepts(s: LearningSnapshot) {
  return s.concepts.filter(
    (c) => !s.progress[c.id] && c.prerequisiteIds.every((id) => !!s.progress[id]),
  );
}
/**
 * V3 selection: the coach's plan (or a stable random pick without ChatGPT) chooses among
 * concepts that can be graded now. "조금 더 풀기" ignores the daily goal and falls back to practice.
 */
export function planConcept(
  s: LearningSnapshot,
  now: number,
  plan: Plan | null,
  extra: boolean,
) {
  if (!extra && dailyCount(s, now) >= s.settings.dailyGoal) return null;
  const picked = pickConcept(s, now, plan, {
    due: dueConcepts(s, now),
    fresh: freshConcepts(s),
  });
  if (picked || !extra) return picked;
  return (
    s.concepts
      .filter((c) => s.progress[c.id])
      .sort((a, b) => s.progress[a.id].dueAt - s.progress[b.id].dueAt)[0] ?? null
  );
}
