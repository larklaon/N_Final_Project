import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useProfileModels } from "../useProfileModels";
import {
  getSiwc,
  type AuthSnapshot,
  type ModelChoice,
} from "../../../../modules/siwc-android";
jest.mock("../../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test("late A results cannot replace B; disconnected accounts expose no previous list", async () => {
  const a = deferred<ModelChoice[]>(),
    b = deferred<ModelChoice[]>();
  const listModels = jest.fn((id: string) =>
    id === "a" ? a.promise : b.promise,
  );
  jest
    .mocked(getSiwc)
    .mockReturnValue({ listModels } as unknown as ReturnType<typeof getSiwc>);
  const refreshAuth = jest.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(
    ({ auth }: { auth: AuthSnapshot }) => useProfileModels(auth, refreshAuth),
    {
      initialProps: {
        auth: { status: "ready", profileId: "a" } as AuthSnapshot,
      },
    },
  );
  rerender({ auth: { status: "ready", profileId: "b" } });
  await act(async () => b.resolve([{ slug: "b-model", displayName: "B" }]));
  await act(async () => a.resolve([{ slug: "a-model", displayName: "A" }]));
  expect(result.current.models.map((m) => m.slug)).toEqual(["b-model"]);
  rerender({ auth: { status: "disconnected" } });
  expect(result.current.models).toEqual([]);
});
test("model failure refreshes terminal auth state and supports an explicit retry", async () => {
  const listModels = jest
    .fn()
    .mockRejectedValueOnce(Error("reconnect_required"))
    .mockResolvedValue([{ slug: "ok", displayName: "OK" }]);
  jest
    .mocked(getSiwc)
    .mockReturnValue({ listModels } as unknown as ReturnType<typeof getSiwc>);
  const refreshAuth = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useProfileModels({ status: "ready", profileId: "a" }, refreshAuth),
  );
  await waitFor(() => expect(result.current.error).not.toBe(""));
  expect(refreshAuth).toHaveBeenCalledTimes(1);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.models[0]?.slug).toBe("ok"));
  expect(result.current.error).toBe("");
});
