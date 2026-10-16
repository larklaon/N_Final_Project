import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Band,
  BandBody,
  BandLabel,
  DarkNote,
  DarkScreen,
  OptionRow,
  PrimaryButton,
  TextLink,
} from "../components/ui";
import { useApp } from "../platform/AppProvider";
import { enableGap } from "../services/gap/sync";
import { colors, type } from "../theme/tokens";

const goals = [3, 5, 10];

export function Onboarding() {
  const { repo, refresh } = useApp();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(5);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(withCards: boolean) {
    setBusy(true);
    setError("");
    try {
      repo.updateSettings({ dailyGoal: goal });
      if (withCards) await enableGap(repo);
      repo.updateSettings({ onboarded: true });
      refresh();
    } catch (e) {
      // Permission refused: still start; cards can be turned on later in settings.
      repo.updateSettings({ onboarded: true });
      setError(e instanceof Error ? e.message : "카드를 켜지 못했어요.");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const steps = (
    <View style={s.steps} accessibilityLabel={`${step + 1}단계, 3단계 중`}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[s.step, i <= step && { backgroundColor: colors.band }]} />
      ))}
    </View>
  );

  if (step === 0)
    return (
      <DarkScreen header={steps} footer={<PrimaryButton label="다음" onPress={() => setStep(1)} />}>
        <Band>
          <BandLabel>틈지식 · 정보처리기사 기초</BandLabel>
          <Text accessibilityRole="header" style={[type.answerLong, s.ink, { fontSize: 32, lineHeight: 42 }]}>
            공부한다고{"\n"}착각하는 앱.
          </Text>
          <BandBody>
            잠금 화면에서 스치듯 조각을 보고, 앱에서는 그 조각을 맞춰요. 나중에
            제대로 공부할 때 &quot;이거 본 적 있다&quot; 싶게요.
          </BandBody>
        </Band>
        <DarkNote icon="phone-portrait-outline">
          하루 몇 분이면 충분해요. 나머지는 잠금 화면이 챙겨요.
        </DarkNote>
      </DarkScreen>
    );
  if (step === 1)
    return (
      <DarkScreen header={steps} footer={<PrimaryButton label="다음" onPress={() => setStep(2)} />}>
        <Band>
          <Text accessibilityRole="header" style={[type.question, s.ink]}>
            하루에 몇 문제 풀까요?
          </Text>
          <View accessibilityRole="radiogroup" style={{ gap: 8, marginTop: 4 }}>
            {goals.map((n, i) => (
              <OptionRow
                key={n}
                index={i + 1}
                label={`${n}문제${n === 5 ? " · 기본" : ""}`}
                selected={goal === n}
                onPress={() => setGoal(n)}
              />
            ))}
          </View>
        </Band>
        <DarkNote icon="time-outline">한 문제는 1분이면 충분해요. 설정에서 바꿀 수 있어요.</DarkNote>
      </DarkScreen>
    );
  return (
    <DarkScreen
      header={steps}
      footer={
        <>
          <PrimaryButton label="카드 켜기" disabled={busy} onPress={() => void finish(true)} />
          <TextLink tone="dark" label="나중에" onPress={() => void finish(false)} />
        </>
      }
    >
      <Band>
        <Text accessibilityRole="header" style={[type.question, s.ink]}>
          잠금 화면에 카드를 놓을까요?
        </Text>
        <BandBody>
          소리도 진동도 없어요. 폰을 켜면 짧은 문제가 놓여 있고, 탭 한 번으로
          답해요. 답한 것도 학습 기록에 남아요.
        </BandBody>
      </Band>
      <DarkNote icon="notifications-off-outline">
        알림 권한이 필요해요. 학습하러 오라고 부르는 알림은 보내지 않아요.
      </DarkNote>
      {!!error && <DarkNote icon="alert-circle-outline">{error}</DarkNote>}
    </DarkScreen>
  );
}

const s = StyleSheet.create({
  ink: { color: colors.ink },
  steps: { flexDirection: "row", gap: 6, minHeight: 48, alignItems: "center" },
  step: { width: 24, height: 3, borderRadius: 2, backgroundColor: colors.inkLine },
});
