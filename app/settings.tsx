import { useEffect, useState } from "react";
import { Alert, Linking, View } from "react-native";
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
import { getSiwc } from "../modules/siwc-android";
import { getGap } from "../modules/gap-android";
import { enableGap, mutateLearningWithGap } from "../src/services/gap/sync";
import { useProfileModels } from "../src/services/ai/useProfileModels";
import { dailyGoals, gapIntervals } from "../src/data/repositories/LearningRepository";

const labels = {
  disconnected: "연결 안 됨",
  authorizing: "브라우저에서 연결 중",
  connectedWithoutPlan: "로그인됨 · 플랜 사용 권한 필요",
  ready: "ChatGPT 플랜 사용 가능",
  reconnectRequired: "다시 연결해 주세요",
  temporarilyUnavailable: "잠시 연결할 수 없어요",
};
const windows = [
  ["07:00", "22:00"],
  ["09:00", "21:00"],
  ["06:00", "23:59"],
] as const;

export default function Settings() {
  const { repo, snapshot, refresh, auth, profiles, refreshAuth } = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [canPin, setCanPin] = useState(false);
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
      "개념·학습 요약·입력 질문을 OpenAI에 전송해 개인화 설명을 만들어요. ChatGPT 플랜 사용량이 적용돼요. 첫 연결은 현재 기기의 학습 기록과 연결돼요.",
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
  function pickWindow() {
    Alert.alert(
      "카드를 보여 줄 시간",
      "이 시간 밖에는 잠금 화면에 카드를 놓지 않아요. 위젯은 계속 보여요.",
      windows.map(([start, end]) => ({
        text: `${start} – ${end}`,
        onPress: () =>
          void run(() => repo.updateSettings({ gapStart: start, gapEnd: end })),
      })),
    );
  }
  const currentProfile = profiles.find((p) => p.profileId === auth.profileId);

  return (
    <Screen title="설정">
      <View>
        <SectionLabel>학습</SectionLabel>
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
          sub="소리·진동 없이 놓여만 있어요"
          right={
            <Toggle
              label="잠금 화면 카드"
              value={settings.gapEnabled}
              disabled={busy}
              onValueChange={(on) =>
                void run(async () => {
                  if (on) await enableGap(repo);
                  else repo.updateSettings({ gapEnabled: false });
                })
              }
            />
          }
        />
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
          onPress={pickWindow}
          last={!canPin}
        />
        {canPin && (
          <Row
            label="홈 화면에 위젯 놓기"
            sub="같은 카드에 홈 화면에서 바로 답해요"
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
        ) : (
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
                    repo.updateSettings({ aiConsentAt: on ? Date.now() : null }),
                  )
                }
              />
            }
          />
          <Row
            label="사용량 관리"
            onPress={() =>
              void Linking.openURL("https://chatgpt.com/settings/usage")
            }
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
      <Small>
        학습 기록은 이 기기에만 저장돼요. 이름·이메일·ChatGPT의 기존 대화는 학습
        AI에 보내지 않아요.
      </Small>
    </Screen>
  );
}
