import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Band,
  BandBody,
  BandLabelRow,
  DarkNote,
  DarkScreen,
  IconButton,
  OptionRow,
  PrimaryButton,
  TextLink,
} from "../../src/components/ui";
import { AskBar } from "../../src/components/AskBar";
import { useApp } from "../../src/platform/AppProvider";
import { whenSeen } from "../../src/domain/puzzle";
import { hideGeneratedCard } from "../../src/services/gap/sync";
import { colors, fonts, type } from "../../src/theme/tokens";

/**
 * A side branch from the question screen: the gap card this piece was last asked as.
 * The answer counts like one given on the lock screen or widget (resolution, gap spacing,
 * "last time" result); it is a dead end in the flow, so leaving returns to the question.
 */
export default function Revisit() {
  const { conceptId } = useLocalSearchParams<{ conceptId: string }>();
  const { repo, snapshot, now, auth, refresh } = useApp();
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [answer, setAnswer] = useState<{ correct: boolean } | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  // What happened last time stays as it was when this screen opened. An answer given on the
  // widget just before opening may still be on its way in; pick it up once it lands.
  const [opened] = useState(() => repo.lastGapAnswer(conceptId));
  const [frozen, setFrozen] = useState<typeof opened>(null);
  const past = opened ?? frozen ?? repo.lastGapAnswer(conceptId);
  const concept = snapshot.concepts.find((c) => c.id === conceptId);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const header = (
    <View style={s.header}>
      <Text style={s.headerText}>
        {past ? `${whenSeen(past.answeredAt, now)} 스친 조각` : "스친 조각"}
      </Text>
      <IconButton icon="close" label="돌아가기" color={colors.inkSoft} onPress={close} />
    </View>
  );
  if (!past || !concept)
    return (
      <DarkScreen header={header} footer={<PrimaryButton label="돌아가기" onPress={close} />}>
        <Band>
          <BandBody>이 조각의 지난 기록을 찾지 못했어요.</BandBody>
        </Band>
      </DarkScreen>
    );

  const { quiz } = past;
  // V4: an AI-made card shows what it was built on and can be taken out of the deck.
  const generatedId = quiz.origin?.generatedId;
  const live = !!generatedId && !hidden && repo.personal.row(generatedId, snapshot.learnerId)?.status === "approved";
  const right = quiz.options.find((o) => o.id === quiz.correctOptionId)?.text ?? "";
  const then = quiz.options.find((o) => o.id === past.selectedOptionId)?.text ?? "";

  function check() {
    setFrozen(past);
    const at = Date.now();
    try {
      repo.ingestGapEvents([
        {
          id: `revisit-${at}-${Math.random().toString(36).slice(2, 8)}`,
          learnerId: snapshot.learnerId,
          questionId: quiz.id,
          selectedOptionId: selected,
          answeredAt: at,
        },
      ]);
      setAnswer({ correct: selected === quiz.correctOptionId });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "답을 기록하지 못했어요.");
    }
  }

  function hide() {
    if (!generatedId) return;
    hideGeneratedCard(repo, generatedId)
      .then(() => {
        setHidden(true);
        refresh();
      })
      .catch(() => setError("카드를 숨기지 못했어요. 다시 시도해 주세요."));
  }
  const hideLink = live ? <TextLink tone="dark" label="이 카드 숨기기" onPress={hide} /> : null;

  const ask =
    auth.status === "ready" ? (
      <AskBar conceptId={concept.id} questionId={quiz.id} selected={selected} answered={!!answer} />
    ) : null;

  return (
    <DarkScreen
      header={header}
      footer={
        answer ? (
          <>
            <PrimaryButton label="돌아가기" onPress={close} />
            <TextLink
              tone="dark"
              label="이 개념 깊게 보기"
              onPress={() => router.push({ pathname: "/concept/[conceptId]", params: { conceptId: concept.id } })}
            />
            {hideLink}
            {ask}
          </>
        ) : (
          <>
            <PrimaryButton label="확인" disabled={!selected} onPress={check} />
            {hideLink}
            {ask}
          </>
        )
      }
    >
      <Band slant={4}>
        <View style={s.labelRow}>
          <BandLabelRow ai={!!generatedId}>{concept.title}</BandLabelRow>
          <View style={s.past} accessibilityLabel={past.correct ? "그때 맞혔어요" : "그때 틀렸어요"}>
            <Ionicons
              name={past.correct ? "checkmark" : "close"}
              size={13}
              color={past.correct ? colors.ink : colors.danger}
              accessible={false}
            />
            <Text style={[s.pastText, !past.correct && { color: colors.danger }]}>
              {past.correct ? "그때 맞혔어요" : "그때 틀렸어요"}
            </Text>
          </View>
        </View>
        {!answer ? (
          <>
            <Text accessibilityRole="header" style={[type.question, s.ink]}>
              {quiz.prompt}
            </Text>
            <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
              {quiz.options.map((o, i) => (
                <OptionRow
                  key={o.id}
                  index={i + 1}
                  label={o.text}
                  selected={selected === o.id}
                  onPress={() => setSelected(o.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={s.verdictRow} accessibilityLiveRegion="polite">
              <Ionicons
                name={answer.correct ? "checkmark-circle" : "close-circle"}
                size={20}
                color={answer.correct ? colors.mintText : colors.danger}
                accessible={false}
              />
              <Text style={[s.verdict, { color: answer.correct ? colors.mintText : colors.danger }]}>
                {answer.correct ? "맞았어요" : "정답은"}
              </Text>
            </View>
            {!answer.correct && (
              <Text style={s.then}>
                고른 답{" "}
                <Text style={{ textDecorationLine: "line-through" }}>
                  {quiz.options.find((o) => o.id === selected)?.text}
                </Text>
              </Text>
            )}
            <Text style={[type.answerLong, s.ink]}>{right}</Text>
            <BandBody>{quiz.explanation}</BandBody>
            <Text style={s.then}>그때 고른 답 · {then}</Text>
          </>
        )}
      </Band>
      {!!generatedId && !!answer && quiz.sourceRefs.length > 0 && (
        <View style={s.sources}>
          <Text style={s.sourcesLabel}>기준 자료</Text>
          {quiz.sourceRefs.map((r) => (
            <Pressable
              key={r.url}
              accessibilityRole="link"
              accessibilityLabel={`기준 자료 ${r.title}, 브라우저에서 열기`}
              onPress={() => void Linking.openURL(r.url)}
              style={({ pressed }) => [s.source, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.inkMuted} accessible={false} />
              <Text style={s.sourceText} numberOfLines={2}>
                {r.title}
              </Text>
              <Ionicons name="open-outline" size={14} color={colors.inkSoft} accessible={false} />
            </Pressable>
          ))}
        </View>
      )}
      {hidden && <DarkNote icon="eye-off-outline">숨겼어요. 다시 나오지 않아요.</DarkNote>}
      {!!error && <DarkNote icon="alert-circle-outline">{error}</DarkNote>}
    </DarkScreen>
  );
}

const s = StyleSheet.create({
  header: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  headerText: { ...type.small, color: colors.inkMuted },
  ink: { color: colors.ink },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  past: { flexDirection: "row", alignItems: "center", gap: 3 },
  pastText: { ...type.small, fontSize: 12, fontFamily: fonts.semibold, color: colors.ink },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  verdict: { ...type.small, fontFamily: fonts.semibold, color: colors.bandLabel },
  then: { ...type.small, color: colors.bandText2 },
  sources: { marginHorizontal: 24, gap: 4 },
  sourcesLabel: { ...type.small, fontSize: 13, color: colors.inkMuted },
  source: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  sourceText: { ...type.small, flex: 1, color: colors.inkText },
});
