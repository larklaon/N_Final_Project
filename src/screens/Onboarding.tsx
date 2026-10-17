import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
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
import { SubjectList } from "../components/SubjectList";
import { useApp } from "../platform/AppProvider";
import { enableGap } from "../services/gap/sync";
import { colors, type } from "../theme/tokens";

const goals = [3, 5, 10];
const STEPS = 5;

export function Onboarding() {
  const { repo, snapshot, refresh } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(5);
  const [cardError, setCardError] = useState("");
  const [busy, setBusy] = useState(false);

  async function turnOnCards() {
    setBusy(true);
    setCardError("");
    try {
      repo.updateSettings({ dailyGoal: goal });
      await enableGap(repo);
      setStep(4);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "카드를 켜지 못했어요.");
    } finally {
      setBusy(false);
      refresh();
    }
  }
  function finish(connect: boolean) {
    repo.updateSettings({ dailyGoal: goal, onboarded: true });
    refresh();
    if (connect) router.push("/settings");
  }

  const steps = (
    <View style={s.steps} accessibilityLabel={`${step + 1}단계, ${STEPS}단계 중`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={[s.step, i <= step && { backgroundColor: colors.mint }]} />
      ))}
    </View>
  );

  if (step === 0)
    return (
      <DarkScreen header={steps} footer={<PrimaryButton label="다음" onPress={() => setStep(1)} />}>
        <Band>
          <BandLabel>틈지식</BandLabel>
          <Text accessibilityRole="header" style={[type.answerLong, s.ink, { fontSize: 32, lineHeight: 42 }]}>
            공부한다고{"\n"}착각하는 앱.
          </Text>
          <BandBody>잠금 화면에서 스치고, 앱에서 맞춰요.</BandBody>
        </Band>
      </DarkScreen>
    );
  if (step === 1)
    return (
      <DarkScreen header={steps}>
        <Band>
          <Text accessibilityRole="header" style={[type.question, s.ink]}>
            무엇을 공부할까요?
          </Text>
          <SubjectList
            installed={repo.installedSubjects()}
            current={snapshot.settings.subjectId}
            onPick={(id) => {
              repo.installSubject(id);
              refresh();
              setStep(2);
            }}
          />
        </Band>
      </DarkScreen>
    );
  if (step === 2)
    return (
      <DarkScreen header={steps} footer={<PrimaryButton label="다음" onPress={() => setStep(3)} />}>
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
      </DarkScreen>
    );
  if (step === 3)
    return (
      <DarkScreen
        header={steps}
        footer={
          <>
            <PrimaryButton label="카드 켜기" disabled={busy} onPress={() => void turnOnCards()} />
            <TextLink tone="dark" label="나중에" onPress={() => setStep(4)} />
          </>
        }
      >
        <Band>
          <Text accessibilityRole="header" style={[type.question, s.ink]}>
            잠금 화면에 카드를 놓을까요?
          </Text>
          <BandBody>소리도 진동도 없이, 폰을 켜면 놓여 있어요.</BandBody>
        </Band>
        {!!cardError && <DarkNote icon="alert-circle-outline">{cardError}</DarkNote>}
      </DarkScreen>
    );
  return (
    <DarkScreen
      header={steps}
      footer={
        <>
          <PrimaryButton label="ChatGPT 연결하기" onPress={() => finish(true)} />
          <TextLink tone="dark" label="나중에" onPress={() => finish(false)} />
        </>
      }
    >
      <Band>
        <Text accessibilityRole="header" style={[type.question, s.ink]}>
          AI 코치를 붙일까요?
        </Text>
        <BandBody>ChatGPT를 연결하면 계획을 짜 주고, 막힌 문제를 바로 물어볼 수 있어요.</BandBody>
      </Band>
    </DarkScreen>
  );
}

const s = StyleSheet.create({
  ink: { color: colors.ink },
  steps: { flexDirection: "row", gap: 6, minHeight: 48, alignItems: "center" },
  step: { width: 24, height: 3, borderRadius: 2, backgroundColor: colors.inkLine },
});
