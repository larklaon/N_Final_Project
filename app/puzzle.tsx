import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { PuzzleMap, Screen, Small, bandColor } from "../src/components/ui";
import { useApp } from "../src/platform/AppProvider";
import { puzzle, puzzleTotals } from "../src/domain/puzzle";
import { localDate } from "../src/domain/review";
import { packOf } from "../src/data/content/packs";
import { colors, fonts, type } from "../src/theme/tokens";

const steps = ["", "흐림", "", "", "선명", "완전"];

export default function Puzzle() {
  const { snapshot, repo, now } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
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
    <Screen title="퍼즐">
      <View style={{ gap: 8 }}>
        <Text style={s.subject}>{packOf(snapshot.settings.subjectId).title}</Text>
        <View
          style={s.totalRow}
          accessible
          accessibilityLabel={`평균 해상도 ${totals.average}%, 완전히 들어간 조각 ${totals.complete}개, ${totals.total}개 중`}
        >
          <Text style={s.total}>{totals.average}%</Text>
          <Text style={s.totalOf}>평균 해상도</Text>
        </View>
        <Small>
          완전히 머리에 들어간 조각 {totals.complete} / {totals.total}
        </Small>
        <View style={s.legend} accessible={false}>
          {[1, 2, 3, 4, 5].map((l) => (
            <View key={l} style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: bandColor(l, "light") }, l === 5 && s.swatchRing]} />
              {!!steps[l] && <Text style={s.legendText}>{steps[l]}</Text>}
            </View>
          ))}
        </View>
      </View>

      {plan ? (
        <View style={s.plan}>
          <Text style={s.planLabel}>AI 7일 계획</Text>
          {!!plan.summary && <Text style={s.planSummary}>{plan.summary}</Text>}
          <View style={s.days}>
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
                    <View
                      style={[
                        s.dayFill,
                        { height: `${planned ? (done / planned) * 100 : 0}%` },
                      ]}
                    />
                  </View>
                  <Text style={[s.dayText, isToday && { color: colors.ink, fontFamily: fonts.semibold }]}>
                    {isToday ? "오늘" : d.date.slice(8)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={s.plan}>
          <Text style={s.planLabel}>AI 7일 계획</Text>
          <Text style={s.planSummary}>
            ChatGPT를 연결하면 AI가 해상도를 보고 7일 계획을 짜 줘요. 지금은 문제가 무작위로 나와요.
          </Text>
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
                    accessibilityLabel={`${p.title}, 해상도 ${p.percent}%, 반감기 ${p.halfLife}일`}
                    onPress={() =>
                      router.push({ pathname: "/concept/[conceptId]", params: { conceptId: p.conceptId } })
                    }
                    style={({ pressed }) => [s.piece, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[s.pieceDot, { backgroundColor: bandColor(p.band, "light") }]} />
                    <Text style={s.pieceTitle}>{p.title}</Text>
                    <Text style={s.pieceState}>
                      {p.percent > 0 ? `${p.percent}% · 반감기 ${p.halfLife}일` : "아직"}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.bandText2} accessible={false} />
                  </Pressable>
                ))}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  subject: { ...type.label, color: colors.bandLabel },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  total: { fontFamily: fonts.serif, fontSize: 56, lineHeight: 64, color: colors.ink },
  totalOf: { ...type.body, color: colors.bandText2 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 18, height: 12, borderRadius: 3 },
  swatchRing: { outlineWidth: 1, outlineColor: colors.ink, outlineOffset: 2 },
  legendText: { ...type.small, fontSize: 12, color: colors.bandLabel, marginRight: 4 },
  plan: { gap: 10, paddingVertical: 4 },
  planLabel: { ...type.label, color: colors.bandLabel },
  planSummary: { ...type.body, fontSize: 16, lineHeight: 25, color: colors.bandBody },
  days: { flexDirection: "row", gap: 8, marginTop: 4 },
  day: { flex: 1, alignItems: "center", gap: 6 },
  dayTrack: { width: "100%", height: 44, borderRadius: 6, backgroundColor: colors.bandFaint, justifyContent: "flex-end", overflow: "hidden" },
  dayFill: { width: "100%", backgroundColor: colors.ink },
  dayText: { ...type.small, fontSize: 12, color: colors.bandText2 },
  area: { borderTopWidth: 1, borderTopColor: colors.bandLine },
  areaHead: { paddingVertical: 18, gap: 12 },
  areaTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  areaName: { ...type.option, fontFamily: fonts.semibold, color: colors.ink, flex: 1 },
  areaCount: { ...type.small, color: colors.bandText2 },
  piece: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
  pieceDot: { width: 14, height: 10, borderRadius: 3 },
  pieceTitle: { ...type.small, fontSize: 16, color: colors.ink, flex: 1 },
  pieceState: { ...type.small, fontSize: 13, color: colors.bandText2 },
});
