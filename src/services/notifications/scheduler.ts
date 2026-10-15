import * as Notifications from "expo-notifications";
import { dailyCount, nextConcept } from "../../domain/selection";
import { localDate } from "../../domain/review";
import type { LearningSnapshot } from "../../domain/types";
import type { LearningRepository } from "../../data/repositories/LearningRepository";
export type Reminder = {
  id: string;
  fireAt: number;
  conceptId: string;
  fingerprint: string;
  learnerId: string;
  title: string;
};
export function planReminders(s: LearningSnapshot, now: number): Reminder[] {
  if (!s.settings.notificationsEnabled) return [];
  const selected =
    nextConcept(s, now) ??
    s.concepts.find((c) => s.progress[c.id]) ??
    s.concepts[0];
  if (!selected) return [];
  const result: Reminder[] = [];
  for (let day = 0; day < 7; day++) {
    const d = new Date(now);
    d.setDate(d.getDate() + day);
    for (const slot of s.settings.reminderSlots) {
      if (slot >= s.settings.quietStart || slot < s.settings.quietEnd) continue;
      const [h, m] = slot.split(":").map(Number);
      const at = new Date(d);
      at.setHours(h, m, 0, 0);
      if (
        at.getTime() <= now ||
        (day === 0 && dailyCount(s, now) >= s.settings.dailyGoal)
      )
        continue;
      const id = `teum:${s.learnerId}:${localDate(at.getTime())}:${slot}`;
      const fingerprint = JSON.stringify([
        at.getTime(),
        selected.id,
        selected.title,
      ]);
      result.push({
        id,
        fireAt: at.getTime(),
        conceptId: selected.id,
        fingerprint,
        learnerId: s.learnerId,
        title: selected.title,
      });
    }
  }
  return result;
}
let running: Promise<void> | null = null;
export function reconcileNotifications(
  repo: LearningRepository,
): Promise<void> {
  if (running) return running;
  running = (async () => {
    for (let tries = 0; tries < 3; tries++) {
      const snapshot = repo.snapshot();
      const job = repo
        .notificationJobs()
        .find((j) => j.learnerId === snapshot.learnerId);
      if (!job) return;
      const permission = await Notifications.getPermissionsAsync();
      const desired = permission.granted
        ? planReminders(snapshot, Date.now())
        : [];
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const actual = new Map(
        scheduled
          .filter((n) => n.identifier.startsWith("teum:"))
          .map((n) => [n.identifier, n]),
      );
      for (const [id, n] of actual)
        if (
          !desired.some(
            (d) => d.id === id && d.fingerprint === n.content.data?.fingerprint,
          )
        )
          await Notifications.cancelScheduledNotificationAsync(id);
      for (const d of desired) {
        if (actual.get(d.id)?.content.data?.fingerprint === d.fingerprint)
          continue;
        await Notifications.scheduleNotificationAsync({
          identifier: d.id,
          content: {
            title: "잠깐, 한 개념만 익혀볼까요?",
            body: `오늘은 ${d.title}을 짧게 살펴봐요.`,
            data: {
              type: "learning",
              learnerId: d.learnerId,
              conceptId: d.conceptId,
              fingerprint: d.fingerprint,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(d.fireAt),
            channelId: "learning",
          },
        });
      }
      repo.markNotifications(
        snapshot.learnerId,
        job.revision,
        desired.map((d) => ({ id: d.id, fingerprint: d.fingerprint })),
      );
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
export async function enableReminders(repo: LearningRepository) {
  await Notifications.setNotificationChannelAsync("learning", {
    name: "틈지식 복습",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  let p = await Notifications.getPermissionsAsync();
  if (!p.granted && p.canAskAgain)
    p = await Notifications.requestPermissionsAsync();
  if (!p.granted)
    throw Error("알림 권한이 꺼져 있어요. Android 앱 설정에서 허용해 주세요.");
  repo.updateSettings({ notificationsEnabled: true });
  await reconcileNotifications(repo);
}
