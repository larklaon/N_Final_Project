import { useEffect, useRef, useState } from "react";
import { findNodeHandle, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Message, Screen } from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import { resolutionOf } from "../../src/domain/puzzle";
import { colors, fonts, type } from "../../src/theme/tokens";
import { readOnlySelection } from "../../modules/text-android";

const levels = [
  "이것만 알아도 대충 알아요",
  "이것까지 알면 좋아요",
  "이것까지 알면 다 아는 거예요",
];

/**
 * Read-only text the learner can drag across. A non-editing TextInput is the only core
 * React Native view that reports the selected range, so the selection can travel to the chat.
 * Natively its selection menu reads "AI에게 물어보기 · 복사" instead of cut and paste.
 */
function SelectableBody({
  text,
  onSelect,
  onAsk,
}: {
  text: string;
  onSelect: (s: string) => void;
  onAsk: (s: string) => void;
}) {
  const ref = useRef<TextInput>(null);
  const latestAsk = useRef(onAsk);
  useEffect(() => {
    latestAsk.current = onAsk;
  });
  useEffect(
    () =>
      readOnlySelection(findNodeHandle(ref.current), "AI에게 물어보기", (t) =>
        latestAsk.current(t),
      ),
    [],
  );
  return (
    <TextInput
      ref={ref}
      value={text}
      onChangeText={() => {}}
      multiline
      scrollEnabled={false}
      showSoftInputOnFocus={false}
      caretHidden
      accessibilityHint="길게 눌러 끌면 그 부분을 AI에게 물어볼 수 있어요"
      onSelectionChange={(e) => {
        const { start, end } = e.nativeEvent.selection;
        onSelect(text.slice(Math.min(start, end), Math.max(start, end)).trim());
      }}
      onBlur={() => onSelect("")}
      style={s.body}
    />
  );
}

export default function Concept() {
  const { conceptId } = useLocalSearchParams<{ conceptId: string }>();
  const { snapshot, now } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<boolean[]>([true, false, false]);
  const [selection, setSelection] = useState("");
  const concept = snapshot.concepts.find((c) => c.id === conceptId);
  if (!concept)
    return (
      <Screen>
        <Message text="이 개념을 찾지 못했어요." error />
      </Screen>
    );
  const bodies = [
    `${concept.oneLiner}\n\n예를 들면, ${concept.example}`,
    concept.explanation,
    concept.deep,
  ];
  const ask = (quote = selection) =>
    router.push({
      pathname: "/ai/[conceptId]",
      params: quote ? { conceptId: concept.id, quote } : { conceptId: concept.id },
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.band }}>
      <Screen>
        <View style={{ gap: 10 }}>
          <Text style={s.area}>
            {concept.area} · {(() => {
              const r = resolutionOf(snapshot, concept.id, now);
              return r.percent > 0 ? `해상도 ${r.percent}% · 반감기 ${r.halfLife}일` : "아직 맞추지 않은 조각";
            })()}
          </Text>
          <Text accessibilityRole="header" style={s.title}>
            {concept.title}
          </Text>
        </View>
        <View>
          {bodies.map((body, i) => (
            <View key={i} style={[s.level, i > 0 && s.levelLine]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open[i] }}
                accessibilityLabel={`${i + 1}단계, ${levels[i]}`}
                onPress={() => setOpen(open.map((v, j) => (j === i ? !v : v)))}
                style={s.levelHead}
              >
                <View style={s.dots} accessible={false}>
                  {[0, 1, 2].map((d) => (
                    <View key={d} style={[s.dot, d <= i && { backgroundColor: colors.ink }]} />
                  ))}
                </View>
                <Text style={s.levelTitle}>{levels[i]}</Text>
                <Ionicons
                  name={open[i] ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.bandText2}
                  accessible={false}
                />
              </Pressable>
              {open[i] && <SelectableBody text={body} onSelect={setSelection} onAsk={ask} />}
            </View>
          ))}
        </View>
        <View style={{ height: 88 }} />
      </Screen>
      <View style={s.askBar} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          onPress={() => ask()}
          style={({ pressed }) => [s.ask, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.band} accessible={false} />
          <View style={{ flexShrink: 1 }}>
            <Text style={s.askText}>AI에게 물어보기</Text>
            {!!selection && (
              <Text style={s.askQuote} numberOfLines={1}>
                「{selection}」
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  area: { ...type.label, color: colors.bandLabel },
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 44, color: colors.ink },
  level: { paddingVertical: 6 },
  levelLine: { borderTopWidth: 1, borderTopColor: colors.bandLine },
  levelHead: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors.bandLine },
  levelTitle: { ...type.option, fontFamily: fonts.semibold, color: colors.ink, flex: 1 },
  body: {
    ...type.body,
    color: colors.bandBody,
    padding: 0,
    paddingBottom: 14,
    textAlignVertical: "top",
  },
  askBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, alignItems: "center" },
  ask: {
    minHeight: 56,
    maxWidth: 560,
    width: "100%",
    borderRadius: 4,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  askText: { ...type.button, fontSize: 17, color: colors.band, textAlign: "center" },
  askQuote: { ...type.small, fontSize: 13, color: colors.inkSoft, textAlign: "center" },
});
