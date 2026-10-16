import * as Notifications from "expo-notifications";
import { database } from "../../../data/repositories/__tests__/database";
import { LearningRepository } from "../../../data/repositories/LearningRepository";
import { getGap, type GapConfig } from "../../../../modules/gap-android";
import type { GapEvent } from "../../../domain/types";
import { enableGap, mutateLearningWithGap, syncGap } from "../sync";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));
jest.mock("../../../../modules/gap-android", () => ({ getGap: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const granted = { granted: true } as Notifications.NotificationPermissionsStatus;

let repo: LearningRepository;
let configured: GapConfig[];
let pending: GapEvent[];
let acked: string[];
beforeEach(() => {
  jest.resetAllMocks();
  let id = 0;
  repo = new LearningRepository(database(), () => `fixture-${++id}`);
  configured = [];
  pending = [];
  acked = [];
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
  jest.mocked(getGap).mockReturnValue({
    configure: async (c) => {
      configured.push(c);
    },
    readEvents: async () => pending.filter((e) => !acked.includes(e.id)),
    ackEvents: async (ids) => {
      acked.push(...ids);
    },
    canPinWidget: async () => true,
    pinWidget: async () => true,
  });
});

test("the lock-screen card follows the toggle; the deck stays for the widget", async () => {
  repo.updateSettings({ gapEnabled: true, gapIntervalMinutes: 15 });
  await syncGap(repo);
  expect(configured.at(-1)).toMatchObject({
    enabled: true,
    learnerId: repo.activeLearner,
    intervalMinutes: 15,
    start: "07:00",
    end: "22:00",
  });
  expect(configured.at(-1)!.deck.length).toBeGreaterThan(0);
  repo.updateSettings({ gapEnabled: false });
  await syncGap(repo);
  expect(configured.at(-1)!.enabled).toBe(false);
  expect(configured.at(-1)!.deck.length).toBeGreaterThan(0);
});

test("without notification permission the card stays off even if enabled in settings", async () => {
  repo.updateSettings({ gapEnabled: true });
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
  await syncGap(repo);
  expect(configured.at(-1)!.enabled).toBe(false);
});

test("answers given outside the app are ingested once, then acknowledged", async () => {
  repo.updateSettings({ gapEnabled: true });
  pending = [
    {
      id: "native-1",
      learnerId: repo.activeLearner,
      questionId: "net-http-ox",
      selectedOptionId: repo.quiz("net-http-ox").correctOptionId,
      answeredAt: Date.now(),
    },
  ];
  await syncGap(repo);
  await syncGap(repo);
  expect(acked).toEqual(["native-1"]);
  expect(repo.snapshot().gapProgress["net-http"].seen).toBe(1);
  // The answered piece is no longer first in the fresh deck.
  expect(configured.at(-1)!.deck[0].conceptId).not.toBe("net-http");
});

test("erasing everything while a sync waits on permission leaves no old learner deck", async () => {
  repo.updateSettings({ gapEnabled: true });
  const old = repo.activeLearner;
  const gate = deferred<Notifications.NotificationPermissionsStatus>();
  const entered = deferred<void>();
  jest.mocked(Notifications.getPermissionsAsync).mockImplementationOnce(() => {
    entered.resolve();
    return gate.promise;
  });
  const first = syncGap(repo);
  await entered.promise;
  const erase = mutateLearningWithGap(repo, () => repo.eraseAll());
  gate.resolve(granted);
  await Promise.all([first, erase]);
  const last = configured.at(-1)!;
  expect(last.learnerId).not.toBe(old);
  expect(last.enabled).toBe(false);
  expect(last.deck.every((c) => c.learnerId === last.learnerId)).toBe(true);
});

test("answers already given are kept for the learner before a profile switch", async () => {
  const guest = repo.activeLearner;
  pending = [
    {
      id: "native-2",
      learnerId: guest,
      questionId: "db-primary-ox",
      selectedOptionId: "o",
      answeredAt: Date.now(),
    },
  ];
  await mutateLearningWithGap(repo, () => {
    repo.selectProfile("account-a");
    repo.selectProfile("account-b");
  });
  expect(repo.activeLearner).not.toBe(guest);
  expect(repo.snapshot(guest).gapProgress["db-primary"].seen).toBe(1);
  expect(configured.at(-1)!.learnerId).toBe(repo.activeLearner);
});

test("enabling asks for permission once and reports a refusal without turning cards on", async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
    canAskAgain: true,
  } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Notifications.NotificationPermissionsStatus);
  await expect(enableGap(repo)).rejects.toThrow("알림 권한");
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(repo.snapshot().settings.gapEnabled).toBe(false);
});

test("no native module (tests, Expo Go) is a silent no-op", async () => {
  jest.mocked(getGap).mockReturnValue(null);
  await expect(syncGap(repo)).resolves.toBeUndefined();
});
