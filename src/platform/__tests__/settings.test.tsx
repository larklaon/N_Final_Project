import React from "react";
import { Alert } from "react-native";
import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
import Settings from "../../../app/settings";
import { getSiwc, type AuthStatus } from "../../../modules/siwc-android";
import { useApp } from "../AppProvider";
import { defaultSettings } from "../../data/repositories/LearningRepository";
jest.mock("../AppProvider", () => ({ useApp: jest.fn() }));
jest.mock("../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
jest.mock("../../services/ai/useProfileModels", () => ({
  useProfileModels: () => ({ models: [], error: "", retry: jest.fn() }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({}) }));
jest.mock("../../components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text, View, Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <View>{children}</View>
  );
  const Copy = ({ children }: { children: React.ReactNode }) => (
    <Text>{children}</Text>
  );
  const Button = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
  return {
    Screen: Wrap,
    Surface: Wrap,
    Heading: Copy,
    Body: Copy,
    Small: Copy,
    Button,
    Choice: Button,
    Message: Wrap,
    SectionLabel: Copy,
    Row: Wrap,
    Segmented: Wrap,
    Toggle: Wrap,
  };
});
afterEach(() => jest.restoreAllMocks());
test.each<[AuthStatus, string, boolean]>([
  ["connectedWithoutPlan", "ChatGPT 플랜 사용 허용", true],
  ["reconnectRequired", "Continue with ChatGPT", false],
])(
  "%s requests consent only for explicit plan enable",
  async (status, label, consent) => {
    const signIn = jest.fn().mockResolvedValue({ status: "authorizing" });
    jest
      .mocked(getSiwc)
      .mockReturnValue({ signIn } as unknown as ReturnType<typeof getSiwc>);
    jest.mocked(useApp).mockReturnValue({
      repo: { updateSettings: jest.fn() },
      snapshot: { learnerId: "a", settings: defaultSettings },
      auth: { status, profileId: "account" },
      profiles: [],
      refresh: jest.fn(),
      refreshAuth: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useApp>);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const ui = render(<Settings />);
    fireEvent.press(ui.getByText(label));
    await act(async () => {
      alert.mock.calls[0][2]![1].onPress!();
    });
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("account", consent),
    );
  },
);

test("a connected account shows no sign-in button, only adding another account", () => {
  jest.mocked(useApp).mockReturnValue({
    repo: { updateSettings: jest.fn() },
    snapshot: { learnerId: "a", settings: defaultSettings },
    auth: { status: "ready", profileId: "account" },
    profiles: [],
    refresh: jest.fn(),
    refreshAuth: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useApp>);
  const ui = render(<Settings />);
  expect(ui.queryByText("Continue with ChatGPT")).toBeNull();
  expect(ui.getByText("다른 ChatGPT 계정 추가")).toBeTruthy();
});
