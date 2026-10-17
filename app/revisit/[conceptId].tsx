import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Band,
  BandBody,
  BandLabel,
  DarkScreen,
  IconButton,
  OptionRow,
  PrimaryButton,
} from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import { whenSeen } from "../../src/domain/puzzle";
import { colors, fonts, type } from "../../src/theme/tokens";

/**
 * A short detour from the question screen: the gap question this piece was last asked as,
 * to try again. Practice only; nothing here changes records. Closing returns to the question.
 */
export default function Revisit() {
  const { conceptId } = useLocalSearchParams<{ conceptId: string }>();
  const { repo, snapshot, now } = useApp();
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState(false);
  const [past] = useState(() => repo.lastGapAnswer(conceptId));
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
  const right = quiz.options.find((o) => o.id === quiz.correctOptionId)?.text ?? "";
  const then = quiz.options.find((o) => o.id === past.selectedOptionId)?.text ?? "";
  const correct = selected === quiz.correctOptionId;

  return (
    <DarkScreen
      header={header}
      footer={
        checked ? (
          <PrimaryButton label="돌아가기" onPress={close} />
        ) : (
          <PrimaryButton label="확인" disabled={!selected} onPress={() => setChecked(true)} />
        )
      }
    >
      <Band slant={4}>
        <View style={s.labelRow}>
          <BandLabel>{concept.title}</BandLabel>
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
        {!checked ? (
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
            <Text style={s.verdict} accessibilityLiveRegion="polite">
              {correct ? "맞았어요" : "정답은"}
            </Text>
            <Text style={[type.answerLong, s.ink]}>{right}</Text>
            <BandBody>{quiz.explanation}</BandBody>
            <Text style={s.then}>그때 고른 답 · {then}</Text>
          </>
        )}
      </Band>
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
  verdict: { ...type.small, fontFamily: fonts.semibold, color: colors.bandLabel },
  then: { ...type.small, color: colors.bandText2 },
});
