import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "../src/platform/AppProvider";
import { colors } from "../src/theme/tokens";
export default function Layout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.background },
          headerBackTitle: "뒤로",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="learn/[conceptId]"
          options={{ title: "한 개념 익히기" }}
        />
        <Stack.Screen
          name="ai/[conceptId]"
          options={{ title: "나에게 맞게 설명" }}
        />
        <Stack.Screen name="auth/return" options={{ title: "ChatGPT 연결" }} />
      </Stack>
    </AppProvider>
  );
}
