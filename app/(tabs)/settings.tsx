import { useState } from "react";
import { Alert, Linking, Switch, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
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
import { getSiwc } from "../../modules/siwc-android";
import {
  enableReminders,
  mutateLearningWithNotifications,
} from "../../src/services/notifications/scheduler";
import { useProfileModels } from "../../src/services/ai/useProfileModels";
import { colors, type } from "../../src/theme/tokens";
const labels = {
  disconnected: "아직 연결하지 않았어요",
  authorizing: "브라우저에서 연결 중",
  connectedWithoutPlan: "로그인됨 · 플랜 사용 권한 필요",
  ready: "ChatGPT 플랜 사용 가능",
  reconnectRequired: "다시 연결해 주세요",
  temporarilyUnavailable: "잠시 연결할 수 없어요",
};
export default function Settings() {
  const { repo, snapshot, refresh, auth, profiles, refreshAuth } = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    models,
    error: modelError,
    retry: retryModels,
  } = useProfileModels(auth, refreshAuth);
  const [slotDraft, setSlotDraft] = useState<{
    learner: string;
    value: string;
  } | null>(null);
  const slots =
    slotDraft?.learner === snapshot.learnerId
      ? slotDraft.value
      : snapshot.settings.reminderSlots.join(", ");
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
      // Local changes may have committed even if an OS notification operation failed.
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
      all ? "모든 데이터를 삭제할까요?" : "현재 학습 기록을 초기화할까요?",
      all
        ? "모든 학습 기록과 ChatGPT 연결 정보가 이 기기에서 삭제돼요. 되돌릴 수 없어요."
        : "현재 프로필의 학습 기록과 저장된 AI 설명, 알림을 지워요. ChatGPT 연결은 유지돼요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () =>
            void run(async () => {
              await mutateLearningWithNotifications(repo, async () => {
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
  return (
    <Screen tabScreen>
      <Heading>학습</Heading>
      <Small>정보처리기사 기초 · 하루 목표</Small>
      {[1, 3, 5].map((n) => (
        <Choice
          key={n}
          label={`${n}개`}
          selected={snapshot.settings.dailyGoal === n}
          disabled={busy}
          onPress={() => void run(() => repo.updateSettings({ dailyGoal: n }))}
        />
      ))}
      <Heading>학습 알림</Heading>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Body>알림 받기</Body>
        <Switch
          accessibilityLabel="학습 알림 받기"
          value={snapshot.settings.notificationsEnabled}
          disabled={busy}
          trackColor={{ true: colors.primary }}
          onValueChange={(enabled) =>
            void run(async () => {
              if (enabled) await enableReminders(repo);
              else repo.updateSettings({ notificationsEnabled: false });
            })
          }
        />
      </View>
      <Small>
        하루 1~3회, 07:00~21:59 사이예요. 여러 시간은 쉼표로 나눠 주세요.
      </Small>
      <TextInput
        accessibilityLabel="알림 시간"
        value={slots}
        onChangeText={(value) =>
          setSlotDraft({ learner: snapshot.learnerId, value })
        }
        placeholder="20:30, 12:30"
        placeholderTextColor={colors.textSecondary}
        style={{
          ...type.body,
          borderColor: colors.controlBorder,
          borderWidth: 1,
          borderRadius: 12,
          padding: 16,
          color: colors.textPrimary,
        }}
      />
      <Button
        secondary
        label="알림 시간 저장"
        disabled={busy}
        onPress={() =>
          void run(() =>
            repo.updateSettings({
              reminderSlots: slots
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }),
          )
        }
      />
      <Small>
        절전 모드에서는 늦게 도착할 수 있어요. 앱 강제 중지 또는 7일 이상 미실행
        시 알림이 멈출 수 있어요.
      </Small>
      <Button
        secondary
        label="Android 알림 설정"
        onPress={() => void Linking.openSettings()}
      />
      <Heading>ChatGPT 연결</Heading>
      <Surface>
        <Body>{labels[auth.status]}</Body>
        {auth.message && <Small>{auth.message}</Small>}
        {profiles.find((p) => p.profileId === auth.profileId) && (
          <Small>
            {profiles.find((p) => p.profileId === auth.profileId)!.label}
          </Small>
        )}
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
        <Small>
          기본 학습은 구독 없이 사용할 수 있어요. AI 사용 가능 여부와 한도는
          연결한 ChatGPT 계정에 따라 달라져요.
        </Small>
      </Surface>
      <Button
        secondary
        label="기본 학습 프로필"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await mutateLearningWithNotifications(repo, async () => {
              await getSiwc().selectProfile(null);
              repo.selectProfile(null);
            });
          })
        }
      />
      {profiles.map((p) => (
        <Button
          secondary
          key={p.profileId}
          disabled={busy}
          label={`${p.profileId === auth.profileId ? "현재 · " : ""}${p.label}${p.connected ? "" : " · 재연결 필요"}`}
          onPress={() =>
            void run(async () => {
              await mutateLearningWithNotifications(repo, async () => {
                await getSiwc().selectProfile(p.profileId);
                repo.selectProfile(p.profileId);
              });
            })
          }
        />
      ))}
      {!!modelError && <Message text={modelError} error />}
      {modelError && (
        <Button
          secondary
          label="모델 목록 다시 불러오기"
          onPress={retryModels}
        />
      )}
      {models.length > 0 && (
        <>
          <Small>설명에 사용할 모델</Small>
          {models.map((m) => (
            <Choice
              key={m.slug}
              label={m.displayName}
              selected={
                (snapshot.settings.selectedModel ?? models[0].slug) === m.slug
              }
              onPress={() =>
                void run(() => repo.updateSettings({ selectedModel: m.slug }))
              }
            />
          ))}
        </>
      )}
      <Button
        secondary
        label="사용량 관리"
        onPress={() =>
          void Linking.openURL("https://chatgpt.com/settings/usage")
        }
      />
      {auth.profileId && (
        <Button
          secondary
          label="ChatGPT 연결 해제"
          disabled={busy}
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Body>AI 학습 정보 전송 동의</Body>
        <Switch
          accessibilityLabel="AI 학습 정보 전송 동의"
          value={snapshot.settings.aiConsentAt !== null}
          onValueChange={(on) =>
            void run(() =>
              repo.updateSettings({ aiConsentAt: on ? Date.now() : null }),
            )
          }
        />
      </View>
      <Heading>데이터 관리</Heading>
      <Small>
        학습 기록은 이 기기의 SQLite에, 인증 정보는 Android 보호 저장소에
        보관해요. 이름·이메일·ChatGPT의 기존 대화는 학습 AI에 보내지 않아요. 앱
        삭제 시 기록이 사라질 수 있어요.
      </Small>
      <Button
        secondary
        label="현재 학습 기록 초기화"
        disabled={busy}
        onPress={() => confirmReset(false)}
      />
      <Button
        danger
        label="모든 데이터 삭제"
        disabled={busy}
        onPress={() => confirmReset(true)}
      />
      {!!error && <Message text={error} error />}
    </Screen>
  );
}
