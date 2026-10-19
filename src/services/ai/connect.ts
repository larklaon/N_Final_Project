import { Alert } from "react-native";
import { getSiwc } from "../../../modules/siwc-android";
import type { LearningRepository } from "../../data/repositories/LearningRepository";

/** Explain what is sent before ChatGPT is connected; `onAgree` runs only after agreement. */
export function askToConnect(onAgree: () => void) {
  Alert.alert(
    "ChatGPT 연결 안내",
    "개념·학습 요약·입력 질문을 OpenAI에 전송해 개인화 설명을 만들어요. ChatGPT 플랜 사용량이 적용돼요. 첫 연결은 현재 기기의 학습 기록과 연결돼요. AI 맞춤 학습은 설정에서 따로 켜요.",
    [
      { text: "취소", style: "cancel" },
      { text: "동의하고 연결", onPress: onAgree },
    ],
  );
}

/** Records the send consent and opens the ChatGPT sign-in in the browser. */
export async function connectChatGpt(
  repo: LearningRepository,
  profileId: string | null,
  requestPlanConsent = false,
) {
  repo.updateSettings({ aiConsentAt: Date.now() });
  await getSiwc().signIn(profileId, requestPlanConsent);
}
