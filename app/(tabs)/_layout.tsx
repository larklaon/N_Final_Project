import { useWindowDimensions } from "react-native";
import { Redirect, Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useApp } from "../../src/platform/AppProvider";
import { colors } from "../../src/theme/tokens";
export default function TabLayout() {
  const { snapshot } = useApp();
  const {width}=useWindowDimensions();
  if (!snapshot.settings.onboarded) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        tabBarPosition: width>=840?"left":"bottom",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarLabelStyle: { fontSize: 14 },
        tabBarItemStyle: { minHeight: 48 },
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
