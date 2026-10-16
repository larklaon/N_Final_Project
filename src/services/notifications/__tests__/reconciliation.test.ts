import * as Notifications from "expo-notifications";
import { database } from "../../../data/repositories/__tests__/database";
import { LearningRepository } from "../../../data/repositories/LearningRepository";
import {
  reconcileNotifications,
  mutateLearningWithNotifications,
} from "../scheduler";
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let repo: LearningRepository;
let os: Map<string, Notifications.NotificationRequestInput>;
beforeEach(() => {
  jest.resetAllMocks();
  let id = 0;
  repo = new LearningRepository(database(), () => `fixture-${++id}`);
  repo.updateSettings({ notificationsEnabled: true });
  os = new Map();
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({
      granted: true,
    } as Notifications.NotificationPermissionsStatus);
  jest
    .mocked(Notifications.getAllScheduledNotificationsAsync)
    .mockImplementation(
      async () =>
        [...os].map(([identifier, n]) => ({
          identifier,
          content: n.content,
          trigger: n.trigger,
        })) as Notifications.NotificationRequest[],
    );
  jest
    .mocked(Notifications.scheduleNotificationAsync)
    .mockImplementation(async (n) => {
      os.set(n.identifier!, n);
      return n.identifier!;
    });
  jest
    .mocked(Notifications.cancelScheduledNotificationAsync)
    .mockImplementation(async (id) => {
      os.delete(id);
    });
});
test("whole-data deletion waits for pending permission work then leaves OS empty", async () => {
  const gate = deferred<Notifications.NotificationPermissionsStatus>();
  const entered = deferred<void>();
  jest.mocked(Notifications.getPermissionsAsync).mockImplementationOnce(() => {
    entered.resolve();
    return gate.promise;
  });
  const oldLearner = repo.activeLearner;
  const pending = reconcileNotifications(repo);
  await entered.promise;
  const deletion = mutateLearningWithNotifications(repo, () => repo.eraseAll());
  expect(repo.activeLearner).toBe(oldLearner);
  gate.resolve({
    granted: true,
  } as Notifications.NotificationPermissionsStatus);
  await Promise.all([pending, deletion]);
  expect(repo.activeLearner).not.toBe(oldLearner);
  expect(os.size).toBe(0);
  expect(repo.notificationJobs()).toEqual([]);
});
test("an OS schedule already in flight is cancelled after direct state invalidation", async () => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  jest
    .mocked(Notifications.scheduleNotificationAsync)
    .mockImplementationOnce(async (n) => {
      entered.resolve();
      await gate.promise;
      os.set(n.identifier!, n);
      return n.identifier!;
    });
  const pending = reconcileNotifications(repo);
  await entered.promise;
  repo.eraseAll();
  gate.resolve();
  await pending;
  expect(os.size).toBe(0);
  expect(repo.notificationJobs()).toEqual([]);
});
test("profile switch retains only active learner schedules and is idempotent", async () => {
  repo.selectProfile("a");
  await reconcileNotifications(repo);
  await mutateLearningWithNotifications(repo, () => {
    repo.selectProfile("b");
    repo.updateSettings({ notificationsEnabled: true });
  });
  const learner = repo.activeLearner;
  expect(os.size).toBeGreaterThan(0);
  expect(
    [...os.values()].every((n) => n.content.data?.learnerId === learner),
  ).toBe(true);
  const calls = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls
    .length;
  repo.queueNotifications();
  await reconcileNotifications(repo);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(calls);
});
test("reset remains off and permission denial leaves no schedules", async () => {
  await reconcileNotifications(repo);
  await mutateLearningWithNotifications(repo, () => repo.resetCurrent());
  expect(os.size).toBe(0);
  repo.queueNotifications();
  await reconcileNotifications(repo);
  expect(os.size).toBe(0);
  repo.updateSettings({ notificationsEnabled: true });
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({
      granted: false,
    } as Notifications.NotificationPermissionsStatus);
  await reconcileNotifications(repo);
  expect(os.size).toBe(0);
});
