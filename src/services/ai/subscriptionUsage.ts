import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { colors } from "../../theme/tokens";

/** Open the official account page in a browser-owned tab; never pass SIWC credentials. */
export async function openSubscriptionUsage() {
  try {
    await WebBrowser.openBrowserAsync("https://chatgpt.com/settings/usage", {
      createTask: false,
      toolbarColor: colors.band,
      controlsColor: colors.ink,
      enableBarCollapsing: false,
      showTitle: true,
    });
  } catch {
    Alert.alert("사용량 페이지를 열지 못했어요", "Chrome 등 브라우저가 설치되어 있는지 확인한 뒤 다시 눌러 주세요.");
  }
}
