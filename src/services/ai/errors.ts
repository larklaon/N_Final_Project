import type { AiEvent } from "../../../modules/siwc-android";

export function aiErrorMessage(event: AiEvent): string {
  const code = event.errorCode || event.code;
  if (
    code === "subscription_sharing_usage_limit_exceeded" ||
    code === "usage_limit" ||
    event.httpStatus === 429
  )
    return "ChatGPT 사용 한도에 도달했어요. 사용량 관리에서 앱 사용량을 확인해 주세요.";
  if (code === "subscription_sharing_user_not_eligible")
    return "선택한 계정 또는 워크스페이스에서는 ChatGPT 플랜을 사용할 수 없어요. 설정에서 사용 가능한 계정을 선택해 주세요.";
  if (event.httpStatus === 403 || code === "permission_denied")
    return "이 요청은 계정 권한이나 서비스 정책에서 허용되지 않아요. ChatGPT 연결 설정을 확인해 주세요.";
  if (
    event.httpStatus === 401 ||
    code === "connection_check_required" ||
    code === "reconnect_required" ||
    code === "plan_permission_missing"
  )
    return "ChatGPT 계정과 플랜 사용 권한을 확인해 주세요. 설정에서 연결을 확인한 뒤 다시 시도할 수 있어요.";
  if (
    code === "subscription_sharing_unsupported_capability" ||
    event.httpStatus === 400
  )
    return "현재 모델에서 이 요청을 지원하지 않아요. 설정에서 다른 모델을 선택해 주세요.";
  if (
    event.httpStatus === 503 ||
    code === "service_unavailable" ||
    code === "subscription_sharing_usage_unavailable" ||
    code === "subscription_sharing_user_unavailable"
  )
    return "ChatGPT 서비스를 잠시 사용할 수 없어요. 잠시 후 다시 시도해 주세요. 기본 학습은 계속할 수 있어요.";
  return "설명을 마치지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요. 기본 설명은 계속 이용할 수 있어요.";
}
