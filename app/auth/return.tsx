import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../../src/platform/AppProvider";
import type { AuthSnapshot } from "../../modules/siwc-android";
import { Screen, Heading, Body, Button, Row } from "../../src/components/ui";

function result(auth: AuthSnapshot) {
  if (auth.status === "authorizing")
    return ["ChatGPT 연결 중", "브라우저 인증 결과를 확인하고 있어요."];
  if (auth.authOutcome === "cancelled")
    return ["연결을 취소했어요", "설정에서 언제든 다시 연결할 수 있어요."];
  if (auth.authOutcome === "failed")
    return [
      "연결하지 못했어요",
      auth.message || "설정에서 연결 상태를 확인하고 다시 시도해 주세요.",
    ];
  switch (auth.status) {
    case "ready":
      return [
        "ChatGPT가 연결됐어요",
        "현재 학습 기록에 맞춘 AI 설명을 사용할 수 있어요.",
      ];
    case "connectedWithoutPlan":
      return [
        "계정이 연결됐어요",
        "AI 설명을 사용하려면 설정에서 ChatGPT 플랜 사용을 허용해 주세요.",
      ];
    case "reconnectRequired":
      return [
        "다시 연결해 주세요",
        auth.message ||
          "인증 정보가 만료되었어요. 설정에서 다시 연결할 수 있어요.",
      ];
    case "temporarilyUnavailable":
      return [
        "잠시 연결할 수 없어요",
        auth.message || "잠시 후 설정에서 연결을 다시 확인해 주세요.",
      ];
    default:
      return [
        "아직 연결되지 않았어요",
        auth.message || "설정에서 ChatGPT 연결을 시작할 수 있어요.",
      ];
  }
}
export default function AuthReturn() {
  const { auth, refreshAuth } = useApp();
  const router = useRouter();
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);
  const [title, message] = result(auth);
  return (
    <Screen back={false}>
      <View style={styles.message}>
        <Heading>{title}</Heading>
        <Body>{message}</Body>
      </View>
      <Button
        label={auth.status === "ready" ? "학습 시작하기" : "설정으로 돌아가기"}
        onPress={() => router.replace(auth.status === "ready" ? "/" : "/settings")}
      />
      {auth.status === "ready" && <Row label="AI 사용량 보기" onPress={() => router.replace("/usage")} last />}
    </Screen>
  );
}
const styles = StyleSheet.create({ message: { gap: 24, paddingTop: 64, paddingBottom: 48 } });
