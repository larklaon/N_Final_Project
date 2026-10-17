import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Band,
  BandBody,
  BandLabel,
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
import { dailyCount, fittedToday, planConcept } from "../domain/selection";
import { planDay } from "../domain/plan";
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
  learner: string;
  /** The answered session stays on screen until "다음". */
  pinned: Session | null;
  selected: string;
  extra: boolean;
  error: string;
};

export function QuestionScreen() {
  const { repo, snapshot, refresh, now, auth, refreshAuth } = useApp();
  const router = useRouter();
  const { open, overlay } = useGapTransition();
  const { models } = useProfileModels(auth, refreshAuth);
  const { plan, ensure } = usePlan(repo, auth, models, snapshot.memoryRevision, refresh);
  const today = planDay(plan, now);
  const canAsk = auth.status === "ready";
  const learner = snapshot.learnerId;
  const [stored, setLocal] = useState<Local>({
    learner,
    pinned: null,
    selected: "",
    extra: false,
    error: "",
  });
  // A different learner (profile switch, reset) starts fresh.
  const local: Local =
    stored.learner === learner
      ? stored
      : { learner, pinned: null, selected: "", extra: false, error: "" };
  const update = (patch: Partial<Local>) => setLocal({ ...local, ...patch });
  const { pinned, selected, extra } = local;
  const target = pinned ? null : planConcept(snapshot, now, plan, extra);
  // openSession is idempotent for an unanswered occurrence, so deriving it is safe.
  const opened = useMemo(() => {
    if (!target) return { session: null, error: "" };
    try {
      return { session: repo.openSession(target.id), error: "" };
    } catch {
      return {
        session: null,
        error: "문제를 열지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      };
    }
  }, [target, repo]);
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
          levels={area.pieces.map((p) => p.band)}
          ring={
            answered?.correct && answered.graded && concept
              ? ringed([concept.id])
              : !session
                ? ringed(fittedToday(snapshot, now).map((c) => c.id))
                : []
          }
        />
        <Text style={[s.headerText, answered?.correct && { color: colors.band }]}>
          {area.average}%
        </Text>
      </Pressable>
      <View style={s.headerRight}>
        <Text
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
            <BandBody>
              {today.length
                ? `새로 맞춘 조각 · ${today.map((c) => c.title).join(", ")}`
                : "복습할 조각도, 새로 열 조각도 지금은 없어요."}
            </BandBody>
          </Band>
          <DarkNote icon="phone-portrait-outline">
            {snapshot.settings.gapEnabled
              ? "나머지는 잠금 화면에서 조금씩 이어져요."
              : "설정에서 잠금 화면 카드를 켜면 틈틈이 이어져요."}
          </DarkNote>
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
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/ai/[conceptId]",
          params: {
            conceptId: concept.id,
            mode: answered ? "why" : "hint",
            questionId: quiz.id,
            selected: answered?.selected ?? selected,
          },
        })
      }
      style={({ pressed }) => [s.askBar, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.inkSoft} accessible={false} />
      <Text style={s.askText}>{answered ? "왜 그런지 AI에게 물어보기" : "힌트 물어보기"}</Text>
    </Pressable>
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
            <BandLabel>
              {session.practice ? `${concept.area} · 연습` : concept.area}
            </BandLabel>
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
              <Ionicons name="checkmark-circle" size={22} color={colors.ink} accessible={false} />
              <Text style={s.verdictText}>맞았어요</Text>
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
        {!answered && !!today?.note && (
          <DarkNote icon="sparkles-outline">{today.note}</DarkNote>
        )}
        {answered && !answered.graded && (
          <DarkNote icon="information-circle-outline">
            연습이라 진도와 복습 일정에는 반영하지 않았어요.
          </DarkNote>
        )}
        {used && (
          <DarkNote icon="eye-outline">
            {whenSeen(used.lastSeenAt, now)} 스치듯 본{" "}
            <Text style={{ color: colors.inkText }}>&apos;{used.title}&apos;</Text> 조각이 이
            문제에 쓰였어요.
          </DarkNote>
        )}
        {answered && answered.graded && !answered.correct && (
          <DarkNote icon="refresh-outline">
            {snapshot.settings.gapEnabled
              ? "이 조각은 내일 잠금 화면에 다시 놓여요."
              : "이 조각은 잠시 뒤 다시 나와요."}
          </DarkNote>
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
  verdictText: { ...type.small, fontFamily: fonts.semibold, color: colors.bandLabel },
  chosen: { ...type.small, color: colors.bandText2 },
  askBar: {
    minHeight: 48,
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.inkLine,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  askText: { ...type.small, color: colors.inkSoft },
});
