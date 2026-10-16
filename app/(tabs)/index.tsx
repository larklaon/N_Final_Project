import { useRouter } from "expo-router";
import {
  Screen,
  Heading,
  Title,
  Body,
  Small,
  Button,
  Surface,
  Message,
} from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import {
  dailyCount,
  dueConcepts,
  nextConcept,
} from "../../src/domain/selection";
export default function Today() {
  const { snapshot, notificationError, now } = useApp();
  const router = useRouter();
  const count = dailyCount(snapshot, now);
  const next = nextConcept(snapshot, now);
  const due = dueConcepts(snapshot, now).length;
  return (
    <Screen tabScreen>
      <Small>
        {new Date(now).toLocaleDateString("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
      </Small>
      <Heading>오늘의 틈지식</Heading>
      <Body>
        {Math.min(count, snapshot.settings.dailyGoal)} /{" "}
        {snapshot.settings.dailyGoal}개 · 오늘의 목표
      </Body>
      {next ? (
        <Surface>
          <Small>
            {snapshot.progress[next.id] ? "다시 만나는 개념" : next.area}
          </Small>
          <Title>{next.title}</Title>
          <Body>{next.oneLiner}</Body>
          <Button
            label="한 개 익히기"
            onPress={() =>
              router.push({
                pathname: "/learn/[conceptId]",
                params: { conceptId: next.id },
              })
            }
          />
        </Surface>
      ) : (
        <Surface>
          <Title>
            {count >= snapshot.settings.dailyGoal
              ? "오늘은 여기까지 해도 좋아요"
              : "모든 기초 개념을 만났어요"}
          </Title>
          <Body>짧게 쌓은 지식도 다음 공부의 바탕이 돼요.</Body>
          <Button
            secondary
            label="복습 살펴보기"
            onPress={() => router.push("/review")}
          />
        </Surface>
      )}
      <Small>
        {due
          ? `다시 살펴볼 개념이 ${due}개 있어요.`
          : "지금 급한 복습은 없어요."}
      </Small>
      {notificationError && <Message text={notificationError} />}
      <Small>AI 작성 기초 콘텐츠 · 기준 자료를 함께 확인해 주세요.</Small>
    </Screen>
  );
}
