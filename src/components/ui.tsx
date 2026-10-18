import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, fonts, type } from "../theme/tokens";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => sub.remove();
  }, []);
  return reduced;
}

function gutter(width: number) {
  return width < 360 ? 16 : 24;
}

/* ───────────── Light screens: the gap has opened ───────────── */

/** Settings, puzzle, concept, AI. Fully light: no focus needed here. */
export function Screen({
  children,
  title,
  back = true,
  scrollKey,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  back?: boolean;
  scrollKey?: string;
  /** A small control at the right end of the header, e.g. an info button. */
  action?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (scrollKey !== undefined)
      scroll.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={s.light}>
      <StatusBar style="dark" />
      {(back || title) && (
        <View style={[s.header, { paddingHorizontal: gutter(width) - 12 }]}>
          {back && (
            <IconButton
              icon="chevron-back"
              label="뒤로"
              color={colors.ink}
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/")
              }
            />
          )}
          {title && (
            <Text accessibilityRole="header" style={s.screenTitle}>
              {title}
            </Text>
          )}
          {action && <View style={{ marginLeft: "auto" }}>{action}</View>}
        </View>
      )}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          s.page,
          { paddingHorizontal: gutter(width) },
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
export const Title = Heading;
export function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.sectionLabel}>
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
/** A quiet well for generated text; light screens otherwise avoid boxes. */
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
  const fg = danger ? colors.danger : secondary ? colors.ink : colors.band;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.lightButton,
        danger
          ? s.dangerButton
          : secondary
            ? { backgroundColor: colors.bandFaint }
            : { backgroundColor: colors.ink },
        (disabled || busy) && s.disabled,
        pressed && s.pressed,
      ]}
    >
      {busy && <ActivityIndicator color={fg} />}
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}
/** Radio row on a light screen. Selection inverts, as everywhere in the app. */
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
        { backgroundColor: selected ? colors.ink : colors.bandFaint },
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.choiceText, { color: selected ? colors.band : colors.ink }]}>
        {label}
      </Text>
      {selected && (
        <Ionicons
          name="checkmark"
          size={20}
          color={colors.band}
          accessible={false}
        />
      )}
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
    <View accessibilityLiveRegion="polite" style={s.message}>
      <Ionicons
        name={error ? "alert-circle-outline" : "information-circle-outline"}
        size={18}
        color={error ? colors.danger : colors.bandLabel}
        accessible={false}
        style={{ marginTop: 3 }}
      />
      <Text style={[s.small, { flex: 1, color: error ? colors.danger : colors.bandBody }]}>
        {text}
      </Text>
    </View>
  );
}
/** Settings row: label (+ sub) on the left, control or value on the right. */
export function Row({
  label,
  sub,
  value,
  right,
  onPress,
  danger = false,
  last = false,
}: {
  label: string;
  sub?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const content = (
    <>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, danger && { color: colors.danger }]}>
          {label}
        </Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {/* With large text on a narrow phone the control drops below the label instead of
          squeezing it into one character per line. */}
      <View style={s.rowEnd}>
        {value && <Text style={s.rowValue}>{value}</Text>}
        {right}
        {onPress && !right && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.bandText2}
            accessible={false}
          />
        )}
      </View>
    </>
  );
  const style = [s.row, !last && s.rowLine];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && s.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
export function Toggle({
  value,
  onValueChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={[
        s.toggle,
        { backgroundColor: value ? colors.mintDeep : colors.bandLine },
        { justifyContent: value ? "flex-end" : "flex-start" },
        disabled && s.disabled,
      ]}
    >
      <View
        style={[
          s.knob,
          { backgroundColor: value ? colors.band : "#FFFFFF" },
        ]}
      />
    </Pressable>
  );
}
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  format = (v) => String(v),
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  format?: (v: T) => string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.segmented}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="radio"
            accessibilityLabel={`${label} ${format(o)}`}
            accessibilityState={{ checked: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(o)}
            style={[s.segment, on && { backgroundColor: colors.ink }]}
          >
            <Text
              style={[
                s.segmentText,
                { color: on ? colors.band : colors.ink },
                on && { fontFamily: fonts.semibold },
              ]}
            >
              {format(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function TextLink({
  label,
  onPress,
  tone = "light",
}: {
  label: string;
  onPress: () => void;
  tone?: "light" | "dark";
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [s.link, pressed && s.pressed]}
    >
      <Text
        style={[
          s.linkText,
          { color: tone === "dark" ? colors.inkSoft : colors.bandLabel },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
    >
      <Ionicons name={icon} size={22} color={color} accessible={false} />
    </Pressable>
  );
}

/* ───────────── Dark screens: focus on one question ───────────── */

export function DarkScreen({
  header,
  footer,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={s.dark}>
      <StatusBar style="light" />
      {header && (
        <View style={[s.darkHeader, { paddingHorizontal: gutter(width) }]}>
          {header}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.darkBody}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.darkMeasure}>{children}</View>
        </ScrollView>
        {/* Long content fades into the footer instead of being cut at its edge. */}
        {footer && (
          <View pointerEvents="none" style={s.darkFade}>
            {[0.12, 0.3, 0.5, 0.7, 0.88].map((a) => (
              <View key={a} style={{ flex: 1, backgroundColor: `rgba(18,21,19,${a})` }} />
            ))}
          </View>
        )}
      </View>
      {footer && (
        <View style={[s.darkFooter, { paddingHorizontal: gutter(width) }]}>
          <View style={s.darkMeasureInner}>{footer}</View>
        </View>
      )}
    </SafeAreaView>
  );
}
/**
 * The gap: a light band whose top and bottom edges slant up to the right.
 * Drawn as a rectangle with two ink corner triangles (Android skews whole layers, not edges).
 */
export function Band({
  children,
  slant = 3,
  thin = false,
  style,
}: {
  children: React.ReactNode;
  slant?: number;
  thin?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { width: window } = useWindowDimensions();
  const [width, setWidth] = useState(window);
  const rise = Math.round(width * Math.tan((slant * Math.PI) / 180));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        s.band,
        {
          paddingHorizontal: gutter(window),
          paddingTop: (thin ? 32 : 44) + rise,
          paddingBottom: (thin ? 32 : 44) + rise,
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, backgroundColor: colors.band }} />
        <View
          style={[
            s.corner,
            {
              top: 0,
              left: 0,
              borderTopWidth: rise,
              borderRightWidth: width,
              borderTopColor: colors.ink,
            },
          ]}
        />
        <View
          style={[
            s.corner,
            {
              bottom: 0,
              right: 0,
              borderBottomWidth: rise,
              borderLeftWidth: width,
              borderBottomColor: colors.ink,
            },
          ]}
        />
      </View>
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}
export function BandLabel({ children }: PropsWithChildren) {
  return <Text style={s.bandLabel}>{children}</Text>;
}
/**
 * V4: the small "AI" mark beside a label, for cards and questions the AI made for this
 * learner. Text, not only a color, so it reads in every mode; screen readers hear the meaning.
 */
export function AiTag({ label = "AI가 만든 문제" }: { label?: string }) {
  return (
    <View style={s.aiTag} accessible accessibilityLabel={label}>
      <Text style={s.aiTagText}>AI</Text>
    </View>
  );
}
/** A band label with the AI mark after it. */
export function BandLabelRow({ children, ai }: PropsWithChildren<{ ai?: boolean }>) {
  return (
    <View style={s.bandLabelRow}>
      <BandLabel>{children}</BandLabel>
      {ai && <AiTag />}
    </View>
  );
}
export function BandBody({ children }: PropsWithChildren) {
  return <Text style={s.bandBody}>{children}</Text>;
}
export function ContextBlock({ text, code }: { text: string; code?: boolean }) {
  return code ? (
    <ScrollView horizontal style={s.codeWell} contentContainerStyle={{ padding: 12 }}>
      <Text style={s.code} accessibilityLabel={`코드: ${text}`}>
        {text}
      </Text>
    </ScrollView>
  ) : (
    <Text style={s.contextText}>{text}</Text>
  );
}
export function OptionRow({
  index,
  label,
  selected,
  onPress,
  disabled = false,
}: {
  index: number;
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${index}번, ${label}`}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.option,
        { backgroundColor: selected ? colors.ink : colors.bandFaint },
        pressed && !selected && { backgroundColor: colors.bandLine },
      ]}
    >
      <Text
        style={[s.optionIndex, { color: selected ? colors.band : colors.bandText2 }]}
      >
        {index}
      </Text>
      <Text style={[s.optionText, { color: selected ? colors.band : colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.primary,
        disabled && { opacity: 0.35 },
        pressed && s.pressed,
      ]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}
/** Small line under the band: secondary info lives in the dark. */
export function DarkNote({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={s.darkNote}>
      <Ionicons
        name={icon}
        size={18}
        color={colors.inkMuted}
        accessible={false}
        style={{ marginTop: 2 }}
      />
      <Text style={s.darkNoteText}>{children}</Text>
    </View>
  );
}
/** Fill for a resolution step 0–5: the clearer the knowledge, the stronger the color. */
/** Steps 1–5 deepen like the app mark: pale mint toward clear mint (on ink) or deep mint (on the band). */
const darkSteps = [colors.inkLine, "#3E4D45", colors.band, colors.mintSoft, "#9CE2C6", colors.mint];
const lightSteps = [colors.bandFaint, "#CFE3D8", "#A6D9C2", "#76C9A6", "#4BB38A", colors.mintDeep];
export function bandColor(level: number, tone: "dark" | "light") {
  const i = Math.max(0, Math.min(5, level));
  return tone === "dark" ? darkSteps[i] : lightSteps[i];
}
/** One area's pieces, colored by resolution. Step 5 (fully in your head) gets a ring. */
export function PuzzleMap({
  levels,
  ring = [],
  size = 8,
  tone = "dark",
}: {
  levels: number[];
  ring?: number[];
  size?: number;
  tone?: "dark" | "light";
}) {
  const full = tone === "dark" ? colors.mint : colors.mintDeep;
  return (
    <View style={{ flexDirection: "row", gap: Math.max(3, size / 2.5) }} accessible={false}>
      {levels.map((level, i) => (
        <View
          key={i}
          style={{
            width: size * (tone === "dark" ? 1.4 : 1.35),
            height: size,
            borderRadius: Math.max(2, size / 4),
            backgroundColor: bandColor(level, tone),
            ...(ring.includes(i) || level === 5
              ? { outlineWidth: 1, outlineColor: full, outlineOffset: 2 }
              : {}),
          }}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  light: { flex: 1, backgroundColor: colors.band },
  dark: { flex: 1, backgroundColor: colors.ink },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  screenTitle: { ...type.title, color: colors.ink, flexShrink: 1 },
  page: { paddingTop: 12, paddingBottom: 40, alignItems: "center" },
  measure: { width: "100%", maxWidth: 600, gap: 24 },
  heading: { ...type.title, color: colors.ink },
  sectionLabel: { ...type.label, color: colors.bandLabel, marginBottom: -8 },
  body: { ...type.body, color: colors.ink },
  small: { ...type.small, color: colors.bandText2 },
  surface: {
    backgroundColor: colors.bandFaint,
    borderRadius: 12,
    padding: 18,
    gap: 12,
  },
  lightButton: {
    minHeight: 52,
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dangerButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 24,
    flexShrink: 1,
    textAlign: "center",
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  choice: {
    minHeight: 56,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  choiceText: { ...type.option, flex: 1 },
  message: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.bandFaint,
  },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 8,
  },
  rowText: { flexGrow: 1, flexShrink: 0, flexBasis: 150, maxWidth: "100%", gap: 2 },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: "auto" },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.bandLine },
  rowLabel: { ...type.option, fontFamily: fonts.regular, color: colors.ink },
  rowSub: { ...type.small, color: colors.bandText2 },
  rowValue: { ...type.small, fontSize: 16, color: colors.bandText2 },
  toggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    flexDirection: "row",
  },
  knob: { width: 26, height: 26, borderRadius: 13 },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.bandFaint,
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  link: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  linkText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  darkHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  darkBody: { flexGrow: 1, justifyContent: "center", paddingTop: 16, paddingBottom: 28 },
  darkFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 28 },
  darkMeasure: { width: "100%", alignSelf: "center", maxWidth: 680, gap: 28 },
  darkFooter: { paddingTop: 8, paddingBottom: 16, alignItems: "center" },
  darkMeasureInner: { width: "100%", maxWidth: 600, gap: 4 },
  band: { position: "relative" },
  corner: {
    position: "absolute",
    width: 0,
    height: 0,
    borderColor: "transparent",
  },
  aiTag: {
    borderWidth: 1,
    borderColor: colors.mintText,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  aiTagText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 0.6, color: colors.mintText },
  bandLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bandLabel: { ...type.label, color: colors.bandLabel },
  bandBody: { ...type.body, color: colors.bandBody },
  codeWell: { backgroundColor: colors.bandFaint, borderRadius: 8, flexGrow: 0 },
  code: { ...type.code, color: colors.ink },
  contextText: { ...type.small, fontSize: 15, color: colors.bandText2 },
  option: {
    minHeight: 54,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  optionIndex: { ...type.option, width: 14 },
  optionText: { ...type.option, flex: 1 },
  primary: {
    minHeight: 58,
    borderRadius: 4,
    backgroundColor: colors.band,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryText: { ...type.button, color: colors.ink, textAlign: "center" },
  darkNote: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 28,
    alignSelf: "center",
    width: "100%",
    maxWidth: 600,
  },
  darkNoteText: { ...type.small, color: colors.inkSoft, flex: 1 },
});
