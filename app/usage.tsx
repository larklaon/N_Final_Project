import { Screen, Body, Button } from "../src/components/ui";
import { openSubscriptionUsage } from "../src/services/ai/subscriptionUsage";

export default function UsageScreen() {
  // Retain old /usage links. Main entry points now open the official page directly.
  return <Screen title="구독 사용량">
    <Body>ChatGPT 공식 페이지에서 구독 사용량을 확인하세요. 브라우저에 로그인된 계정 기준으로 표시되며, 로그인이 필요할 수 있어요.</Body>
    <Button label="ChatGPT 구독 사용량 보기" onPress={() => void openSubscriptionUsage()} />
  </Screen>;
}
