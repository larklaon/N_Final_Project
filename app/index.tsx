import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import {
  Screen,
  Heading,
  Body,
  Small,
  Button,
  Choice,
  Message,
} from "../src/components/ui";
import { useApp } from "../src/platform/AppProvider";
export default function Onboarding() {
  const { repo, snapshot, refresh } = useApp();
  const router = useRouter();
  const [goal, setGoal] = useState(3);
  const [error, setError] = useState("");
  if (snapshot.settings.onboarded) return <Redirect href="/(tabs)" />;
  function start() {
    try {
      repo.updateSettings({ dailyGoal: goal, onboarded: true });
      refresh();
      router.replace("/(tabs)");
    } catch {
      setError("설정을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }
  return (
    <Screen topInset>
      <Small>틈지식 · 정보처리기사 기초</Small>
      <Heading>짧게 익히고,{"\n"}오래 기억하기</Heading>
      <Body>
        공부를 시작하기 전, 낯선 용어부터 익혀요. 개념 하나와 짧은 퀴즈면
        충분해요.
      </Body>
      <Small>하루에 몇 개념을 만나볼까요?</Small>
      {[1, 3, 5].map((n) => (
        <Choice
          key={n}
          label={`${n}개${n === 3 ? " · 기본 목표" : ""}`}
          selected={goal === n}
          onPress={() => setGoal(n)}
        />
      ))}
      <Small>
        학습 기록은 이 기기에 저장돼요. AI는 설정에서 ChatGPT를 연결한 뒤 사용할
        수 있어요. 기본 콘텐츠는 AI 작성 초안이며 오류가 있을 수 있어요.
      </Small>
      {!!error && <Message text={error} error />}
      <Button label="기본 학습으로 시작" onPress={start} />
      <Small>
        인터넷 없이도 학습할 수 있어요. 앱을 삭제하면 로컬 기록도 사라질 수
        있어요.
      </Small>
    </Screen>
  );
}
