import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";
import { Onboarding } from "../Onboarding";
import { useApp } from "../../platform/AppProvider";
import { getSiwc } from "../../../modules/siwc-android";

const mockPush = jest.fn();
jest.mock("../../platform/AppProvider", () => ({ useApp: jest.fn() }));
jest.mock("../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../services/gap/sync", () => ({ enableGap: jest.fn() }));
jest.mock("../../components/SubjectList", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require("react-native");
  return { SubjectList: ({ onPick }: { onPick: (id: string) => void }) => <Pressable onPress={() => onPick("info-basic")}><Text>과목</Text></Pressable> };
});
jest.mock("../../components/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, View, Pressable } = require("react-native");
  const Wrap = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Copy = ({ children }: { children?: React.ReactNode }) => <Text>{children}</Text>;
  const Button = ({ label, onPress }: { label: string; onPress?: () => void }) => <Pressable onPress={onPress}><Text>{label}</Text></Pressable>;
  return { Band: Wrap, BandBody: Copy, BandLabel: Copy, DarkNote: Copy,
    DarkScreen: ({ children, header, footer }: { children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => <View>{header}{children}{footer}</View>,
    OptionRow: Button, PrimaryButton: Button, TextLink: Button };
});

function setup() {
  let n = 0;
  const repo = new LearningRepository(database(), () => `o-${++n}`, () => Date.UTC(2026, 9, 19, 3));
  const refreshAuth = jest.fn(async () => {});
  jest.mocked(useApp).mockReturnValue({ repo, snapshot: repo.snapshot(), now: 0, refresh: jest.fn(), auth: { status: "disconnected" },
    refreshAuth, profiles: [], gapError: null });
  const signIn = jest.fn(async () => ({ status: "authorizing" }));
  jest.mocked(getSiwc).mockReturnValue({ signIn } as unknown as ReturnType<typeof getSiwc>);
  return { repo, signIn, refreshAuth };
}

test("the intro does not call the app a fake study app, and connecting goes straight to sign-in", async () => {
  const { repo, signIn, refreshAuth } = setup();
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "동의하고 연결")?.onPress?.());
  const ui = render(<Onboarding />);
  expect(ui.queryByText(/착각/)).toBeNull();
  fireEvent.press(ui.getByText("다음"));
  fireEvent.press(ui.getByText("과목"));
  fireEvent.press(ui.getByText("다음"));
  fireEvent.press(ui.getByText("나중에"));
  await act(async () => {
    fireEvent.press(ui.getByText("ChatGPT 연결하기"));
  });
  expect(alert).toHaveBeenCalledWith("ChatGPT 연결 안내", expect.any(String), expect.any(Array));
  expect(signIn).toHaveBeenCalledWith(null, false);
  expect(mockPush).not.toHaveBeenCalled();
  expect(repo.snapshot().settings).toMatchObject({ onboarded: true });
  expect(repo.snapshot().settings.aiConsentAt).not.toBeNull();
  expect(refreshAuth).toHaveBeenCalled();
});

test("cancelling the connection notice keeps onboarding where it was", async () => {
  const { repo, signIn } = setup();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const ui = render(<Onboarding />);
  fireEvent.press(ui.getByText("다음"));
  fireEvent.press(ui.getByText("과목"));
  fireEvent.press(ui.getByText("다음"));
  fireEvent.press(ui.getByText("나중에"));
  fireEvent.press(ui.getByText("ChatGPT 연결하기"));
  expect(signIn).not.toHaveBeenCalled();
  expect(repo.snapshot().settings.onboarded).toBe(false);
});
