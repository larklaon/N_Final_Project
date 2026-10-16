import React from "react";
import { Text, Pressable } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { database } from "../../data/repositories/__tests__/database";
import { AppProvider, useApp } from "../AppProvider";
import { reconcileNotifications } from "../../services/notifications/scheduler";

jest.mock("expo-sqlite", () => ({ openDatabaseSync: jest.fn() }));
jest.mock("expo-crypto", () => {
  let id = 0;
  return { randomUUID: () => `fixture-${++id}` };
});
jest.mock("../../../modules/siwc-android", () => ({
  getSiwc: () => ({
    getState: async () => ({ status: "disconnected" }),
    listProfiles: async () => [],
  }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: async () => null,
}));
jest.mock("../../services/notifications/scheduler", () => ({
  reconcileNotifications: jest.fn(),
  withNotificationLock: async (_repo: unknown, action: () => Promise<void>) =>
    action(),
  reminderDestination: jest.fn(),
}));
function Probe() {
  const { notificationError, refresh } = useApp();
  return (
    <>
      <Text>{notificationError || "예약 오류 없음"}</Text>
      <Pressable onPress={refresh}>
        <Text>학습 변경</Text>
      </Pressable>
    </>
  );
}
test("successful reconciliation after a learning change clears the earlier error without reopening the app", async () => {
  jest.mocked(SQLite.openDatabaseSync).mockReturnValue(database() as unknown as SQLite.SQLiteDatabase);
  let failing = true;
  jest.mocked(reconcileNotifications).mockImplementation(async () => {
    if (failing) throw Error("fixture OS failure");
  });
  const ui = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() =>
    expect(
      ui.getByText(
        "알림 일정을 준비하지 못했어요. 다음 실행 때 다시 시도해요.",
      ),
    ).toBeTruthy(),
  );
  failing = false;
  fireEvent.press(ui.getByText("학습 변경"));
  await waitFor(() => expect(ui.getByText("예약 오류 없음")).toBeTruthy());
});
