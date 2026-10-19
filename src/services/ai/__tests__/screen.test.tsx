import React from "react";
import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
import { defaultSettings } from "../../../data/repositories/LearningRepository";
import type { ChatMessage, LearningSnapshot, Concept } from "../../../domain/types";
import AiExplanation from "../../../../app/ai/[conceptId]";
import AuthReturn from "../../../../app/auth/return";
import { useApp } from "../../../platform/AppProvider";
import { getSiwc, type AiEvent } from "../../../../modules/siwc-android";
import { resetCoordinator } from "../requestCoordinator";
beforeEach(() => resetCoordinator());
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
  useLocalSearchParams: jest.fn(() => ({ conceptId: "c" })),
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
    Message: ({ text }: { text: string }) => <Text>{text}</Text>,
    IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityLabel={label} onPress={onPress} />
    ),
    Row: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    Segmented: ({
      options,
      onChange,
      format,
    }: {
      options: string[];
      onChange: (v: string) => void;
      format: (v: string) => string;
    }) => (
      <View>
        {options.map((o) => (
          <Pressable key={o} onPress={() => onChange(o)}>
            <Text>{format(o)}</Text>
          </Pressable>
        ))}
      </View>
    ),
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
  deep: "deep",
  subjectId: "info-basic",
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
  knowledge: {},
  attempts: [],
  memoryRevision: 0,
};
function context() {
  const chat: ChatMessage[] = [];
  let n = 0;
  return {
    snapshot: base,
    repo: {
      activeLearner: "a",
      learningScope: "scope-a",
      snapshot: () => base,
      onScopeChange: () => () => {},
      onAiConsentChange: () => () => {},
      chatMessages: () => [...chat],
      addChatMessage: (
        _learner: string,
        _concept: string,
        role: ChatMessage["role"],
        text: string,
        quote: string | null = null,
      ) => {
        const m = { id: `m${++n}`, role, text, quote, createdAt: n };
        chat.push(m);
        return m;
      },
      clearChat: jest.fn(),
    },
    auth: { status: "ready", profileId: "p" },
    refresh: jest.fn(),
    refreshAuth: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useApp>;
}
test.each([true, false])(
  "a follow-up sends the earlier answer when completed arrives early=%s",
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
      cancelResponse: jest.fn(async (requestId: string) => { listener({ requestId, type: "cancelled" }); }),
    } as unknown as ReturnType<typeof getSiwc>);
    const ui = render(<AiExplanation />);
    fireEvent.changeText(ui.getByLabelText("AI에게 보낼 메시지"), "쉽게 알려 줘");
    fireEvent.press(ui.getByLabelText("보내기"));
    await waitFor(() => expect(startResponse).toHaveBeenCalledTimes(1));
    if (!early)
      await act(async () =>
        listener({ requestId: "r1", type: "completed", text: "fixture explanation" }),
      );
    await waitFor(() => expect(ui.getByText("fixture explanation")).toBeTruthy());
    fireEvent.changeText(ui.getByLabelText("AI에게 보낼 메시지"), "그 예시를 다시 설명해 주세요");
    fireEvent.press(ui.getByLabelText("보내기"));
    await waitFor(() => expect(startResponse).toHaveBeenCalledTimes(2));
    const request = JSON.parse(startResponse.mock.calls[1][0]);
    expect(request.input).toContainEqual({ role: "assistant", content: "fixture explanation" });
    expect(request.input.at(-1)).toEqual({ role: "user", content: "그 예시를 다시 설명해 주세요" });
  },
);
test("a dragged passage travels with the question", async () => {
  const router = jest.requireMock("expo-router");
  router.useLocalSearchParams.mockReturnValue({ conceptId: "c", quote: "후보키 중 하나" });
  jest.mocked(useApp).mockReturnValue(context());
  const startResponse = jest.fn(async () => ({ requestId: "r1" }));
  let listener: (event: AiEvent) => void = () => {};
  jest.mocked(getSiwc).mockReturnValue({
    startResponse,
    addListener: (_: string, callback: typeof listener) => { listener = callback; return { remove: jest.fn() }; },
    cancelResponse: jest.fn(async (requestId: string) => { listener({ requestId, type: "cancelled" }); }),
  } as unknown as ReturnType<typeof getSiwc>);
  const ui = render(<AiExplanation />);
  expect(ui.getByText("후보키 중 하나")).toBeTruthy();
  fireEvent.press(ui.getByLabelText("보내기"));
  await waitFor(() => expect(startResponse).toHaveBeenCalledTimes(1));
  const request = JSON.parse((startResponse.mock.calls[0] as unknown as [string])[0]);
  expect(request.input.at(-1).content).toBe("「후보키 중 하나」\n\n이 부분이 이해가 안 돼요.");
  router.useLocalSearchParams.mockReturnValue({ conceptId: "c" });
});
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


test("busy start keeps the user's question and never adopts the plan response", async () => {
  const ctx = context();
  jest.mocked(useApp).mockReturnValue(ctx);
  let listener: (e: AiEvent) => void = () => {};
  const startResponse = jest.fn().mockRejectedValue(Object.assign(Error("native wrapper"), { code: "response_busy" }));
  const cancelResponse = jest.fn(async (requestId: string) => { listener({ requestId, type: "cancelled" }); });
  jest.mocked(getSiwc).mockReturnValue({ startResponse, cancelResponse,
    addListener: (_: string, cb: typeof listener) => { listener = cb; return { remove: jest.fn() }; },
  } as unknown as ReturnType<typeof getSiwc>);
  const ui = render(<AiExplanation />);
  fireEvent.changeText(ui.getByLabelText("AI에게 보낼 메시지"), "힌트를 줘");
  fireEvent.press(ui.getByLabelText("보내기"));
  await waitFor(() => expect(ui.getByText("다른 AI 요청을 처리하고 있어요. 잠시 뒤 다시 시도해 주세요.")).toBeTruthy());
  await act(async () => listener({ requestId: "plan-id", type: "completed", text: '{"days":[]}' }));
  expect(ctx.repo.chatMessages("c").map((m) => m.role)).toEqual(["user"]);
  expect(cancelResponse).not.toHaveBeenCalled();
});

test("a completed chat event after a reset cannot restore erased history before rerender", async () => {
  const ctx = context();
  let scopeChanged = () => {};
  jest.spyOn(ctx.repo, "onScopeChange").mockImplementation((listener) => {
    scopeChanged = listener;
    return () => {};
  });
  jest.mocked(useApp).mockReturnValue(ctx);
  let listener: (e: AiEvent) => void = () => {};
  const cancelResponse = jest.fn(async (requestId: string) => { listener({ requestId, type: "cancelled" }); });
  jest.mocked(getSiwc).mockReturnValue({
    startResponse: jest.fn(async () => ({ requestId: "chat-id" })), cancelResponse,
    addListener: (_: string, cb: typeof listener) => { listener = cb; return { remove: jest.fn() }; },
  } as unknown as ReturnType<typeof getSiwc>);
  const ui = render(<AiExplanation />);
  fireEvent.changeText(ui.getByLabelText("AI에게 보낼 메시지"), "설명해 줘");
  fireEvent.press(ui.getByLabelText("보내기"));
  await act(async () => {});
  act(() => {
    Object.defineProperty(ctx.repo, "learningScope", { value: "scope-reset", configurable: true });
    scopeChanged();
  });
  await act(async () => listener({ requestId: "chat-id", type: "completed", text: "stale explanation" }));
  expect(ctx.repo.chatMessages("c").some((m) => m.role === "assistant")).toBe(false);
  ui.rerender(<AiExplanation />);
  expect(cancelResponse).toHaveBeenCalledWith("chat-id");
});
