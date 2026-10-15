import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useApp } from "../../src/platform/AppProvider";
import { Screen, Body, Button } from "../../src/components/ui";
export default function AuthReturn() {
  const { refreshAuth } = useApp();
  const router = useRouter();
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);
  return (
    <Screen>
      <Body>브라우저 인증 결과를 확인하고 있어요.</Body>
      <Button
        label="설정으로 돌아가기"
        onPress={() => router.replace("/settings")}
      />
    </Screen>
  );
}
