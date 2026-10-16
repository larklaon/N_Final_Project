import { Stack } from "expo-router";
import { AppProvider } from "../src/platform/AppProvider";
import { colors } from "../src/theme/tokens";

export default function Layout() {
  return (
    <AppProvider>
      {/* Light screens fade in over the band that has already filled the screen. */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 160,
          contentStyle: { backgroundColor: colors.band },
        }}
      >
        <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: colors.ink } }} />
        {/* Asking about a question slides up over it, like a sheet. */}
        <Stack.Screen name="ai/[conceptId]" options={{ animation: "slide_from_bottom" }} />
      </Stack>
    </AppProvider>
  );
}
