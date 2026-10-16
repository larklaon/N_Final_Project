import { useRouter } from "expo-router";
import {
  Screen,
  Heading,
  Body,
  Small,
  Button,
  Surface,
} from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import { dueConcepts } from "../../src/domain/selection";
export default function Review() {
  const { snapshot, now } = useApp();
  const router = useRouter();
  const due = dueConcepts(snapshot, now);
  const upcoming = snapshot.concepts
    .filter((c) => snapshot.progress[c.id]?.dueAt > now)
    .sort(
      (a, b) => snapshot.progress[a.id].dueAt - snapshot.progress[b.id].dueAt,
    );
  const open = (id: string) =>
    router.push({ pathname: "/learn/[conceptId]", params: { conceptId: id } });
  return (
    <Screen tabScreen>
      <Heading>지금 복습</Heading>
      {due.length ? (
        due.map((c) => (
          <Surface key={c.id}>
            <Body>{c.title}</Body>
            <Small>다시 살펴볼 시간이 됐어요.</Small>
            <Button label="복습하기" onPress={() => open(c.id)} />
          </Surface>
        ))
      ) : (
        <Body>지금 복습할 개념이 없어요.</Body>
      )}
      <Heading>다음 예정</Heading>
      {upcoming.length ? (
        upcoming.map((c) => (
          <Surface key={c.id}>
            <Body>{c.title}</Body>
            <Small>
              {new Date(snapshot.progress[c.id].dueAt).toLocaleString("ko-KR")}
            </Small>
            <Button
              secondary
              label="미리 읽기 · 진도에 반영되지 않아요"
              onPress={() => open(c.id)}
            />
          </Surface>
        ))
      ) : (
        <Small>첫 개념을 학습하면 복습 일정을 준비해요.</Small>
      )}
    </Screen>
  );
}
