import { useEffect, useState } from "react";
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  Screen,
  SectionLabel,
  Small,
  Button,
  Choice,
  Message,
  Row,
  Segmented,
  Toggle,
} from "../src/components/ui";
import { useApp } from "../src/platform/AppProvider";
import { Wheel } from "../src/components/Wheel";
import { getSiwc } from "../modules/siwc-android";
import { getGap, type GapPreview } from "../modules/gap-android";
import { enableGap, mutateLearningWithGap } from "../src/services/gap/sync";
import { useProfileModels } from "../src/services/ai/useProfileModels";
import { openSubscriptionUsage } from "../src/services/ai/subscriptionUsage";
import { dailyGoals, gapIntervals } from "../src/data/repositories/LearningRepository";
import { colors, fonts, type } from "../src/theme/tokens";
import { packOf } from "../src/data/content/packs";
import { CONSENT_VERSION } from "../src/domain/personalization";

/** A system-style mock of the card that is on the lock screen right now. */
function CardPreview({ card, hours }: { card: GapPreview; hours: string }) {
  return (
    <View
      style={p.wrap}
      accessible
      accessibilityLabel={`잠금 화면 카드 미리보기${card.origin === "ai" ? ", AI가 만든 카드" : ""}: ${card.prompt}`}
    >
      <View style={p.card}>
        <View style={p.head}>
          <View style={p.icon}>
            <View style={p.slit} />
          </View>
          <Text style={p.meta}>
            틈지식 · {card.area}
            {card.origin === "ai" ? " · AI" : ""}
          </Text>
        </View>
        <View style={p.row}>
          <View style={p.band}>
            <Text style={p.prompt} numberOfLines={2}>
              {card.short || card.prompt}
            </Text>
          </View>
          {card.type === "ox" &&
            card.options.map((o) => (
              <View key={o.id} style={p.ox}>
                <Text style={p.oxText}>{o.id.toUpperCase()}</Text>
              </View>
            ))}
        </View>
      </View>
      {!card.onLockScreen && <Text style={p.caption}>숨겨져 있어요 · {hours}</Text>}
    </View>
  );
}
const p = StyleSheet.create({
  wrap: { gap: 8, paddingVertical: 12 },
  card: {
    backgroundColor: "#F8FAF8",
    borderRadius: 22,
    padding: 16,
    gap: 10,
    shadowColor: "#121513",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bandLabel, alignItems: "center", justifyContent: "center" },
  slit: { width: 14, height: 5, backgroundColor: "#FFFFFF", transform: [{ skewY: "-12deg" }] },
  meta: { ...type.small, fontSize: 13, color: colors.bandText2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 32 },
  band: { flex: 1, backgroundColor: colors.band, paddingHorizontal: 12, paddingVertical: 6 },
  prompt: { fontFamily: fonts.serif, fontSize: 14, lineHeight: 20, color: colors.ink },
  ox: { width: 40, height: 36, borderRadius: 9, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  oxText: { fontFamily: fonts.serif, fontSize: 16, color: colors.band },
  caption: { ...type.small, fontSize: 13, color: colors.bandText2 },
});

const labels = {
  disconnected: "연결 안 됨",
  authorizing: "브라우저에서 연결 중",
  connectedWithoutPlan: "로그인됨 · 플랜 사용 권한 필요",
  ready: "ChatGPT 플랜 사용 가능",
  reconnectRequired: "다시 연결해 주세요",
  temporarilyUnavailable: "잠시 연결할 수 없어요",
};
const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const minutes = ["00", "10", "20", "30", "40", "50"];
/** Snap a stored time (e.g. an older 23:59) onto the wheel's 10-minute grid. */
const onGrid = (t: string) => {
  const [h, m] = t.split(":");
  return [h, String(Math.min(50, Math.floor(Number(m) / 10) * 10)).padStart(2, "0")] as const;
};

/** Pick the card hours freely with four wheels: start hour·minute, end hour·minute. */
function WindowSheet({
  start,
  end,
  onClose,
  onSave,
}: {
  start: string;
  end: string;
  onClose: () => void;
  onSave: (start: string, end: string) => void;
}) {
  const [[sh, sm], setStart] = useState(() => onGrid(start));
  const [[eh, em], setEnd] = useState(() => onGrid(end));
  const from = `${sh}:${sm}`;
  const to = `${eh}:${em}`;
  const ok = from < to;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={w.scrim} accessibilityLabel="닫기" onPress={onClose} />
      <View style={w.sheet}>
        <View style={w.grabber} />
        <Text style={w.title}>카드를 보여 줄 시간</Text>
        <View style={w.row}>
          {[
            { label: "시작", h: sh, m: sm, set: (h: string, m: string) => setStart([h, m]) },
            { label: "끝", h: eh, m: em, set: (h: string, m: string) => setEnd([h, m]) },
          ].map((t, i) => (
            <View key={t.label} style={{ flexDirection: "row", alignItems: "center" }}>
              {i === 1 && <Text style={w.dash}>–</Text>}
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={w.label}>{t.label}</Text>
                <View style={w.pair}>
                  <Wheel label={`${t.label} 시`} values={hours} value={t.h} onChange={(h) => t.set(h, t.m)} />
                  <Text style={w.colon}>:</Text>
                  <Wheel label={`${t.label} 분`} values={minutes} value={t.m} onChange={(m) => t.set(t.h, m)} />
                </View>
              </View>
            </View>
          ))}
        </View>
        <Text style={[w.hint, ok && { opacity: 0 }]}>끝이 시작보다 늦어야 해요</Text>
        <Button label="저장" disabled={!ok} onPress={() => onSave(from, to)} />
      </View>
    </Modal>
  );
}
const w = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(18,21,19,0.35)" },
  sheet: {
    backgroundColor: colors.band,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 12,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.bandLine, marginBottom: 8 },
  title: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 30, color: colors.ink },
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  label: { ...type.label, color: colors.bandLabel },
  pair: { flexDirection: "row", alignItems: "center" },
  colon: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, marginHorizontal: 2 },
  dash: { fontFamily: fonts.serif, fontSize: 22, color: colors.bandText2, marginHorizontal: 10, marginTop: 24 },
  hint: { ...type.small, textAlign: "center", color: colors.danger },
});

export default function Settings() {
  const { repo, snapshot, refresh, auth, profiles, refreshAuth } = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [canPin, setCanPin] = useState(false);
  const [preview, setPreview] = useState<GapPreview | null>(null);
  const [notice, setNotice] = useState("");
  const {
    models,
    error: modelError,
    retry: retryModels,
  } = useProfileModels(auth, refreshAuth);
  const { settings } = snapshot;

  useEffect(() => {
    void Notifications.getPermissionsAsync()
      .then((p) => setPermission(p.granted))
      .catch(() => setPermission(null));
    void getGap()?.canPinWidget().then(setCanPin).catch(() => setCanPin(false));
  }, [settings.gapEnabled]);
  const revision = snapshot.memoryRevision;
  useEffect(() => {
    if (!settings.gapEnabled) return;
    // The native card follows a sync that may still be running; read it a moment later.
    const t = setTimeout(() => {
      void getGap()?.current().then(setPreview).catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [settings.gapEnabled, settings.gapStart, settings.gapEnd, revision, notice]);

  async function run(action: () => void | Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "작업을 마치지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      // Local changes may have committed even if a native operation failed.
      refresh();
      await refreshAuth();
      setBusy(false);
    }
  }
  function connect(profile: string | null, requestPlanConsent = false) {
    Alert.alert(
      "ChatGPT 연결 안내",
      "개념·학습 요약·입력 질문을 OpenAI에 전송해 개인화 설명을 만들어요. ChatGPT 플랜 사용량이 적용돼요. 첫 연결은 현재 기기의 학습 기록과 연결돼요. AI 맞춤 학습은 설정에서 따로 켜요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "동의하고 연결",
          onPress: () =>
            void run(async () => {
              repo.updateSettings({ aiConsentAt: Date.now() });
              await getSiwc().signIn(profile, requestPlanConsent);
            }),
        },
      ],
    );
  }
  function confirmReset(all: boolean) {
    Alert.alert(
      all ? "모든 데이터를 삭제할까요?" : "학습 기록을 초기화할까요?",
      all
        ? "모든 학습 기록과 ChatGPT 연결 정보가 이 기기에서 삭제돼요. 되돌릴 수 없어요."
        : "현재 프로필의 학습 기록, 퍼즐 조각, 저장된 AI 설명을 지우고 잠금 화면 카드를 꺼요. ChatGPT 연결은 유지돼요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () =>
            void run(async () => {
              await mutateLearningWithGap(repo, async () => {
                if (all) {
                  await getSiwc().eraseAll();
                  repo.eraseAll();
                } else repo.resetCurrent();
              });
              if (all) router.replace("/");
            }),
        },
      ],
    );
  }
  /** V4 AI 맞춤 학습: separate from the send consent; off cancels work and rebuilds the deck. */
  function setPersonal(on: boolean) {
    void run(() =>
      mutateLearningWithGap(repo, () =>
        repo.updateSettings(
          on
            ? { personalizationEnabled: true, personalizationConsentAt: Date.now(), personalizationConsentVersion: CONSENT_VERSION }
            : { personalizationEnabled: false },
        ),
      ),
    );
  }
  const personalFailed =
    settings.personalizationEnabled && repo.personal.lastJob(snapshot.learnerId)?.status === "failed";
  const [windowOpen, setWindowOpen] = useState(false);
  const currentProfile = profiles.find((p) => p.profileId === auth.profileId);

  return (
    <Screen title="설정">
      <View>
        <SectionLabel>학습</SectionLabel>
        <Row
          label="과목"
          value={packOf(settings.subjectId).title}
          onPress={() => router.push("/subjects")}
        />
        <Row
          label="하루에 풀 문제"
          last
          right={
            <Segmented
              label="하루에 풀 문제"
              options={dailyGoals}
              value={settings.dailyGoal}
              disabled={busy}
              onChange={(n) => void run(() => repo.updateSettings({ dailyGoal: n }))}
            />
          }
        />
      </View>

      <View>
        <SectionLabel>틈새 카드</SectionLabel>
        <Row
          label="잠금 화면 카드"
          right={
            <Toggle
              label="잠금 화면 카드"
              value={settings.gapEnabled}
              disabled={busy}
              onValueChange={(on) =>
                void run(async () => {
                  setNotice("");
                  if (on) {
                    await enableGap(repo);
                    setNotice(String(Date.now())); // re-reads the preview
                  } else repo.updateSettings({ gapEnabled: false });
                })
              }
            />
          }
        />
        {settings.gapEnabled && permission !== false && preview && (
          <CardPreview card={preview} hours={`${settings.gapStart}–${settings.gapEnd}`} />
        )}
        {settings.gapEnabled && permission === false && (
          <Row
            label="알림 권한이 꺼져 있어요"
            sub="권한을 켜야 잠금 화면에 카드가 놓여요"
            onPress={() => void Linking.openSettings()}
          />
        )}
        <Row
          label="카드가 바뀌는 간격"
          right={
            <Segmented
              label="카드가 바뀌는 간격"
              options={gapIntervals}
              value={settings.gapIntervalMinutes}
              format={(m) => (m === 60 ? "1시간" : `${m}분`)}
              disabled={busy}
              onChange={(m) =>
                void run(() => repo.updateSettings({ gapIntervalMinutes: m }))
              }
            />
          }
        />
        <Row
          label="카드를 보여 줄 시간"
          value={`${settings.gapStart} – ${settings.gapEnd}`}
          onPress={() => setWindowOpen(true)}
          last={!canPin}
        />
        {canPin && (
          <Row
            label="홈 화면에 위젯 놓기"
            last
            onPress={() => void getGap()?.pinWidget()}
          />
        )}
      </View>

      <View style={{ gap: 12 }}>
        <SectionLabel>ChatGPT</SectionLabel>
        <Row
          label={labels[auth.status]}
          sub={
            auth.message ??
            (currentProfile?.label ?? "연결하면 내 기록에 맞춘 설명을 받아요")
          }
          last
        />
        {auth.status === "authorizing" ? (
          <Button
            secondary
            label="연결 취소"
            onPress={() => void run(() => getSiwc().cancelSignIn())}
          />
        ) : auth.status === "ready" ? null : (
          // Already connected: no sign-in button, only "add another account" below.
          <Button
            label={
              auth.status === "connectedWithoutPlan"
                ? "ChatGPT 플랜 사용 허용"
                : "Continue with ChatGPT"
            }
            disabled={busy}
            onPress={() =>
              connect(
                auth.profileId ?? null,
                auth.status === "connectedWithoutPlan",
              )
            }
          />
        )}
        <Button
          secondary
          label="다른 ChatGPT 계정 추가"
          disabled={busy || auth.status === "authorizing"}
          onPress={() => connect(null)}
        />
        {profiles.length > 0 && (
          <View style={{ gap: 8 }}>
            <Small>학습 프로필</Small>
            <Choice
              label="기본 학습 프로필"
              selected={!auth.profileId}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await mutateLearningWithGap(repo, async () => {
                    await getSiwc().selectProfile(null);
                    repo.selectProfile(null);
                  });
                })
              }
            />
            {profiles.map((p) => (
              <Choice
                key={p.profileId}
                label={`${p.label}${p.connected ? "" : " · 재연결 필요"}`}
                selected={p.profileId === auth.profileId}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await mutateLearningWithGap(repo, async () => {
                      await getSiwc().selectProfile(p.profileId);
                      repo.selectProfile(p.profileId);
                    });
                  })
                }
              />
            ))}
          </View>
        )}
        {!!modelError && <Message text={modelError} error />}
        {!!modelError && (
          <Button secondary label="모델 목록 다시 불러오기" onPress={retryModels} />
        )}
        {models.length > 0 && (
          <View style={{ gap: 8 }}>
            <Small>설명에 사용할 모델</Small>
            {models.map((m) => (
              <Choice
                key={m.slug}
                label={m.displayName}
                selected={(settings.selectedModel ?? models[0].slug) === m.slug}
                onPress={() =>
                  void run(() => repo.updateSettings({ selectedModel: m.slug }))
                }
              />
            ))}
          </View>
        )}
        <View>
          <Row
            label="AI 학습 정보 전송 동의"
            sub="개념·학습 요약·질문을 설명 생성에 사용"
            right={
              <Toggle
                label="AI 학습 정보 전송 동의"
                value={settings.aiConsentAt !== null}
                onValueChange={(on) =>
                  void run(() =>
                    on
                      ? repo.updateSettings({ aiConsentAt: Date.now() })
                      : // Withdrawing the send consent also stops personalization.
                        mutateLearningWithGap(repo, () =>
                          repo.updateSettings({ aiConsentAt: null, personalizationEnabled: false }),
                        ),
                  )
                }
              />
            }
          />
          <Row
            label="AI 맞춤 학습"
            sub={
              personalFailed
                ? "맞춤 카드를 준비하지 못했어요. 기본 카드로 이어가요."
                : "오답과 이 앱의 대화를 바탕으로 카드와 확인 문제를 준비해요."
            }
            right={
              <Toggle
                label="AI 맞춤 학습"
                value={settings.personalizationEnabled}
                disabled={busy || (settings.aiConsentAt === null && !settings.personalizationEnabled)}
                onValueChange={setPersonal}
              />
            }
          />
          <Row
            label="구독 사용량"
            sub="ChatGPT 공식 페이지 · 브라우저에 로그인된 계정 기준"
            onPress={() => void openSubscriptionUsage()}
            last={!auth.profileId}
          />
          {auth.profileId && (
            <Row
              label="ChatGPT 연결 해제"
              last
              onPress={() =>
                void run(async () => {
                  const r = await getSiwc().signOut(auth.profileId!);
                  if (!r.revoked)
                    Alert.alert(
                      "이 기기에서 연결을 해제했어요",
                      "원격 연결 해제는 확인하지 못했어요. ChatGPT 설정에서 앱 연결을 확인해 주세요.",
                    );
                })
              }
            />
          )}
        </View>
      </View>

      <View>
        <SectionLabel>기록</SectionLabel>
        <Row label="학습 기록 초기화" onPress={() => confirmReset(false)} />
        <Row label="모든 데이터 삭제" danger last onPress={() => confirmReset(true)} />
      </View>

      {!!error && <Message text={error} error />}
      {windowOpen && (
        <WindowSheet
          start={settings.gapStart}
          end={settings.gapEnd}
          onClose={() => setWindowOpen(false)}
          onSave={(gapStart, gapEnd) => {
            setWindowOpen(false);
            void run(() => repo.updateSettings({ gapStart, gapEnd }));
          }}
        />
      )}
    </Screen>
  );
}
