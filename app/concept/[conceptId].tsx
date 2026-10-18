import { useEffect, useRef, useState } from "react";
import { Alert, findNodeHandle, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AiTag, Message, Screen } from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import { resolutionOf } from "../../src/domain/puzzle";
import { colors, fonts, type } from "../../src/theme/tokens";
import { readOnlySelection } from "../../modules/text-android";
import { packOf } from "../../src/data/content/packs";
import { forgetMemory } from "../../src/services/gap/sync";
import type { LearningRepository } from "../../src/data/repositories/LearningRepository";

const statusWord = {
  active: "자주 헷갈려요",
  improving: "나아지는 중",
  resolved: "이젠 맞혀요",
} as const;

/**
 * V4: what the learner keeps mixing up on this piece, as the AI summarized it from wrong
 * answers and chat. The status is the app's own rule, not the AI's confidence.
 */
function Confusions({ repo, conceptId, onChange }: { repo: LearningRepository; conceptId: string; onChange: () => void }) {
  const subject = packOf(repo.snapshot().settings.subjectId).id;
  const list = repo.personal
    .memories(repo.activeLearner, subject)
    .filter((m) => m.conceptId === conceptId)
    .flatMap((m) => (m.status in statusWord ? [{ ...m, word: statusWord[m.status as keyof typeof statusWord] }] : []));
  if (!list.length) return null;
  const act = (id: string, how: "ignore" | "delete") => void forgetMemory(repo, id, how).finally(onChange);
  return (
    <View style={c.wrap}>
      <View style={c.head}>
        <Text accessibilityRole="header" style={c.title}>
          자주 헷갈린 점
        </Text>
        <AiTag label="AI가 정리한 내용" />
      </View>
      {list.map((m) => (
        <View key={m.id} style={c.item}>
          <Text style={c.summary}>{m.summary}</Text>
          <View style={c.meta}>
            <Text style={[c.status, m.status !== "active" && { color: colors.mintText }]}>{m.word}</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`무시하기. ${m.summary}`}
              hitSlop={10}
              onPress={() => act(m.id, "ignore")}
              style={({ pressed }) => [c.action, pressed && { opacity: 0.6 }]}
            >
              <Text style={c.actionText}>무시</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`삭제하기. ${m.summary}`}
              hitSlop={10}
              onPress={() =>
                Alert.alert("이 기록을 지울까요?", "이 기록으로 만든 카드도 더는 나오지 않아요.", [
                  { text: "취소", style: "cancel" },
                  { text: "삭제", style: "destructive", onPress: () => act(m.id, "delete") },
                ])
              }
              style={({ pressed }) => [c.action, pressed && { opacity: 0.6 }]}
            >
              <Text style={c.actionText}>삭제</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const c = StyleSheet.create({
  wrap: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.bandLine, paddingTop: 18, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { ...type.option, fontFamily: fonts.semibold, color: colors.ink },
  item: { gap: 6, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.mintSoft },
  summary: { ...type.body, color: colors.bandBody },
  meta: { flexDirection: "row", alignItems: "center", gap: 18 },
  status: { ...type.small, fontSize: 13, fontFamily: fonts.semibold, color: colors.bandLabel },
  action: { minHeight: 32, justifyContent: "center" },
  actionText: { ...type.small, fontSize: 13, color: colors.bandText2 },
});

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
  const { repo, snapshot, now, refresh } = useApp();
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
            {concept.area}
            {(() => {
              const r = resolutionOf(snapshot, concept.id, now);
              return r.percent > 0 ? ` · ${r.percent}%` : "";
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
        <Confusions repo={repo} conceptId={concept.id} onChange={refresh} />
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
