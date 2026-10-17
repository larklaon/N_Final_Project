import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { IconButton, PuzzleMap, Screen, bandColor } from "../src/components/ui";
import { useApp } from "../src/platform/AppProvider";
import { puzzle, puzzleTotals } from "../src/domain/puzzle";
import { localDate } from "../src/domain/review";
import { packOf } from "../src/data/content/packs";
import { colors, fonts, type } from "../src/theme/tokens";

const steps = ["", "흐림", "", "", "선명", "완전"];

/** Numbers and colours only; what they mean lives behind the ⓘ button. */
export default function Puzzle() {
  const { snapshot, repo, now } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const totals = puzzleTotals(snapshot, now);
  const plan = repo.plan();
  const doneOn = (date: string) =>
    new Set(
      snapshot.attempts
        .filter((a) => a.isGraded === 1 && a.localDate === date)
        .map((a) => a.conceptId),
    ).size;
  const today = localDate(now);

  return (
    <Screen
      title="퍼즐"
      action={
        <IconButton
          icon="information-circle-outline"
          label="퍼즐 설명 보기"
          color={colors.bandText2}
          onPress={() => setInfo(true)}
        />
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={s.subject}>{packOf(snapshot.settings.subjectId).title}</Text>
        <Text
          style={s.total}
          accessibilityLabel={`평균 해상도 ${totals.average}%, 완전히 들어간 조각 ${totals.complete}개, ${totals.total}개 중`}
        >
          {totals.average}%
        </Text>
      </View>

      {plan && (
        <View style={s.days} accessibilityLabel="AI 7일 계획 진행">
          {plan.days.map((d) => {
            const planned = d.newCount + d.reviewCount;
            const done = Math.min(planned, doneOn(d.date));
            const isToday = d.date === today;
            return (
              <View
                key={d.date}
                style={s.day}
                accessible
                accessibilityLabel={`${d.date}, ${planned}문제 중 ${done}문제`}
              >
                <View style={s.dayTrack}>
                  <View style={[s.dayFill, { height: `${planned ? (done / planned) * 100 : 0}%` }]} />
                </View>
                <Text style={[s.dayText, isToday && { color: colors.ink, fontFamily: fonts.semibold }]}>
                  {isToday ? "오늘" : d.date.slice(8)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View>
        {puzzle(snapshot, now).map((a) => {
          const expanded = open === a.area;
          return (
            <View key={a.area} style={s.area}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${a.area}, 평균 해상도 ${a.average}%`}
                onPress={() => setOpen(expanded ? null : a.area)}
                style={({ pressed }) => [s.areaHead, pressed && { opacity: 0.7 }]}
              >
                <View style={s.areaTitleRow}>
                  <Text style={s.areaName}>{a.area}</Text>
                  <Text style={s.areaCount}>{a.average}%</Text>
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.bandText2} accessible={false} />
                </View>
                <PuzzleMap levels={a.pieces.map((p) => p.band)} size={20} tone="light" />
              </Pressable>
              {expanded &&
                a.pieces.map((p) => (
                  <Pressable
                    key={p.conceptId}
                    accessibilityRole="button"
                    accessibilityLabel={
                      p.percent > 0
                        ? `${p.title}, 해상도 ${p.percent}%, 반감기 ${p.halfLife}일`
                        : `${p.title}, 아직 맞추지 않음`
                    }
                    onPress={() =>
                      router.push({ pathname: "/concept/[conceptId]", params: { conceptId: p.conceptId } })
                    }
                    style={({ pressed }) => [s.piece, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[s.pieceDot, { backgroundColor: bandColor(p.band, "light") }]} />
                    <Text style={[s.pieceTitle, p.percent === 0 && { color: colors.bandText2 }]}>{p.title}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.bandText2} accessible={false} />
                  </Pressable>
                ))}
            </View>
          );
        })}
      </View>

      <Modal visible={info} transparent animationType="slide" onRequestClose={() => setInfo(false)}>
        <Pressable style={s.scrim} accessibilityLabel="닫기" onPress={() => setInfo(false)} />
        <View style={s.sheet}>
          <View style={s.grabber} />
          <Text style={s.sheetTitle}>퍼즐 읽는 법</Text>
          <Text style={s.sheetBody}>
            조각마다 머리에 남은 정도를 퍼센트와 색으로 보여 줘요. 맞히면 진해지고, 시간이 지나면 다시 흐려져요.
          </Text>
          <View style={s.legend} accessible={false}>
            {[1, 2, 3, 4, 5].map((l) => (
              <View key={l} style={s.legendItem}>
                <View style={[s.swatch, { backgroundColor: bandColor(l, "light") }, l === 5 && s.swatchRing]} />
                {!!steps[l] && <Text style={s.legendText}>{steps[l]}</Text>}
              </View>
            ))}
          </View>
          <Text style={s.sheetMeta}>
            완전히 들어간 조각 {totals.complete} / {totals.total}
          </Text>
          <View style={s.sheetRule} />
          <Text style={s.sheetLabel}>AI 계획</Text>
          <Text style={s.sheetBody}>
            {plan?.summary ||
              "ChatGPT를 연결하면 AI가 해상도를 보고 7일 계획을 짜요. 위 막대가 하루하루 채워져요."}
          </Text>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  subject: { ...type.label, color: colors.bandLabel },
  total: { fontFamily: fonts.serif, fontSize: 64, lineHeight: 72, color: colors.ink },
  days: { flexDirection: "row", gap: 8 },
  day: { flex: 1, alignItems: "center", gap: 6 },
  dayTrack: { width: "100%", height: 40, borderRadius: 6, backgroundColor: colors.bandFaint, justifyContent: "flex-end", overflow: "hidden" },
  dayFill: { width: "100%", backgroundColor: colors.ink },
  dayText: { ...type.small, fontSize: 12, color: colors.bandText2 },
  area: { borderTopWidth: 1, borderTopColor: colors.bandLine },
  areaHead: { paddingVertical: 18, gap: 12 },
  areaTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  areaName: { ...type.option, fontFamily: fonts.semibold, color: colors.ink, flex: 1 },
  areaCount: { ...type.small, color: colors.bandText2 },
  piece: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 4 },
  pieceDot: { width: 14, height: 10, borderRadius: 3 },
  pieceTitle: { ...type.small, fontSize: 16, color: colors.ink, flex: 1 },
  scrim: { flex: 1, backgroundColor: "rgba(18,21,19,0.35)" },
  sheet: {
    backgroundColor: colors.band,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 12,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.bandLine, marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 30, color: colors.ink },
  sheetLabel: { ...type.label, color: colors.bandLabel },
  sheetBody: { ...type.body, fontSize: 16, lineHeight: 25, color: colors.bandBody },
  sheetMeta: { ...type.small, color: colors.bandText2 },
  sheetRule: { height: 1, backgroundColor: colors.bandLine, marginVertical: 4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 18, height: 12, borderRadius: 3 },
  swatchRing: { outlineWidth: 1, outlineColor: colors.ink, outlineOffset: 2 },
  legendText: { ...type.small, fontSize: 12, color: colors.bandLabel, marginRight: 4 },
});
