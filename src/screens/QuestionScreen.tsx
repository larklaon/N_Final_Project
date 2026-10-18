import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Band,
  BandBody,
  BandLabelRow,
  ContextBlock,
  DarkNote,
  DarkScreen,
  IconButton,
  OptionRow,
  PrimaryButton,
  PuzzleMap,
  TextLink,
  useReducedMotion,
} from "../components/ui";
import { useApp } from "../platform/AppProvider";
import { AskBar } from "../components/AskBar";
import { dailyCount, fittedToday, planConcept } from "../domain/selection";
import { usePlan } from "../services/ai/plan";
import { useProfileModels } from "../services/ai/useProfileModels";
import { puzzle, seenPieceUsed, whenSeen } from "../domain/puzzle";
import type { Session } from "../domain/types";
import { colors, fonts, type } from "../theme/tokens";

/** The gap opening: the band grows to fill the screen before a light screen appears. */
function useGapTransition() {
  const reduced = useReducedMotion();
  const [grow] = useState(() => new Animated.Value(0));
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const returning = useRef(false);
  const open = (href: Href) => {
    if (reduced) return router.push(href);
    setVisible(true);
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      returning.current = true;
      router.push(href);
    });
  };
  useFocusEffect(
    useCallback(() => {
      if (!returning.current) return;
      returning.current = false;
      // Coming back: the light screen narrows into the band again.
      Animated.timing(grow, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }, [grow]),
  );
  const overlay = visible ? (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.band,
          opacity: grow.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scaleY: grow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.12] }) },
            { skewY: grow.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "0deg"] }) },
          ],
        },
      ]}
    />
  ) : null;
  return { open, overlay };
}

type Local = {
  /** The answered session stays on screen until "다음". */
  pinned: Session | null;
  selected: string;
  extra: boolean;
  error: string;
};

/**
 * The gap piece this question leaned on: when it was seen, how it went then, and a way
 * to step aside and try that card again.
 */
function SeenPiece({
  when,
  title,
  past,
  onPress,
}: {
  when: string;
  title: string;
  past: boolean | null;
  onPress: () => void;
}) {
  const result = past === null ? "" : past ? "맞혔어요" : "틀렸어요";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${when} 스친 조각 ${title}${result && `, 그때 ${result}`}. 다시 풀기`}
      onPress={onPress}
      style={({ pressed }) => [s.seen, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="eye-outline" size={18} color={colors.inkMuted} accessible={false} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.seenMeta}>
          {when} 스친 조각
          {!!result && (
            <Text style={{ color: past ? colors.mint : colors.dangerOnInk }}>
              {"  "}
              {past ? "✓ " : "✕ "}
              {result}
            </Text>
          )}
        </Text>
        <Text style={s.seenTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={s.seenGo}>다시 풀기</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} accessible={false} />
    </Pressable>
  );
}

export function QuestionScreen() {
  const { repo } = useApp();
  return <ScopedQuestionScreen key={repo.learningScope} />;
}

function ScopedQuestionScreen() {
  const narrow = useWindowDimensions().width < 380;
  const { repo, snapshot, refresh, now, auth, refreshAuth } = useApp();
  const router = useRouter();
  const { open, overlay } = useGapTransition();
  const { models } = useProfileModels(auth, refreshAuth);
  const { plan, ensure } = usePlan(repo, auth, models, snapshot.memoryRevision, refresh);
  const canAsk = auth.status === "ready";
  const [local, setLocal] = useState<Local>({
    pinned: null,
    selected: "",
    extra: false,
    error: "",
  });
  const update = (patch: Partial<Local>) => setLocal((current) => ({ ...current, ...patch }));
  const { pinned, selected, extra } = local;
  const target = pinned ? null : planConcept(snapshot, now, plan, extra);
  // openSession is idempotent for an unanswered occurrence, so deriving it is safe.
  const opened = useMemo(() => {
    if (!target) return { session: null, error: "" };
    try {
      // V4: today's check question takes one goal slot, after a question already started.
      const check = !extra && !repo.hasOpenSession(target.id) ? repo.checkSession() : null;
      return { session: check ?? repo.openSession(target.id), error: "" };
    } catch {
      return {
        session: null,
        error: "문제를 열지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      };
    }
  }, [target, repo, extra]);
  const session = pinned ?? opened.session;
  const error = local.error || opened.error;

  const concept = session
    ? snapshot.concepts.find((c) => c.id === session.conceptId)
    : undefined;
  const quiz = session ? repo.quiz(session.quizId) : null;
  const areaName = concept?.area ?? fittedToday(snapshot, now).at(-1)?.area ??
    snapshot.concepts[0].area;
  const area = puzzle(snapshot, now).find((a) => a.area === areaName)!;
  const ringed = (ids: string[]) =>
    area.pieces.flatMap((p, i) => (ids.includes(p.conceptId) ? [i] : []));
  const answered = session?.answer;

  function submit() {
    if (!session || !selected) return;
    try {
      const answer = repo.submit(session.id, selected);
      update({ pinned: { ...session, answer }, error: "" });
      refresh();
    } catch {
      update({ error: "기록하지 못했어요. 고른 답은 그대로예요. 다시 시도해 주세요." });
    }
  }
  function next() {
    update({ pinned: null, selected: "", error: "" });
    refresh();
  }

  const header = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`퍼즐 보기. ${area.area} 평균 해상도 ${area.average}%`}
        onPress={() => open("/puzzle")}
        style={({ pressed }) => [s.mapButton, pressed && { opacity: 0.7 }]}
      >
        <PuzzleMap
          // A narrow phone keeps the close button on screen with slightly smaller pieces.
          size={narrow ? 6 : 8}
          levels={area.pieces.map((p) => p.band)}
          ring={
            answered?.correct && answered.graded && concept
              ? ringed([concept.id])
              : !session
                ? ringed(fittedToday(snapshot, now).map((c) => c.id))
                : []
          }
        />
        <Text maxFontSizeMultiplier={1.1} style={[s.headerText, answered?.correct && { color: colors.mint }]}>
          {area.average}%
        </Text>
      </Pressable>
      <View style={s.headerRight}>
        <Text
          maxFontSizeMultiplier={1.1}
          style={s.headerText}
          accessibilityLabel={`오늘 ${dailyCount(snapshot, now)}문제, 목표 ${snapshot.settings.dailyGoal}문제`}
        >
          {Math.min(dailyCount(snapshot, now), snapshot.settings.dailyGoal)} /{" "}
          {snapshot.settings.dailyGoal}
        </Text>
        <IconButton
          icon="ellipsis-horizontal"
          label="설정"
          color={colors.inkMuted}
          onPress={() => open("/settings")}
        />
        <IconButton
          icon="close"
          label="닫기"
          color={colors.inkMuted}
          onPress={() => BackHandler.exitApp()}
        />
      </View>
    </>
  );

  if (!session || !quiz || !concept) {
    if (target) return <DarkScreen header={header}>{null}</DarkScreen>;
    const today = fittedToday(snapshot, now);
    const finished = dailyCount(snapshot, now) >= snapshot.settings.dailyGoal;
    return (
      <View style={{ flex: 1 }}>
        <DarkScreen
          header={header}
          footer={
            <TextLink
              tone="dark"
              label="조금 더 풀기"
              onPress={() => {
                update({ extra: true, pinned: null });
                ensure();
              }}
            />
          }
        >
          <Band thin slant={4}>
            <Text style={[type.title, s.bandText, { fontSize: 34, lineHeight: 44 }]}>
              {finished ? "오늘 몫은 끝." : "지금은 쉬어 가요."}
            </Text>
            {!!today.length && (
              <BandBody>{`새로 맞춘 조각 · ${today.map((c) => c.title).join(", ")}`}</BandBody>
            )}
          </Band>
          {!!error && <DarkNote icon="alert-circle-outline">{error}</DarkNote>}
        </DarkScreen>
        {overlay}
      </View>
    );
  }

  const correctText =
    quiz.options.find((o) => o.id === quiz.correctOptionId)?.text ?? "";
  const chosenText =
    quiz.options.find((o) => o.id === answered?.selected)?.text ?? "";
  const used = answered?.correct ? seenPieceUsed(snapshot, quiz) : null;
  const answerStyle = correctText.length <= 10 ? type.answer : type.answerLong;
  const askBar = canAsk ? (
    <AskBar
      conceptId={concept.id}
      questionId={quiz.id}
      selected={answered?.selected ?? selected}
      answered={!!answered}
    />
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <DarkScreen
        header={header}
        footer={
          answered ? (
            <>
              <PrimaryButton label="다음" onPress={next} />
              <TextLink
                tone="dark"
                label="이 개념 깊게 보기"
                onPress={() =>
                  open({ pathname: "/concept/[conceptId]", params: { conceptId: concept.id } })
                }
              />
              {askBar}
            </>
          ) : (
            <>
              <PrimaryButton label="확인" disabled={!selected} onPress={submit} />
              {askBar}
            </>
          )
        }
      >
        {!answered ? (
          <Band>
            <BandLabelRow ai={!!quiz.origin}>
              {session.practice ? `${concept.area} · 연습` : concept.area}
            </BandLabelRow>
            <Text accessibilityRole="header" style={[type.question, s.bandText]}>
              {quiz.prompt}
            </Text>
            {quiz.context && (
              <ContextBlock text={quiz.context} code={quiz.contextIsCode} />
            )}
            <View accessibilityRole="radiogroup" style={{ gap: 8, marginTop: 8 }}>
              {session.options.map((o, i) => (
                <OptionRow
                  key={o.id}
                  index={i + 1}
                  label={o.text}
                  selected={selected === o.id}
                  onPress={() => update({ selected: o.id })}
                />
              ))}
            </View>
          </Band>
        ) : answered.correct ? (
          <Band slant={4}>
            <View style={s.verdict} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={22} color={colors.mintText} accessible={false} />
              <Text style={[s.verdictText, s.verdictRight]}>맞았어요</Text>
            </View>
            <Text style={[answerStyle, s.bandText]}>{correctText}</Text>
            <BandBody>{quiz.explanation}</BandBody>
          </Band>
        ) : (
          <Band slant={4}>
            <Text style={s.chosen} accessibilityLiveRegion="polite">
              고른 답{" "}
              <Text style={{ textDecorationLine: "line-through" }}>{chosenText}</Text>
            </Text>
            <View style={{ gap: 2 }}>
              <Text style={s.verdictText}>정답은</Text>
              <Text style={[answerStyle, s.bandText]}>{correctText}</Text>
            </View>
            <BandBody>{quiz.explanation}</BandBody>
          </Band>
        )}
        {used && (
          <SeenPiece
            when={whenSeen(used.lastSeenAt, now)}
            title={used.title}
            past={repo.lastGapAnswer(used.conceptId)?.correct ?? null}
            onPress={() =>
              router.push({ pathname: "/revisit/[conceptId]", params: { conceptId: used.conceptId } })
            }
          />
        )}
        {!!error && <DarkNote icon="alert-circle-outline">{error}</DarkNote>}
      </DarkScreen>
      {overlay}
    </View>
  );
}

const s = StyleSheet.create({
  mapButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
  },
  headerRight: { flexDirection: "row", alignItems: "center", marginRight: -12 },
  headerText: { ...type.small, fontSize: 13, color: colors.inkMuted },
  bandText: { color: colors.ink },
  verdict: { flexDirection: "row", alignItems: "center", gap: 8 },
  seen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    marginHorizontal: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inkLine,
  },
  seenMeta: { ...type.small, fontSize: 13, color: colors.inkMuted },
  seenTitle: { ...type.option, fontFamily: fonts.semibold, color: colors.inkText },
  seenGo: { ...type.small, fontSize: 13, color: colors.inkSoft },
  verdictText: { ...type.small, fontFamily: fonts.semibold, color: colors.bandLabel },
  verdictRight: { color: colors.mintText },
  chosen: { ...type.small, color: colors.bandText2 },
});
