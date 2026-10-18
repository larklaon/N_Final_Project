import { database } from "../../../data/repositories/__tests__/database";
import { LearningRepository } from "../../../data/repositories/LearningRepository";
import { getSiwc, type AiEvent } from "../../../../modules/siwc-android";
import { requestPlan } from "../plan";
import { resetCoordinator } from "../requestCoordinator";

jest.mock("../../../../modules/siwc-android", () => ({ getSiwc: jest.fn() }));
beforeEach(() => resetCoordinator());

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

function deferredGateway() {
  let listener: (e: AiEvent) => void = () => {};
  const cancelResponse = jest.fn(async () => {});
  const remove = jest.fn();
  const startResponse = jest.fn(async () => ({ requestId: "pending-plan" }));
  jest.mocked(getSiwc).mockReturnValue({
    startResponse, cancelResponse,
    addListener: (_: string, cb: typeof listener) => { listener = cb; return { remove }; },
  } as unknown as ReturnType<typeof getSiwc>);
  return { startResponse, cancelResponse, remove,
    complete: (requestId = "pending-plan") => listener({ requestId, type: "completed",
      text: JSON.stringify({ summary: "학습 계획", days: [day("기본 개념")] }) }),
  };
}

test.each(["reset", "subject round trip", "profile round trip", "erase"])(
  "%s invalidates and cancels the pending plan; a fresh request still saves", async (boundary) => {
    const repo = setup();
    repo.selectProfile("p");
    const g = deferredGateway();
    const pending = requestPlan(repo, auth, models);
    const rejection = expect(pending).rejects.toThrow("plan_invalidated");
    await Promise.resolve();
    const scope = repo.learningScope;
    if (boundary === "reset") repo.resetCurrent();
    if (boundary === "subject round trip") {
      repo.installSubject("sqld-taste"); repo.installSubject("info-basic");
    }
    if (boundary === "profile round trip") {
      repo.selectProfile("other"); repo.selectProfile("p");
    }
    if (boundary === "erase") repo.eraseAll();
    expect(repo.learningScope).not.toBe(scope);
    g.complete(); // A queued native event arriving after cancellation is harmless.
    await rejection;
    expect(repo.plan()).toBeNull();
    expect(g.cancelResponse).toHaveBeenCalledWith("pending-plan");
    expect(g.remove).toHaveBeenCalledTimes(1);
    expect(g.startResponse).toHaveBeenCalledTimes(1);
    repo.updateSettings({ aiConsentAt: 1 });
    gateway([JSON.stringify({ days: [day("초기화 후")] })], true);
    await requestPlan(repo, auth, models);
    expect(repo.plan()).not.toBeNull();
  },
);

test("a reset before the native start promise resolves cancels only the late owned ID", async () => {
  const repo = setup();
  const g = deferredGateway();
  let started!: (r: { requestId: string }) => void;
  g.startResponse.mockImplementation(() => new Promise((resolve) => { started = resolve; }));
  const pending = requestPlan(repo, auth, models);
  const rejection = expect(pending).rejects.toThrow("plan_invalidated");
  repo.resetCurrent();
  await rejection;
  expect(g.cancelResponse).not.toHaveBeenCalled();
  started({ requestId: "late-owned-id" });
  await Promise.resolve();
  expect(g.cancelResponse).toHaveBeenCalledWith("late-owned-id");
  expect(repo.plan()).toBeNull();
});

test("ordinary learning changes do not invalidate a pending plan or accept another request's output", async () => {
  const repo = setup();
  const g = deferredGateway();
  const scope = repo.learningScope;
  const pending = requestPlan(repo, auth, models);
  await Promise.resolve();
  repo.updateSettings({ dailyGoal: 10 });
  expect(repo.learningScope).toBe(scope);
  g.complete("chat-id");
  expect(repo.plan()).toBeNull();
  g.complete();
  await pending;
  expect(repo.plan()?.summary).toBe("학습 계획");
  expect(g.cancelResponse).not.toHaveBeenCalled();
});

test("a refused save is never returned as a successful plan or retried", async () => {
  const repo = setup();
  jest.spyOn(repo, "savePlan").mockReturnValue(false);
  const start = gateway([JSON.stringify({ days: [day("거절")] })], true);
  await expect(requestPlan(repo, auth, models)).rejects.toThrow("plan_invalidated");
  expect(start).toHaveBeenCalledTimes(1);
});

test("busy rejection does not join or cancel another consumer's response", async () => {
  const repo = setup();
  const g = deferredGateway();
  g.startResponse.mockRejectedValue(Object.assign(Error("busy"), { code: "response_busy" }));
  await expect(requestPlan(repo, auth, models)).rejects.toThrow("busy");
  g.complete("chat-id");
  expect(repo.plan()).toBeNull();
  expect(g.cancelResponse).not.toHaveBeenCalled();
  expect(g.remove).toHaveBeenCalledTimes(1);
});
