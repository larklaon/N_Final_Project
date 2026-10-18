import * as Notifications from "expo-notifications";
import { getGap } from "../../../modules/gap-android";
import { buildDeck } from "../../domain/gap";
import type { LearningRepository } from "../../data/repositories/LearningRepository";

// Native card state is mutated through one queue per repository, including
// destructive and profile operations, so an old learner's deck never comes back.
const queues = new WeakMap<LearningRepository, Promise<void>>();
export function withGapLock(
  repo: LearningRepository,
  action: () => Promise<void>,
) {
  const next = (queues.get(repo) ?? Promise.resolve()).then(action);
  queues.set(
    repo,
    next.catch(() => {}),
  );
  return next;
}

/** Pull answers given outside the app into SQLite, then acknowledge them. */
async function ingest(repo: LearningRepository) {
  const gap = getGap();
  if (!gap) return;
  const events = await gap.readEvents();
  if (!events.length) return;
  // Acknowledge only after the transaction commits; a crash in between replays safely.
  await gap.ackEvents(repo.ingestGapEvents(events));
}

async function syncNow(repo: LearningRepository): Promise<void> {
  const gap = getGap();
  if (!gap) return;
  await ingest(repo);
  for (let tries = 0; tries < 3; tries++) {
    const snapshot = repo.snapshot();
    const current = () =>
      repo.activeLearner === snapshot.learnerId &&
      repo.snapshot().memoryRevision === snapshot.memoryRevision;
    const permission = await Notifications.getPermissionsAsync();
    if (!current()) continue;
    const enabled = snapshot.settings.gapEnabled && permission.granted;
    const { settings } = snapshot;
    await gap.configure({
      enabled,
      learnerId: snapshot.learnerId,
      intervalMinutes: settings.gapIntervalMinutes,
      start: settings.gapStart,
      end: settings.gapEnd,
      // The widget is placed by the user and follows the deck even when the lock-screen card is off.
      deck: buildDeck(snapshot, repo.questions(), Date.now(), 30, repo.deckExtras(snapshot.learnerId)),
    });
    if (!current()) continue; // A newer state replaces this deck on the next pass.
    const job = repo
      .notificationJobs()
      .find((j) => j.learnerId === snapshot.learnerId);
    if (job) repo.markGapSynced(snapshot.learnerId, job.revision);
    return;
  }
}

export function syncGap(repo: LearningRepository): Promise<void> {
  return withGapLock(repo, () => syncNow(repo));
}

/** Wait for prior native work before deleting or switching its owning learner. */
export function mutateLearningWithGap(
  repo: LearningRepository,
  action: () => void | Promise<void>,
): Promise<void> {
  return withGapLock(repo, async () => {
    try {
      await ingest(repo); // Answers already given still belong to the current learner.
      await action();
    } finally {
      repo.queueNotifications();
      await syncNow(repo);
    }
  });
}

export async function enableGap(repo: LearningRepository) {
  let p = await Notifications.getPermissionsAsync();
  if (!p.granted && p.canAskAgain)
    p = await Notifications.requestPermissionsAsync();
  if (!p.granted)
    throw Error(
      "알림 권한이 꺼져 있어 카드를 놓을 수 없어요. Android 설정에서 허용해 주세요.",
    );
  repo.updateSettings({ gapEnabled: true });
  await syncGap(repo);
}

/** V4 "이 카드 숨기기": commit the hide, then rebuild the native deck without it. */
export function hideGeneratedCard(repo: LearningRepository, generatedId: string): Promise<void> {
  return mutateLearningWithGap(repo, () => {
    if (repo.personal.hide(repo.activeLearner, generatedId)) repo.touchLearner(repo.activeLearner);
  });
}
