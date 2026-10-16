import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useApp } from "../../src/platform/AppProvider";
import { colors } from "../../src/theme/tokens";
export default function TabLayout() {
  const { snapshot } = useApp();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sidebar = width >= 840;
  const itemHeight = Math.max(64, 24 + 8 + Math.ceil(22 * fontScale) + 16);
  if (!snapshot.settings.onboarded) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        tabBarPosition: sidebar ? "left" : "bottom",
        tabBarLabelPosition: sidebar ? "beside-icon" : "below-icon",
        tabBarActiveBackgroundColor: colors.primarySoft,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          ...(sidebar
            ? { width: Math.max(220, 140 + 60 * fontScale) }
            : { height: itemHeight + insets.bottom }),
        },
        tabBarLabelStyle: { fontSize: 14, lineHeight: 22 },
        tabBarItemStyle: {
          minHeight: sidebar ? Math.max(56, 22 * fontScale + 24) : itemHeight,
        },
      }}
    >
      {(
        [
          ["index", "오늘", "sunny-outline"],
          ["review", "복습", "repeat-outline"],
          ["history", "기록", "bar-chart-outline"],
          ["settings", "설정", "settings-outline"],
        ] as const
      ).map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name={icon}
                size={size}
                color={color}
                accessible={false}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
