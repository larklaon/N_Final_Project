import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import { getSiwc, type UsageSummary as Summary } from "../../modules/siwc-android";
import { Button, Body, Row, Small } from "./ui";
import { colors, fonts, type } from "../theme/tokens";

export function UsageSummary({ profileId }: { profileId?: string }) {
  const [state, setState] = useState<{ profile?: string; data?: Summary; error?: string }>({});
  const [retry, setRetry] = useState(0);
  const [linkError, setLinkError] = useState("");
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    let run = 0;
    const load = async () => {
      const current = ++run;
      try {
        const data = await getSiwc().getUsage(profileId);
        if (alive && current === run) setState({ profile: profileId, data });
      } catch {
        if (alive && current === run)
          setState({ profile: profileId, error: "사용 기록을 불러오지 못했어요." });
      }
    };
    void load();
    const app = AppState.addEventListener("change", (s) => { if (s === "active") void load(); });
    let responses: { remove(): void } | undefined;
    try {
      responses = getSiwc().addListener("onResponse", (e) => {
        if (e.type === "completed") void load();
      });
    } catch {}
    return () => { alive = false; app.remove(); responses?.remove(); };
  }, [profileId, retry]);
  const data = state.profile === profileId ? state.data : undefined;
  const error = state.profile === profileId ? state.error : undefined;
  const number = (n: number) => n.toLocaleString("ko-KR");
  return (
    <View style={s.root}>
      <Body>이 기기의 틈지식 사용 기록</Body>
      <Small>선택한 ChatGPT 계정 · 최근 30일</Small>
      {!profileId ? <Body>ChatGPT를 연결하면 사용 기록이 여기에 쌓여요.</Body> :
        error ? <><Body>{error}</Body><Button label="다시 불러오기" secondary onPress={() => setRetry((v) => v + 1)} /></> :
        !data ? <Small>사용 기록을 불러오고 있어요.</Small> : (
          <View>
            <Row label="오늘 완료한 AI 응답" value={`${number(data.todayCompleted)}회`} />
            <Row label="30일간 완료한 AI 응답" value={`${number(data.completed)}회`} />
            <Row label="확인된 토큰 사용량" value={data.measured ? `${number(data.inputTokens + data.outputTokens)} 토큰` : "아직 정보 없음"} last />
            {data.measured > 0 && <Text style={s.detail}>입력 {number(data.inputTokens)} · 출력 {number(data.outputTokens)}</Text>}
            {data.completed > data.measured && <Small>{number(data.completed - data.measured)}개 응답은 토큰 정보가 제공되지 않았어요.</Small>}
          </View>
        )}
      <Small>이 기능을 추가한 뒤 완료된 대화·AI 학습 계획을 기록해요. 중단·실패한 요청과 다른 앱의 사용은 포함하지 않아요.</Small>
      <View style={s.quota}>
        <Text style={s.label}>ChatGPT 전체 사용 한도</Text>
        <Small>구독의 남은 사용량과 초기화 시간은 ChatGPT에서 확인할 수 있어요. 위 기록은 구독 잔여량이 아니에요.</Small>
        <Button label="ChatGPT 사용량 확인" secondary onPress={() => {
          setLinkError("");
          void Linking.openURL("https://chatgpt.com/settings/usage").catch(() => setLinkError("브라우저를 열지 못했어요. 다시 눌러 주세요."));
        }} />
        {!!linkError && <Small>{linkError}</Small>}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 12 },
  detail: { ...type.small, color: colors.bandText2 },
  quota: { borderTopWidth: 1, borderTopColor: colors.bandLine, paddingTop: 24, gap: 12, marginTop: 12 },
  label: { ...type.option, fontFamily: fonts.semibold, color: colors.ink },
});
