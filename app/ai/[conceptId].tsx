import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, IconButton, Message } from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import {
  buildLearningContext,
  chatInstructions,
} from "../../src/services/ai/context";
import { aiErrorMessage } from "../../src/services/ai/errors";
import { useProfileModels } from "../../src/services/ai/useProfileModels";
import { openSubscriptionUsage } from "../../src/services/ai/subscriptionUsage";
import { AiResponseError, runRequest } from "../../src/services/ai/requestCoordinator";
import { RichText } from "../../src/components/RichText";
import type { ChatMessage } from "../../src/domain/types";
import { colors, fonts, type } from "../../src/theme/tokens";

const suggestions = ["쉽게 다시 설명해 줘", "예시로 설명해 줘", "시험에는 어떻게 나와?"];
const HISTORY_TURNS = 12;

export default function AskAi() {
  const { repo } = useApp();
  return <AskAiScreen key={repo.learningScope} />;
}

function AskAiScreen() {
  const {
    conceptId,
    quote: quoteParam,
    mode,
    questionId,
    selected,
  } = useLocalSearchParams<{
    conceptId: string;
    quote?: string;
    mode?: "hint" | "why";
    questionId?: string;
    selected?: string;
  }>();
  const { repo, snapshot, auth, refresh, refreshAuth } = useApp();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    repo.chatMessages(conceptId),
  );
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState(quoteParam?.trim() || "");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const { models, error: modelError, retry: retryModels } = useProfileModels(
    auth,
    refreshAuth,
  );
  const scroll = useRef<ScrollView>(null);
  const active = useRef<{
    controller: AbortController;
    learner: string;
    scope: string;
    consentAt: number | null;
  } | null>(null);
  const mounted = useRef(true);
  /** Invalidate immediately, including while the native request ID is still pending. */
  const stop = useCallback(() => {
    const turn = active.current;
    active.current = null;
    turn?.controller.abort();
    if (mounted.current) {
      setStreaming(null);
      setFailed(false);
    }
  }, []);
  const concept = snapshot.concepts.find((c) => c.id === conceptId);
  // Opened from a question: the question itself is the context, not a quoted passage.
  const question = (() => {
    if (!questionId) return null;
    try {
      return repo.quiz(questionId);
    } catch {
      return null;
    }
  })();
  const chosen = question?.options.find((o) => o.id === selected)?.text ?? null;
  const wasRight = !!question && selected === question.correctOptionId;
  const prompts =
    mode === "why"
      ? [
          "왜 이게 정답이야?",
          wasRight ? "다른 보기는 왜 아니야?" : "내가 고른 답은 왜 틀렸어?",
          "비슷한 예를 하나 들어 줘",
        ]
      : mode === "hint"
        ? ["힌트 하나만 줘", "이 문제가 묻는 게 뭐야?"]
        : suggestions;

  useEffect(() => {
    mounted.current = true;
    const appSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    const scope = repo.onScopeChange(stop);
    const consent = repo.onAiConsentChange(stop);
    return () => {
      mounted.current = false;
      appSub.remove();
      scope(); consent(); stop();
    };
  }, [repo, stop]);

  /** Sends the conversation so far; the newest user message is already stored. */
  async function respond(history: ChatMessage[]) {
    if (active.current || !concept) return;
    setError("");
    setFailed(false);
    setStreaming("");
    const a = {
      controller: new AbortController(),
      learner: repo.activeLearner,
      scope: repo.learningScope,
      consentAt: repo.snapshot().settings.aiConsentAt,
    };
    active.current = a;
    const currentTurn = () => active.current === a && mounted.current && !a.controller.signal.aborted &&
      a.learner === repo.activeLearner && a.scope === repo.learningScope && !!a.consentAt &&
      repo.snapshot().settings.aiConsentAt === a.consentAt &&
      AppState.currentState !== "background" && AppState.currentState !== "inactive";
    try {
      let current = repo.snapshot();
      const model =
        current.settings.selectedModel &&
        models.some((m) => m.slug === current.settings.selectedModel)
          ? current.settings.selectedModel
          : models[0]?.slug;
      if (!model) throw Error("먼저 ChatGPT를 연결하고 모델 목록을 불러와 주세요.");
      if (current.settings.selectedModel !== model) {
        repo.updateSettings({ selectedModel: model });
        current = repo.snapshot();
        refresh();
      }
      if (auth.status !== "ready" || !auth.profileId || !current.settings.aiConsentAt)
        throw Error("설정에서 ChatGPT 연결과 AI 전송 동의를 확인해 주세요.");
      const context = buildLearningContext(current, conceptId);
      const about = question
        ? {
            mode,
            prompt: question.prompt,
            context: question.context,
            options: question.options.map((o) => o.text),
            chosen,
            // The answer is only shared once the learner has answered.
            ...(mode === "why"
              ? {
                  correct: question.options.find((o) => o.id === question.correctOptionId)?.text,
                  explanation: question.explanation,
                }
              : {}),
          }
        : undefined;
      const input = [
        { role: "user" as const, content: JSON.stringify({ context, question: about }) },
        ...history.slice(-HISTORY_TURNS).map((m) => ({
          role: m.role,
          content: m.quote ? `「${m.quote}」\n\n${m.text}` : m.text,
        })),
      ];
      const text = await runRequest(
        "chat",
        { profileId: auth.profileId, model, instructions: chatInstructions, input },
        a.controller.signal,
        undefined,
        {
          canDispatch: currentTurn,
          onDelta: (text) => { if (currentTurn()) setStreaming((value) => (value ?? "") + text); },
        },
      );
      if (!currentTurn()) return;
      repo.addChatMessage(a.learner, conceptId, "assistant", text);
      setMessages(repo.chatMessages(conceptId));
    } catch (e) {
      if (currentTurn() && !(e instanceof AiResponseError && e.event.type === "cancelled")) {
        setFailed(true);
        const code = e && typeof e === "object" && "code" in e ? e.code : null;
        setError(e instanceof AiResponseError ? aiErrorMessage(e.event) : code === "response_busy"
          ? aiErrorMessage({ requestId: "", type: "failed", code })
          : e instanceof Error ? e.message : "답을 받지 못했어요.");
        void refreshAuth();
      }
    } finally {
      if (active.current === a) {
        active.current = null;
        if (mounted.current) setStreaming(null);
      }
    }
  }

  function send(text: string) {
    const body = text.trim() || (quote ? "이 부분이 이해가 안 돼요." : "");
    if (!body || active.current) return;
    if (body.length > 500) return setError("질문은 500자까지 보낼 수 있어요.");
    const saved = repo.addChatMessage(
      repo.activeLearner,
      conceptId,
      "user",
      body,
      quote || question?.prompt || null,
    );
    if (!saved) return;
    const history = repo.chatMessages(conceptId);
    setMessages(history);
    setDraft("");
    setQuote("");
    void respond(history);
  }

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, streaming]);

  if (!concept)
    return (
      <SafeAreaView style={s.screen}>
        <Message text="이 개념을 찾지 못했어요." error />
      </SafeAreaView>
    );
  const ready = auth.status === "ready";
  const busy = streaming !== null;

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={s.screen}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <IconButton icon="chevron-back" label="뒤로" color={colors.ink} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={s.title}>AI에게 물어보기</Text>
          <Text style={s.subtitle} numberOfLines={1}>{concept.title}</Text>
        </View>
        {messages.length > 0 && (
          <IconButton
            icon="trash-outline"
            label="대화 지우기"
            color={colors.bandText2}
            onPress={() =>
              Alert.alert("이 개념의 대화를 지울까요?", "", [
                { text: "취소", style: "cancel" },
                {
                  text: "지우기",
                  style: "destructive",
                  onPress: () => {
                    stop();
                    repo.clearChat(conceptId);
                    setMessages([]);
                  },
                },
              ])
            }
          />
        )}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={s.thread} keyboardShouldPersistTaps="handled">
        {question && (
          <View style={s.about}>
            <Text style={s.aboutLabel}>{mode === "why" ? "방금 푼 문제" : "지금 푸는 문제"}</Text>
            <Text style={s.aboutPrompt}>{question.prompt}</Text>
            {mode === "why" && chosen && <Text style={s.aboutMeta}>고른 답 · {chosen}</Text>}
          </View>
        )}
        {messages.length === 0 && !busy && !question && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>{concept.title}에서 막힌 곳을 물어보세요.</Text>
          </View>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} onScreen={question?.prompt ?? null} />
        ))}
        {busy && (
          <View style={[s.bubble, s.ai]} accessibilityLiveRegion="polite">
            <RichText style={[s.bubbleText, { color: colors.ink }]}>{streaming || "생각하는 중…"}</RichText>
          </View>
        )}
        {!!error && <Message text={error} error />}
        {failed && !busy && messages.at(-1)?.role === "user" && (
          <Button secondary label="다시 보내기" onPress={() => void respond(repo.chatMessages(conceptId))} />
        )}
        {!!modelError && <Message text={modelError} error />}
        {!!modelError && <Button secondary label="모델 목록 다시 불러오기" onPress={retryModels} />}
      </ScrollView>

      {!ready ? (
        <View style={s.gate}>
          {!!quote && (
            <View style={s.quoteChip}>
              <View style={s.quoteBar} />
              <Text style={s.quoteText} numberOfLines={2}>{quote}</Text>
            </View>
          )}
          <Text style={s.emptyBody}>ChatGPT를 연결하면 이 개념에 대해 AI와 이야기할 수 있어요.</Text>
          <Button label="ChatGPT 연결 설정" onPress={() => router.push("/settings")} />
        </View>
      ) : !snapshot.settings.aiConsentAt ? (
        <View style={s.gate}>
          <Text style={s.emptyBody}>개념·학습 요약·질문을 설명 생성에 보내요.</Text>
          <Button
            label="학습 정보 전송에 동의"
            onPress={() => {
              repo.updateSettings({ aiConsentAt: Date.now() });
              refresh();
            }}
          />
        </View>
      ) : (
        <View style={s.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="ChatGPT 플랜 사용 중, 구독 사용량 보기"
            disabled={busy} accessibilityState={{ disabled: busy }}
            onPress={() => void openSubscriptionUsage()} style={{ minHeight: 48, justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
            <Text style={{ ...type.small, color: colors.bandText2 }}>ChatGPT 플랜 사용 중 · 구독 사용량</Text>
          </Pressable>
          {(messages.length === 0 || !!question) && !quote && !busy && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {prompts.map((t) => (
                <Pressable key={t} accessibilityRole="button" onPress={() => send(t)} style={s.chip}>
                  <Text style={s.chipText}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {!!quote && (
            <View style={s.quoteChip}>
              <View style={s.quoteBar} />
              <Text style={s.quoteText} numberOfLines={2}>{quote}</Text>
              <IconButton icon="close" label="인용 빼기" color={colors.bandText2} onPress={() => setQuote("")} />
            </View>
          )}
          <View style={s.inputRow}>
            <TextInput
              accessibilityLabel="AI에게 보낼 메시지"
              value={draft}
              onChangeText={setDraft}
              placeholder={
                quote
                  ? "이 부분에서 뭐가 헷갈려요?"
                  : mode === "hint"
                    ? "어디서 막혔어요?"
                    : mode === "why"
                      ? "어떤 부분이 헷갈려요?"
                      : "궁금한 걸 물어보세요"
              }
              placeholderTextColor={colors.bandText2}
              multiline
              maxLength={500}
              editable={!busy}
              style={s.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="보내기"
              accessibilityState={{ disabled: busy || (!draft.trim() && !quote) }}
              disabled={busy || (!draft.trim() && !quote)}
              onPress={() => send(draft)}
              style={[s.send, (busy || (!draft.trim() && !quote)) && { opacity: 0.35 }]}
            >
              <Ionicons name="arrow-up" size={22} color={colors.band} accessible={false} />
            </Pressable>
          </View>
          {busy && (
            <Pressable
              accessibilityRole="button"
              onPress={stop}
              style={s.stop}
            >
              <Text style={s.stopText}>답변 멈추기</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

/**
 * [onScreen] is the question already shown at the top; a message about it gets a small
 * tag instead of repeating the sentence. Other quotes widen the bubble so they read in full lines.
 */
function Bubble({ message, onScreen }: { message: ChatMessage; onScreen: string | null }) {
  const mine = message.role === "user";
  const aboutQuestion = !!message.quote && message.quote === onScreen;
  return (
    <View style={[s.bubble, mine ? s.me : s.ai, !!message.quote && !aboutQuestion && s.quoted]}>
      {aboutQuestion ? (
        <View style={s.tag}>
          <Ionicons name="return-down-forward-outline" size={13} color={colors.inkSoft} accessible={false} />
          <Text style={s.tagText}>이 문제에 대해</Text>
        </View>
      ) : (
        !!message.quote && (
          <View style={s.bubbleQuote}>
            <View style={[s.quoteBar, { backgroundColor: mine ? colors.inkMuted : colors.bandLabel }]} />
            <Text style={[s.quoteText, { color: mine ? colors.inkSoft : colors.bandText2 }]} numberOfLines={2}>
              {message.quote}
            </Text>
          </View>
        )
      )}
      {mine ? (
        <Text selectable style={[s.bubbleText, { color: colors.band }]}>
          {message.text}
        </Text>
      ) : (
        <RichText selectable style={[s.bubbleText, { color: colors.ink }]}>
          {message.text}
        </RichText>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.band },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 2 },
  title: { ...type.title, fontSize: 22, lineHeight: 30, color: colors.ink },
  subtitle: { ...type.small, fontSize: 13, color: colors.bandText2 },
  thread: { padding: 20, gap: 12, flexGrow: 1 },
  about: { borderRadius: 14, backgroundColor: "rgba(18,21,19,0.06)", padding: 16, gap: 6 },
  aboutLabel: { ...type.label, color: colors.bandLabel },
  aboutPrompt: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 27, color: colors.ink },
  aboutMeta: { ...type.small, color: colors.bandText2 },
  empty: { flexGrow: 1, justifyContent: "center", gap: 8, paddingVertical: 48 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 32, color: colors.ink },
  emptyBody: { ...type.small, fontSize: 15, lineHeight: 23, color: colors.bandText2 },
  bubble: { maxWidth: "86%", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  me: { alignSelf: "flex-end", backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  ai: { alignSelf: "flex-start", backgroundColor: "rgba(18,21,19,0.06)", borderBottomLeftRadius: 4 },
  bubbleText: { ...type.body, fontSize: 16, lineHeight: 25 },
  bubbleQuote: { flexDirection: "row", gap: 8 },
  quoted: { minWidth: "72%" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
  tagText: { ...type.small, fontSize: 12, lineHeight: 16, color: colors.inkSoft },
  composer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.bandLine,
  },
  chip: { borderRadius: 18, borderWidth: 1, borderColor: colors.bandLine, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  chipText: { ...type.small, color: colors.ink },
  quoteChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bandFaint, borderRadius: 10, paddingLeft: 12 },
  quoteBar: { width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: colors.bandLabel },
  quoteText: { ...type.small, flex: 1, color: colors.bandText2, paddingVertical: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    ...type.body,
    fontSize: 16,
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderRadius: 24,
    backgroundColor: colors.bandFaint,
    paddingHorizontal: 18,
    paddingVertical: 11,
    color: colors.ink,
  },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  stop: { alignSelf: "center", minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  stopText: { ...type.small, color: colors.bandLabel, fontFamily: fonts.medium },
  gate: { padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.bandLine },
});
