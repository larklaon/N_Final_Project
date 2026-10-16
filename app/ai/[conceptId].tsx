import { useEffect, useRef, useState } from "react";
import { AppState, Linking, TextInput } from "react-native";
import * as Crypto from "expo-crypto";
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
import { getSiwc, type AiEvent } from "../../modules/siwc-android";
import {
  buildLearningContext,
  instructions,
  PROMPT_VERSION,
  type AiMode,
} from "../../src/services/ai/context";
import { aiErrorMessage } from "../../src/services/ai/errors";
import { useProfileModels } from "../../src/services/ai/useProfileModels";
import { colors, type } from "../../src/theme/tokens";
export default function AiExplanation() {
  const { snapshot } = useApp();
  return <AiExplanationScreen key={snapshot.learnerId} />;
}
function AiExplanationScreen() {
  const { conceptId } = useLocalSearchParams<{ conceptId: string }>();
  const { repo, snapshot, auth, refresh, refreshAuth } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<AiMode>("simplify");
  const [question, setQuestion] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "completed" | "failed" | "cancelled" | "cached"
  >("idle");
  const [error, setError] = useState("");
  const {
    models,
    error: modelError,
    retry: retryModels,
  } = useProfileModels(auth, refreshAuth);
  const active = useRef<{
    requestId: string | null;
    key: string;
    learner: string;
    question: string;
    buffer: AiEvent[];
  } | null>(null);
  const lastPair = useRef<{ question: string; answer: string } | null>(null);
  const mounted = useRef(true);
  const handleEvent = useRef<(event: AiEvent) => void>(() => {});
  const concept = snapshot.concepts.find((c) => c.id === conceptId);
  useEffect(() => {
    mounted.current = true;
    function handle(event: AiEvent) {
      const a = active.current;
      if (!a) return;
      if (a.requestId === null) {
        a.buffer.push(event);
        return;
      }
      if (
        a.requestId !== event.requestId ||
        a.learner !== repo.activeLearner ||
        !mounted.current
      )
        return;
      if (event.type === "delta") setText((t) => t + (event.text ?? ""));
      if (event.type === "completed") {
        setText(event.text ?? "");
        setStatus("completed");
        repo.cacheCompleted(a.learner, a.key, event.text ?? "", conceptId);
        lastPair.current = { question: a.question, answer: event.text ?? "" };
        active.current = null;
      }
      if (event.type === "failed") {
        setStatus("failed");
        setError(aiErrorMessage(event));
        active.current = null;
        void refreshAuth();
      }
      if (event.type === "cancelled") {
        setStatus("cancelled");
        active.current = null;
      }
    }
    handleEvent.current = handle;
    let sub: { remove(): void } | undefined;
    try {
      sub = getSiwc().addListener("onResponse", handle);
    } catch {}
    const appSub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && active.current?.requestId)
        void getSiwc().cancelResponse(active.current.requestId);
    });
    return () => {
      mounted.current = false;
      sub?.remove();
      appSub.remove();
      const id = active.current?.requestId;
      active.current = null;
      if (id) void getSiwc().cancelResponse(id);
    };
  }, [repo, conceptId, refreshAuth]);
  async function generate() {
    if (active.current || !concept) return;
    setError("");
    setText("");
    setStatus("loading");
    const a = {
      requestId: null as string | null,
      key: "",
      learner: repo.activeLearner,
      question: question.trim(),
      buffer: [] as AiEvent[],
    };
    active.current = a;
    try {
      let current = repo.snapshot();
      const model =
        current.settings.selectedModel &&
        models.some((m) => m.slug === current.settings.selectedModel)
          ? current.settings.selectedModel
          : models[0]?.slug;
      if (!model)
        throw Error("먼저 ChatGPT를 연결하고 모델 목록을 불러와 주세요.");
      if (current.settings.selectedModel !== model) {
        repo.updateSettings({ selectedModel: model });
        current = repo.snapshot();
        refresh();
      }
      const normalized = mode === "question" ? question.trim() : "";
      if (mode === "question" && (!normalized || normalized.length > 300))
        throw Error("질문은 1~300자로 입력해 주세요.");
      const context = buildLearningContext(current, conceptId);
      const pair = mode === "question" ? lastPair.current : null;
      const fingerprint = JSON.stringify([
        current.learnerId,
        conceptId,
        concept.contentVersion,
        mode,
        normalized,
        model,
        PROMPT_VERSION,
        current.memoryRevision,
        context,
        pair,
      ]);
      a.key = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        fingerprint,
      );
      if (
        active.current !== a ||
        !mounted.current ||
        a.learner !== repo.activeLearner
      )
        return;
      const cached = repo.readCache(a.key);
      if (cached) {
        setText(cached);
        setStatus("cached");
        lastPair.current = {
          question:
            normalized ||
            (mode === "example"
              ? "일상적인 예시로 설명해 주세요."
              : "쉽게 다시 설명해 주세요."),
          answer: cached,
        };
        active.current = null;
        return;
      }
      if (
        auth.status !== "ready" ||
        !auth.profileId ||
        !current.settings.aiConsentAt
      )
        throw Error("설정에서 ChatGPT 연결과 AI 전송 동의를 확인해 주세요.");
      const input = [
        { role: "user" as const, content: JSON.stringify({ mode, context }) },
        ...(pair
          ? [
              { role: "user" as const, content: pair.question },
              { role: "assistant" as const, content: pair.answer },
            ]
          : []),
        {
          role: "user" as const,
          content:
            normalized ||
            (mode === "example"
              ? "일상적인 예시로 설명해 주세요."
              : "쉽게 다시 설명해 주세요."),
        },
      ];
      if (
        active.current !== a ||
        !mounted.current ||
        a.learner !== repo.activeLearner
      )
        return;
      a.question = input[input.length - 1].content;
      const result = await getSiwc().startResponse(
        JSON.stringify({
          profileId: auth.profileId,
          model,
          instructions,
          input,
        }),
      );
      if (active.current !== a || !mounted.current) {
        void getSiwc().cancelResponse(result.requestId);
        return;
      }
      a.requestId = result.requestId;
      // All events use the same state transitions, regardless of bridge/promise ordering.
      const buffered = a.buffer.splice(0);
      for (const event of buffered) handleEvent.current(event);
    } catch (e) {
      if (active.current === a) {
        active.current = null;
        setStatus("failed");
        setError(e instanceof Error ? e.message : "설명을 생성하지 못했어요.");
      }
    }
  }
  if (!concept)
    return (
      <Screen>
        <Message text="개념을 찾지 못했어요." error />
      </Screen>
    );
  return (
    <Screen>
      <Heading>{concept.title}</Heading>
      <Small>AI가 생성하는 설명이에요. 기준 자료와 다를 수 있어요.</Small>
      {(["simplify", "example", "question"] as const).map((m, i) => (
        <Choice
          key={m}
          label={["쉽게 설명", "예시로 설명", "추가 질문"][i]}
          selected={mode === m}
          disabled={status === "loading"}
          onPress={() => setMode(m)}
        />
      ))}
      {mode === "question" && (
        <>
          <Small>궁금한 점 · 최대 300자</Small>
          <TextInput
            accessibilityLabel="추가 질문"
            multiline
            maxLength={300}
            editable={status !== "loading"}
            value={question}
            onChangeText={setQuestion}
            style={{
              ...type.body,
              borderWidth: 1,
              borderColor: colors.controlBorder,
              borderRadius: 12,
              padding: 16,
              minHeight: 100,
              color: colors.textPrimary,
            }}
          />
        </>
      )}
      {auth.status === "ready" ? (
        <>
          <Small>
            ChatGPT 플랜 사용 중 ·{" "}
            {models.find((m) => m.slug === snapshot.settings.selectedModel)
              ?.displayName ??
              models[0]?.displayName ??
              "모델 확인 중"}
          </Small>
          {!snapshot.settings.aiConsentAt && (
            <Button
              secondary
              label="학습 정보 전송에 동의"
              onPress={() => {
                repo.updateSettings({ aiConsentAt: Date.now() });
                refresh();
              }}
            />
          )}
        </>
      ) : (
        <Button
          label="ChatGPT 연결 설정"
          onPress={() => router.push("/settings")}
        />
      )}
      <Button
        secondary
        label="저장된 AI 설명 보기"
        disabled={status === "loading"}
        onPress={() => {
          const saved = repo.latestSavedExplanation(conceptId);
          if (saved) {
            setText(saved);
            setStatus("cached");
            setError("");
          } else setError("저장된 설명이 없어요.");
        }}
      />
      <Button
        label={status === "failed" ? "다시 시도" : "설명 생성"}
        disabled={status === "loading" || models.length === 0}
        onPress={() => void generate()}
      />
      {status === "loading" && (
        <Button
          secondary
          label="생성 취소"
          onPress={() => {
            const id = active.current?.requestId;
            if (id) void getSiwc().cancelResponse(id);
            else {
              active.current = null;
              setStatus("cancelled");
            }
          }}
        />
      )}
      {text && (
        <Surface>
          <Body>{text}</Body>
          <Small>
            {status === "cached"
              ? "저장된 AI 설명"
              : status === "completed"
                ? "AI가 생성한 설명"
                : "생성 중이거나 중단된 부분 설명이에요."}
          </Small>
        </Surface>
      )}
      {!!error && <Message text={error} error />}
      {!!modelError && <Message text={modelError} error />}
      {modelError && (
        <Button
          secondary
          label="모델 목록 다시 불러오기"
          onPress={retryModels}
        />
      )}
      {status === "cancelled" && <Small>설명 생성을 멈췄어요.</Small>}
      <Button
        secondary
        label="사용량 관리"
        onPress={() =>
          void Linking.openURL("https://chatgpt.com/settings/usage")
        }
      />
      <Small>기준 개념: {concept.oneLiner}</Small>
      <Button
        secondary
        label="기본 개념으로 돌아가기"
        onPress={() => router.back()}
      />
    </Screen>
  );
}
