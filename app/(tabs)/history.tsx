import { View } from "react-native";
import { Screen, Heading, Body, Small, Surface } from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import { colors } from "../../src/theme/tokens";
import { localDate } from "../../src/domain/review";
export default function History() {
  const { snapshot, now } = useApp();
  const graded = snapshot.attempts.filter((a) => a.isGraded);
  const correct = graded.filter((a) => a.correct).length;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const key = localDate(d.getTime());
    return {
      key,
      count: new Set(
        graded.filter((a) => a.localDate === key).map((a) => a.conceptId),
      ).size,
    };
  });
  return (
    <Screen tabScreen>
      <Heading>차곡차곡 쌓인 기록</Heading>
      <Surface>
        <Body>
          만난 개념 {Object.keys(snapshot.progress).length} /{" "}
          {snapshot.concepts.length}개
        </Body>
        <Body>
          {graded.length
            ? `채점 정답률 ${Math.round((correct / graded.length) * 100)}%`
            : "아직 채점 기록이 없어요"}
        </Body>
        <Small>조기 연습은 진도와 정답률에 포함되지 않아요.</Small>
      </Surface>
      <Heading>최근 7일</Heading>
      {days.map((d) => (
        <View key={d.key} style={{ gap: 8 }}>
          <Small>
            {d.key.slice(5)} · {d.count}개
          </Small>
          <View
            accessible
            accessibilityLabel={`${d.key} 학습 ${d.count}개`}
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.border,
            }}
          >
            <View
              style={{
                height: 8,
                borderRadius: 4,
                width: `${Math.min(d.count / snapshot.settings.dailyGoal, 1) * 100}%`,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        </View>
      ))}
      <Heading>영역별 진도</Heading>
      {[...new Set(snapshot.concepts.map((c) => c.area))].map((area) => (
        <Body key={area}>
          {area} ·{" "}
          {
            snapshot.concepts.filter(
              (c) => c.area === area && snapshot.progress[c.id],
            ).length
          }{" "}
          / {snapshot.concepts.filter((c) => c.area === area).length}개
        </Body>
      ))}
    </Screen>
  );
}
