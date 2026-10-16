import React from "react";
import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
import { defaultSettings } from "../../../data/repositories/LearningRepository";
import type { LearningSnapshot, Concept } from "../../../domain/types";
import AiExplanation from "../../../../app/ai/[conceptId]";
import AuthReturn from "../../../../app/auth/return";
import { useApp } from "../../../platform/AppProvider";
import { getSiwc, type AiEvent } from "../../../../modules/siwc-android";
jest.mock("../../../platform/AppProvider", () => ({ useApp: jest.fn() }));
jest.mock("../../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
jest.mock("../useProfileModels", () => ({
  useProfileModels: () => ({
    models: [{ slug: "m", displayName: "M" }],
    error: "",
    retry: jest.fn(),
  }),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ conceptId: "c" }),
  useRouter: () => ({}),
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: jest.fn(async (_: string, s: string) => s),
}));
jest.mock("expo-notifications", () => ({}));
jest.mock("../../../components/ui", () => {
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
  };
});
const concept = (id: string, order: number): Concept => ({
  id,
  order,
  title: id,
  area: "db",
  oneLiner: "definition",
  explanation: "text",
  example: "example",
  prerequisiteIds: [],
  sourceRefs: [],
  contentVersion: 1,
  reviewStatus: "draft",
});
const base: LearningSnapshot = {
  learnerId: "a",
  settings: {
    ...defaultSettings,
    aiConsentAt: 1,
    selectedModel: "m",
    dailyGoal: 3,
    gapEnabled: true,
  },
  concepts: [concept("c", 1), concept("new", 2)],
  progress: {},
  gapProgress: {},
  attempts: [],
  memoryRevision: 0,
};
function context() {
  return {
    snapshot: base,
    repo: {
      activeLearner: "a",
      snapshot: () => base,
      readCache: () => null,
      cacheCompleted: jest.fn(),
    },
    auth: { status: "ready", profileId: "p" },
    refresh: jest.fn(),
    refreshAuth: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useApp>;
}
test.each([true, false])(
  "a follow-up keeps the prior answer when completed arrives early=%s",
  async (early) => {
    jest.mocked(useApp).mockReturnValue(context());
    let listener: (e: AiEvent) => void = () => {};
    let requestCount = 0;
    const startResponse = jest.fn(async (_request: string) => {
      const requestId = "r" + ++requestCount;
      if (early)
        listener({ requestId, type: "completed", text: "fixture explanation" });
      return { requestId };
    });
    jest.mocked(getSiwc).mockReturnValue({
      startResponse,
      addListener: (_: string, cb: typeof listener) => {
        listener = cb;
        return { remove: jest.fn() };
      },
      cancelResponse: jest.fn(),
    } as unknown as ReturnType<typeof getSiwc>);
    const ui = render(<AiExplanation />);
    fireEvent.press(ui.getByText("설명 생성"));
    await waitFor(() => expect(startResponse).toHaveBeenCalledTimes(1));
    if (!early)
      await act(async () =>
        listener({
          requestId: "r1",
          type: "completed",
          text: "fixture explanation",
        }),
      );
    await waitFor(() =>
      expect(ui.getByText("fixture explanation")).toBeTruthy(),
    );
    fireEvent.press(ui.getByText("추가 질문"));
    fireEvent.changeText(
      ui.getByLabelText("추가 질문"),
      "그 예시를 다시 설명해 주세요",
    );
    fireEvent.press(ui.getByText("설명 생성"));
    await waitFor(() => expect(startResponse).toHaveBeenCalledTimes(2));
    const request = JSON.parse(startResponse.mock.calls[1][0]);
    expect(request.input).toContainEqual({
      role: "assistant",
      content: "fixture explanation",
    });
  },
);
test("return screen should stop showing pending text when authentication is ready", async () => {
  jest.mocked(useApp).mockReturnValue(context());
  const ui = render(<AuthReturn />);
  await act(async () => {});
  expect(ui.queryByText("브라우저 인증 결과를 확인하고 있어요.")).toBeNull();
});

test.each([
  [{ status: "authorizing" }, "ChatGPT 연결 중"],
  [{ status: "connectedWithoutPlan" }, "계정이 연결됐어요"],
  [{ status: "ready", authOutcome: "failed" }, "연결하지 못했어요"],
  [{ status: "ready", authOutcome: "cancelled" }, "연결을 취소했어요"],
  [{ status: "reconnectRequired" }, "다시 연결해 주세요"],
] as const)("auth return reflects %j", async (auth, title) => {
  jest.mocked(useApp).mockReturnValue({ ...context(), auth });
  const ui = render(<AuthReturn />);
  await act(async () => {});
  expect(ui.getByText(title)).toBeTruthy();
});
