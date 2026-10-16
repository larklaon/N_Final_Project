import { Linking, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, Message, Row, Screen, SectionLabel, Small } from "../../src/components/ui";
import { useApp } from "../../src/platform/AppProvider";
import { pieceState } from "../../src/domain/puzzle";
import { colors, fonts, type } from "../../src/theme/tokens";

const pieceLabel = {
  fitted: "맞춘 조각",
  seen: "틈새에서 본 조각",
  none: "아직 맞추지 않은 조각",
};

export default function Concept() {
  const { conceptId } = useLocalSearchParams<{ conceptId: string }>();
  const { snapshot } = useApp();
  const router = useRouter();
  const concept = snapshot.concepts.find((c) => c.id === conceptId);
  if (!concept)
    return (
      <Screen>
        <Message text="이 개념을 찾지 못했어요." error />
      </Screen>
    );
  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={s.area}>
          {concept.area} · {pieceLabel[pieceState(snapshot, concept.id)]}
        </Text>
        <Text accessibilityRole="header" style={s.title}>
          {concept.title}
        </Text>
        <Text style={s.oneLiner}>{concept.oneLiner}</Text>
      </View>
      <Text style={s.body}>{concept.explanation}</Text>
      <View style={s.example}>
        <SectionLabel>예를 들면</SectionLabel>
        <Text style={[s.body, { marginTop: 8 }]}>{concept.example}</Text>
      </View>
      <Button
        label="나에게 맞게 설명"
        onPress={() =>
          router.push({ pathname: "/ai/[conceptId]", params: { conceptId: concept.id } })
        }
      />
      <View>
        <SectionLabel>기준 자료</SectionLabel>
        {concept.sourceRefs.map((ref, i) => (
          <Row
            key={ref.url}
            label={ref.title}
            sub={new URL(ref.url).hostname}
            last={i === concept.sourceRefs.length - 1}
            onPress={() => void Linking.openURL(ref.url)}
            right={
              <Ionicons name="open-outline" size={16} color={colors.bandText2} accessible={false} />
            }
          />
        ))}
      </View>
      <Small>AI가 쓴 기초 설명이라 틀릴 수 있어요. 기준 자료와 함께 확인해 주세요.</Small>
    </Screen>
  );
}

const s = StyleSheet.create({
  area: { ...type.label, color: colors.bandLabel },
  title: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 42, color: colors.ink },
  oneLiner: { ...type.body, fontFamily: fonts.medium, color: colors.ink },
  body: { ...type.body, color: colors.bandBody },
  example: { borderLeftWidth: 0, paddingTop: 4 },
});
