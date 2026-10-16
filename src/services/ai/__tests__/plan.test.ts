import { database } from "../../../data/repositories/__tests__/database";
import { LearningRepository } from "../../../data/repositories/LearningRepository";
import { getSiwc, type AiEvent } from "../../../../modules/siwc-android";
import { requestPlan } from "../plan";

jest.mock("../../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));

const day = (note: string) => ({ focus: ["데이터베이스"], newCount: 3, reviewCount: 0, note });
function gateway(replies: string[], early: boolean) {
  let listener: (e: AiEvent) => void = () => {};
  let n = 0;
  const startResponse = jest.fn(async () => {
    const requestId = `r${++n}`;
    const text = replies[n - 1];
    const fire = () => listener({ requestId, type: "completed", text });
    if (early) fire();
    else setTimeout(fire, 0);
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
  return startResponse;
}
function setup() {
  let id = 0;
  const repo = new LearningRepository(database(), () => `s-${++id}`);
  repo.updateSettings({ onboarded: true, aiConsentAt: 1 });
  return repo;
}
const auth = { status: "ready" as const, profileId: "p" };
const models = [{ slug: "m", displayName: "M" }];

test.each([true, false])("a plan is requested, validated and saved (completed early=%s)", async (early) => {
  const repo = setup();
  const start = gateway([JSON.stringify({ summary: "DB부터", days: [day("키부터 볼게요")] })], early);
  const plan = await requestPlan(repo, auth, models);
  expect(plan.days[0].note).toBe("키부터 볼게요");
  expect(repo.plan()?.summary).toBe("DB부터");
  const sent = JSON.parse((start.mock.calls[0] as unknown as [string])[0]);
  expect(JSON.parse(sent.input[0].content)).toMatchObject({ subject: "정보처리기사 기초", dailyGoal: 5 });
});

test("a malformed answer is retried once", async () => {
  const repo = setup();
  const start = gateway(["잠시만요", JSON.stringify({ days: [day("두 번째")] })], false);
  await requestPlan(repo, auth, models);
  expect(start).toHaveBeenCalledTimes(2);
  expect(repo.plan()?.days[0].note).toBe("두 번째");
});

test("without connection or consent nothing is sent", async () => {
  const repo = setup();
  const start = gateway([], false);
  await expect(requestPlan(repo, { status: "disconnected" }, models)).rejects.toThrow("not_ready");
  repo.updateSettings({ aiConsentAt: null });
  await expect(requestPlan(repo, auth, models)).rejects.toThrow("not_ready");
  expect(start).not.toHaveBeenCalled();
});
