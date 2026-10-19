import React from "react";
import { Alert, AppState } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import AskAi from "../../../../app/ai/[conceptId]";
import { useApp } from "../../../platform/AppProvider";
import { LearningRepository } from "../../../data/repositories/LearningRepository";
import { database } from "../../../data/repositories/__tests__/database";
import { getSiwc, type AiEvent } from "../../../../modules/siwc-android";
import { beginChat, resetCoordinator, runRequest } from "../requestCoordinator";
import { requestPlan } from "../plan";

jest.mock("../../../platform/AppProvider", () => ({ useApp: jest.fn() }));
jest.mock("../../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
jest.mock("../useProfileModels", () => ({ useProfileModels: () => ({ models: [{ slug: "m", displayName: "M" }] }) }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ conceptId: "ds-queue" }), useRouter: () => ({ back: jest.fn() }) }));
jest.mock("../../../components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable onPress={onPress}><Text>{label}</Text></Pressable>,
    IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable accessibilityLabel={label} onPress={onPress} />,
    Message: ({ text }: { text: string }) => <Text>{text}</Text>,
  };
});

beforeEach(() => resetCoordinator());
afterEach(() => { resetCoordinator(); jest.restoreAllMocks(); });

function setup() {
  let id = 0;
  const repo = new LearningRepository(database(), () => `final-${++id}`);
  repo.selectProfile("p");
  repo.updateSettings({ onboarded: true, aiConsentAt: 1 });
  const context = { repo, snapshot: repo.snapshot(), auth: { status: "ready", profileId: "p" }, refresh: jest.fn(), refreshAuth: jest.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof useApp>;
  jest.mocked(useApp).mockReturnValue(context);
  return repo;
}
function gateway() {
  const listeners = new Set<(event: AiEvent) => void>();
  const emit = (event: AiEvent) => [...listeners].forEach((listener) => listener(event));
  const startResponse = jest.fn(async (_: string) => ({ requestId: "chat-final" }));
  const cancelResponse = jest.fn(async (requestId: string) => { emit({ requestId, type: "cancelled" }); });
  jest.mocked(getSiwc).mockReturnValue({ startResponse, cancelResponse,
    addListener: (_: string, cb: (event: AiEvent) => void) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    },
  } as unknown as ReturnType<typeof getSiwc>);
  return { startResponse, cancelResponse, emit,
    complete: (requestId = "chat-final", text = "늦게 도착한 답변") => emit({ type: "completed", requestId, text }) };
}
function send(ui: ReturnType<typeof render>) {
  fireEvent.changeText(ui.getByLabelText("AI에게 보낼 메시지"), "큐를 쉽게 설명해 줘");
  fireEvent.press(ui.getByLabelText("보내기"));
}

test("FINAL-R1: withdrawing consent while a plan is queued prevents dispatch", async () => {
  const repo = setup();
  const g = gateway();
  g.startResponse.mockImplementation(async () => {
    queueMicrotask(() => g.complete());
    return { requestId: "chat-final" };
  });
  const release = await beginChat();
  const pending = requestPlan(repo, { status: "ready", profileId: "p" }, [{ slug: "m", displayName: "M" }]);
  const rejected = expect(pending).rejects.toThrow("plan_invalidated");
  repo.updateSettings({ aiConsentAt: null, personalizationEnabled: false });
  release();
  await rejected;
  expect(repo.plan()).toBeNull();
  expect(g.startResponse.mock.calls.length).toBe(0);
});

test("a changed dispatch guard drops queued payloads even without an abort event", async () => {
  setup();
  const g = gateway();
  const release = await beginChat();
  let permitted = true;
  const pending = runRequest("plan", { input: "private fixture" }, new AbortController().signal, undefined,
    { canDispatch: () => permitted });
  const rejected = expect(pending).rejects.toThrow("plan_invalidated");
  permitted = false;
  release();
  await rejected;
  expect(g.startResponse).not.toHaveBeenCalled();
});

test("consent withdrawal cancels an active plan and regrant does not revive its answer", async () => {
  const repo = setup();
  const g = gateway();
  const pending = requestPlan(repo, { status: "ready", profileId: "p" }, [{ slug: "m", displayName: "M" }]);
  const rejected = expect(pending).rejects.toThrow("plan_invalidated");
  await Promise.resolve();
  repo.updateSettings({ aiConsentAt: null });
  repo.updateSettings({ aiConsentAt: 2 });
  g.complete();
  await rejected;
  expect(g.cancelResponse).toHaveBeenCalledWith("chat-final");
  expect(repo.plan()).toBeNull();
});

test.each(["delete", "background", "consent", "reset", "unmount"])(
  "%s before the native ID arrives cancels only that late request", async (boundary) => {
    const repo = setup();
    const g = gateway();
    let started!: (value: { requestId: string }) => void;
    g.startResponse.mockImplementation(() => new Promise((resolve) => { started = resolve; }));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    let appChanged: (state: "background") => void = () => {};
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appChanged = listener;
      return { remove: jest.fn() };
    });
    const ui = render(<AskAi />);
    send(ui);
    await waitFor(() => expect(g.startResponse).toHaveBeenCalledTimes(1));
    if (boundary === "delete") {
      fireEvent.press(ui.getByLabelText("대화 지우기"));
      act(() => alert.mock.calls.at(-1)?.[2]?.find((b) => b.text === "지우기")?.onPress?.());
    }
    if (boundary === "background") act(() => appChanged("background"));
    if (boundary === "consent") act(() => repo.updateSettings({ aiConsentAt: null }));
    if (boundary === "reset") act(() => repo.resetCurrent());
    if (boundary === "unmount") ui.unmount();
    await act(async () => { started({ requestId: "late-owned" }); });
    await act(async () => g.complete("late-owned"));
    if (boundary !== "unmount") ui.unmount();
    expect(g.cancelResponse.mock.calls.map((call) => call[0])).toEqual(["late-owned"]);
    expect(repo.chatMessages("ds-queue").filter((m) => m.role === "assistant")).toHaveLength(0);
  },
);

test("a new chat waits for the cancelled request's late ID without cancelling the new owner", async () => {
  const repo = setup();
  const g = gateway();
  let started!: (value: { requestId: string }) => void;
  g.startResponse.mockImplementationOnce(() => new Promise((resolve) => { started = resolve; }))
    .mockResolvedValueOnce({ requestId: "new-owner" });
  const ui = render(<AskAi />);
  send(ui);
  await waitFor(() => expect(g.startResponse).toHaveBeenCalledTimes(1));
  fireEvent.press(ui.getByText("답변 멈추기"));
  send(ui);
  await act(async () => {});
  expect(g.startResponse).toHaveBeenCalledTimes(1);
  await act(async () => { started({ requestId: "old-owner" }); });
  await waitFor(() => expect(g.startResponse).toHaveBeenCalledTimes(2));
  await act(async () => { g.complete("old-owner", "옛 답변"); g.complete("new-owner", "새 답변"); });
  expect(repo.chatMessages("ds-queue").filter((m) => m.role === "assistant").map((m) => m.text)).toEqual(["새 답변"]);
  expect(g.cancelResponse.mock.calls.map((call) => call[0])).toEqual(["old-owner"]);
  ui.unmount();
});

test("FINAL-R2: deleting a conversation during a reply keeps the conversation empty", async () => {
  const repo = setup();
  const g = gateway();
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const ui = render(<AskAi />);
  send(ui);
  await waitFor(() => expect(g.startResponse).toHaveBeenCalledTimes(1));
  fireEvent.press(ui.getByLabelText("대화 지우기"));
  act(() => alert.mock.calls.at(-1)?.[2]?.find((b) => b.text === "지우기")?.onPress?.());
  expect(repo.chatMessages("ds-queue")).toHaveLength(0);
  await act(async () => g.complete());
  const messages = repo.chatMessages("ds-queue");
  ui.unmount();
  expect(messages).toHaveLength(0);
  expect(g.cancelResponse).toHaveBeenCalledWith("chat-final");
});

test("FINAL-R3: stop before the native start promise resolves cancels the late owned request", async () => {
  const repo = setup();
  const g = gateway();
  let started!: (value: { requestId: string }) => void;
  g.startResponse.mockImplementation(() => new Promise((resolve) => { started = resolve; }));
  const ui = render(<AskAi />);
  send(ui);
  await waitFor(() => expect(g.startResponse).toHaveBeenCalledTimes(1));
  fireEvent.press(ui.getByText("답변 멈추기"));
  await act(async () => { started({ requestId: "chat-final" }); });
  await act(async () => g.complete());
  const assistant = repo.chatMessages("ds-queue").filter((m) => m.role === "assistant");
  ui.unmount();
  expect({ cancelled: g.cancelResponse.mock.calls.map((call) => call[0]), assistantCount: assistant.length })
    .toEqual({ cancelled: ["chat-final"], assistantCount: 0 });
});
