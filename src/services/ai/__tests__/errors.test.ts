import { aiErrorMessage } from "../errors";
test("temporary usage admission failure is not confused with exhausted quota", () => {
  expect(
    aiErrorMessage({
      requestId: "r",
      type: "failed",
      errorCode: "subscription_sharing_usage_unavailable",
      httpStatus: 503,
    }),
  ).toContain("잠시");
  expect(
    aiErrorMessage({
      requestId: "r",
      type: "failed",
      errorCode: "subscription_sharing_usage_limit_exceeded",
      httpStatus: 429,
    }),
  ).toContain("사용 한도");
});
test("policy and identity rejections offer appropriate recovery", () => {
  expect(
    aiErrorMessage({
      requestId: "r",
      type: "failed",
      errorCode: "subscription_sharing_user_not_eligible",
      httpStatus: 403,
    }),
  ).toContain("사용 가능한 계정");
  expect(
    aiErrorMessage({ requestId: "r", type: "failed", httpStatus: 401 }),
  ).toContain("플랜 사용 권한");
});
