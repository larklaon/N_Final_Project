import { useEffect, useRef, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "../theme/tokens";
export function Screen({
  children,
  topInset = false,
  tabScreen = false,
  scrollKey,
}: {
  children: React.ReactNode;
  topInset?: boolean;
  tabScreen?: boolean;
  scrollKey?: string;
}) {
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (scrollKey !== undefined)
      scroll.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  return (
    <SafeAreaView
      edges={[
        "left",
        "right",
        ...(topInset ? ["top" as const] : []),
        ...(!tabScreen || width >= 840 ? ["bottom" as const] : []),
      ]}
      style={s.safe}
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          s.page,
          { paddingHorizontal: width < 360 ? 16 : 20 },
        ]}
      >
        <View style={s.measure}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Heading({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.heading}>
      {children}
    </Text>
  );
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.title}>
      {children}
    </Text>
  );
}
export function Body({ children }: PropsWithChildren) {
  return <Text style={s.body}>{children}</Text>;
}
export function Small({ children }: PropsWithChildren) {
  return <Text style={s.small}>{children}</Text>;
}
export function Surface({ children }: PropsWithChildren) {
  return <View style={s.surface}>{children}</View>;
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [
        s.button,
        secondary
          ? s.secondary
          : { backgroundColor: danger ? colors.error : colors.primary },
        (disabled || busy) && s.disabled,
        pressed && s.pressed,
      ]}
    >
      {busy && (
        <ActivityIndicator
          color={secondary ? colors.primary : colors.onPrimary}
        />
      )}
      <Text
        style={[
          s.buttonText,
          { color: secondary ? colors.primary : colors.onPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Choice({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.choice,
        selected && s.selected,
        pressed && s.pressed,
      ]}
    >
      <View style={[s.radio, selected && s.radioSelected]} />
      <Text style={s.choiceText}>{label}</Text>
    </Pressable>
  );
}
export function Message({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        s.message,
        { backgroundColor: error ? colors.errorSoft : colors.primarySoft },
      ]}
    >
      <Text
        style={[s.body, { color: error ? colors.error : colors.textPrimary }]}
      >
        {text}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingTop: 24, paddingBottom: 32, alignItems: "center" },
  measure: { width: "100%", maxWidth: 600, gap: 24 },
  heading: { ...type.heading, color: colors.textPrimary },
  title: { ...type.title, color: colors.textPrimary },
  body: { ...type.body, color: colors.textPrimary },
  small: { ...type.small, color: colors.textSecondary },
  surface: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 16,
    gap: 16,
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondary: { backgroundColor: colors.primarySoft },
  buttonText: {
    ...type.label,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "center",
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  choice: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    padding: 15,
  },
  choiceText: { ...type.body, color: colors.textPrimary, flex: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.controlBorder,
  },
  radioSelected: { borderWidth: 6, borderColor: colors.primary },
  message: { padding: 16, borderRadius: 12 },
});
