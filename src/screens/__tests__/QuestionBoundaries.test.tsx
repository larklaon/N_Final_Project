import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";
import { QuestionScreen } from "../../screens/QuestionScreen";
import { useApp } from "../../platform/AppProvider";

jest.mock("../../platform/AppProvider", () => ({ useApp: jest.fn() }));
jest.mock("../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
jest.mock("../../services/ai/useProfileModels", () => ({ useProfileModels: () => ({ models: [] }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({}), useFocusEffect: () => {} }));
jest.mock("@expo/vector-icons/Ionicons", () => "Icon");
jest.mock("../../components/AskBar", () => ({ AskBar: () => null }));
jest.mock("../../components/ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, View, Pressable } = require("react-native");
  const Wrap = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Copy = ({ children }: { children?: React.ReactNode }) => <Text>{children}</Text>;
  const Button = ({ label, onPress }: { label: string; onPress?: () => void }) => <Pressable onPress={onPress}><Text>{label}</Text></Pressable>;
  return { Band: Wrap, BandBody: Copy, BandLabel: Copy, ContextBlock: Wrap, DarkNote: Wrap,
    DarkScreen: ({ children, header, footer }: { children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => <View>{header}{children}{footer}</View>,
    IconButton: Button, OptionRow: Button, PrimaryButton: Button, PuzzleMap: () => null,
    TextLink: Button, useReducedMotion: () => true };
});
const now = new Date(2026, 9, 18, 12).getTime();
function setup() {
  let n = 0;
  const db = database();
  const repo = new LearningRepository(db, () => `review-${++n}`, () => now);
  repo.installSubject("info-basic");
  repo.updateSettings({ onboarded: true, aiConsentAt: 1 });
  const refresh = jest.fn();
  const publish = () => jest.mocked(useApp).mockReturnValue({
    repo, snapshot: repo.snapshot(), now, refresh, auth: { status: "disconnected" },
    refreshAuth: async () => {}, profiles: [], gapError: null,
  });
  publish();
  return { repo, db, publish };
}
function answerVisible(ui: ReturnType<typeof render>, db: ReturnType<typeof database>) {
  const row = db.getFirstSync<{ data: string }>("SELECT data FROM learning_sessions ORDER BY rowid DESC LIMIT 1")!;
  const session = JSON.parse(row.data);
  fireEvent.press(ui.getByText(session.options[0].text));
  fireEvent.press(ui.getByText("확인"));
}
test("after answering, changing subject should immediately offer that subject's question", async () => {
  const { repo, db, publish } = setup();
  const ui = render(<QuestionScreen />);
  answerVisible(ui, db);
  repo.installSubject("sqld-taste"); publish();
  ui.rerender(<QuestionScreen />);
  expect(ui.queryByText("지금은 쉬어 가요.")).toBeNull();
  expect(ui.getByText("확인")).toBeTruthy();
});
test("after answering, reset should discard the displayed graded answer", () => {
  const { repo, db, publish } = setup();
  const ui = render(<QuestionScreen />);
  answerVisible(ui, db);
  repo.resetCurrent(); publish(); ui.rerender(<QuestionScreen />);
  expect(ui.queryByText("다음")).toBeNull();
  expect(ui.getByText("확인")).toBeTruthy();
});

test("switching away and back before rendering cannot revive a pinned answer", () => {
  const { repo, db, publish } = setup();
  const ui = render(<QuestionScreen />);
  answerVisible(ui, db);
  repo.installSubject("sqld-taste");
  repo.installSubject("info-basic");
  publish(); ui.rerender(<QuestionScreen />);
  expect(ui.queryByText("다음")).toBeNull();
  expect(ui.getByText("확인")).toBeTruthy();
});

test("ordinary settings and refresh preserve an answer until Next", () => {
  const { repo, db, publish } = setup();
  const ui = render(<QuestionScreen />);
  answerVisible(ui, db);
  repo.updateSettings({ dailyGoal: 10 });
  publish(); ui.rerender(<QuestionScreen />);
  expect(ui.getByText("다음")).toBeTruthy();
});
