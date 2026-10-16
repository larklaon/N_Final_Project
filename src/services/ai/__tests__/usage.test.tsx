import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { UsageSummary } from "../../../components/UsageSummary";
import { getSiwc, type UsageSummary as Summary } from "../../../../modules/siwc-android";
jest.mock("../../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
jest.mock("../../../components/ui", () => {
  const { Text, View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Body: Text, Small: Text,
    Button: ({ label }: { label: string }) => <Text>{label}</Text>,
    Row: ({ label, value }: { label: string; value: string }) => <View><Text>{label}</Text><Text>{value}</Text></View>,
  };
});
const counts: Summary = { todayCompleted: 1, completed: 2, measured: 0, inputTokens: 0, outputTokens: 0 };
test("missing token usage is unknown, and a late old-account result never becomes the new account's summary", async () => {
  let resolveOld!: (v: Summary) => void;
  const getUsage = jest.fn((id: string) => id === "old" ? new Promise<Summary>((r) => { resolveOld = r; }) : Promise.resolve(counts));
  jest.mocked(getSiwc).mockReturnValue({ getUsage, addListener: () => ({ remove: jest.fn() }) } as unknown as ReturnType<typeof getSiwc>);
  const screen = render(<UsageSummary profileId="old" />);
  screen.rerender(<UsageSummary profileId="new" />);
  await waitFor(() => expect(screen.getByText("아직 정보 없음")).toBeTruthy());
  await act(async () => resolveOld({ ...counts, measured: 2, inputTokens: 9876 }));
  expect(screen.queryByText("9,876 토큰")).toBeNull();
  expect(screen.getByText("아직 정보 없음")).toBeTruthy();
});
test("read failure offers retry without inventing a zero count", async () => {
  jest.mocked(getSiwc).mockReturnValue({ getUsage: jest.fn().mockRejectedValue(Error("read")), addListener: () => ({ remove: jest.fn() }) } as unknown as ReturnType<typeof getSiwc>);
  const screen = render(<UsageSummary profileId="p" />);
  await waitFor(() => expect(screen.getByText("다시 불러오기")).toBeTruthy());
  expect(screen.queryByText("0회")).toBeNull();
});
