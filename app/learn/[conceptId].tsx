import { useState } from "react";
import { Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Screen,
  Heading,
  Body,
  Small,
  Button,
  Choice,
  Message,
  Surface,
} from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import type { Session } from "../../src/domain/types";
export default function Learn() {
  const { conceptId } = useLocalSearchParams<{ conceptId: string }>();
  const { repo, snapshot, refresh } = useApp();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const concept = snapshot.concepts.find((c) => c.id === conceptId);
  if (!concept)
    return (
      <Screen>
        <Message text="이 개념을 찾지 못했어요." error />
        <Button
          label="오늘 학습으로"
          onPress={() => router.replace("/(tabs)")}
        />
      </Screen>
    );
  const quiz = session ? repo.quiz(session.quizId) : null;
  function begin() {
    try {
      setSession(repo.openSession(conceptId));
      setError("");
    } catch {
      setError("문제를 열지 못했어요. 다시 시도해 주세요.");
    }
  }
  function submit() {
    if (!session) return;
    try {
      const answer = repo.submit(session.id, selected);
      setSession({ ...session, answer });
      refresh();
      setError("");
    } catch {
      setError("저장하지 못했어요. 선택은 유지돼요. 다시 시도해 주세요.");
    }
  }
  return (
    <Screen>
      <Small>{concept.area}</Small>
      <Heading>{concept.title}</Heading>
      {!session ? (
        <>
          <Body>{concept.oneLiner}</Body>
          <Body>{concept.explanation}</Body>
          <Surface>
            <Small>예를 들면</Small>
            <Body>{concept.example}</Body>
          </Surface>
          <Small>AI가 작성한 기초 설명이에요. 오류가 있을 수 있어요.</Small>
          {concept.sourceRefs.map((ref) => (
            <Button
              secondary
              key={ref.url}
              label={`기준 자료 · ${ref.title}`}
              onPress={() => void Linking.openURL(ref.url)}
            />
          ))}
          <Button
            secondary
            label="나에게 맞게 설명"
            onPress={() =>
              router.push({
                pathname: "/ai/[conceptId]",
                params: { conceptId },
              })
            }
          />
          <Button label="퀴즈 풀기" onPress={begin} />
        </>
      ) : (
        quiz && (
          <>
            <Small>
              {session.practice
                ? "미리 연습 · 진도에 반영되지 않아요"
                : "짧은 퀴즈"}
            </Small>
            <Body>{quiz.prompt}</Body>
            {session.options.map((o) => (
              <Choice
                key={o.id}
                label={o.text}
                selected={(session.answer?.selected ?? selected) === o.id}
                disabled={!!session.answer}
                onPress={() => setSelected(o.id)}
              />
            ))}
            {session.answer ? (
              <>
                <Message
                  text={
                    session.answer.correct
                      ? "정답이에요."
                      : "다시 살펴볼 개념이에요."
                  }
                  error={!session.answer.correct}
                />
                <Body>
                  정답:{" "}
                  {
                    quiz.options.find((o) => o.id === quiz.correctOptionId)
                      ?.text
                  }
                </Body>
                <Body>{quiz.explanation}</Body>
                <Small>
                  {session.answer.graded
                    ? "다음 복습 일정을 기록했어요."
                    : "연습 결과예요. 기존 복습 일정은 유지돼요."}
                </Small>
                {!session.answer.correct && (
                  <Button
                    secondary
                    label="쉽게 다시 설명"
                    onPress={() =>
                      router.push({
                        pathname: "/ai/[conceptId]",
                        params: { conceptId },
                      })
                    }
                  />
                )}
                <Button
                  label="오늘 학습으로"
                  onPress={() => router.replace("/(tabs)")}
                />
              </>
            ) : (
              <Button label="정답 확인" disabled={!selected} onPress={submit} />
            )}
          </>
        )
      )}
      {!!error && <Message text={error} error />}
    </Screen>
  );
}
