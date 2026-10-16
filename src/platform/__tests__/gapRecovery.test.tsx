import React from "react";
import { Text, Pressable } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { database } from "../../data/repositories/__tests__/database";
import { AppProvider, useApp } from "../AppProvider";
import { syncGap } from "../../services/gap/sync";

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
jest.mock("../../services/gap/sync", () => ({
  syncGap: jest.fn(),
  withGapLock: async (_repo: unknown, action: () => Promise<void>) => action(),
}));
function Probe() {
  const { gapError, repo, refresh } = useApp();
  return (
    <>
      <Text>{gapError || "카드 오류 없음"}</Text>
      <Pressable
        onPress={() => {
          repo.updateSettings({ dailyGoal: 10 });
          refresh();
        }}
      >
        <Text>학습 변경</Text>
      </Pressable>
    </>
  );
}
test("a successful card sync after a learning change clears the earlier error without reopening the app", async () => {
  jest
    .mocked(SQLite.openDatabaseSync)
    .mockReturnValue(database() as unknown as SQLite.SQLiteDatabase);
  let failing = true;
  jest.mocked(syncGap).mockImplementation(async () => {
    if (failing) throw Error("fixture native failure");
  });
  const ui = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() =>
    expect(
      ui.getByText(
        "잠금 화면 카드를 준비하지 못했어요. 앱을 다시 열면 다시 시도해요.",
      ),
    ).toBeTruthy(),
  );
  failing = false;
  fireEvent.press(ui.getByText("학습 변경"));
  await waitFor(() => expect(ui.getByText("카드 오류 없음")).toBeTruthy());
});
