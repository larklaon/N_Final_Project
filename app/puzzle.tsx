import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { PuzzleMap, Screen, Small } from "../src/components/ui";
import { useApp } from "../src/platform/AppProvider";
import { puzzle, puzzleTotals, type PieceState } from "../src/domain/puzzle";
import { colors, fonts, type } from "../src/theme/tokens";

const stateLabel: Record<PieceState, string> = {
  fitted: "맞춤",
  seen: "틈새에서 봄",
  none: "",
};

export default function Puzzle() {
  const { snapshot } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const totals = puzzleTotals(snapshot);
  return (
    <Screen title="퍼즐">
      <View style={{ gap: 8 }}>
        <View
          style={s.totalRow}
          accessible
          accessibilityLabel={`${totals.total}조각 중 ${totals.fitted}조각 맞춤`}
        >
          <Text style={s.total}>{totals.fitted}</Text>
          <Text style={s.totalOf}>/ {totals.total} 조각</Text>
        </View>
        {totals.seen > 0 && (
          <Small>
            틈새에서 본 조각 {totals.seen}개가 맞춰지길 기다리고 있어요.
          </Small>
        )}
        <View style={s.legend} accessible={false}>
          <View style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: colors.ink }]} />
            <Text style={s.legendText}>맞춘 조각</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.swatch, { borderWidth: 1.5, borderColor: colors.ink }]} />
            <Text style={s.legendText}>틈새에서 본 조각</Text>
          </View>
        </View>
      </View>
      <View>
        {puzzle(snapshot).map((a) => {
          const expanded = open === a.area;
          return (
            <View key={a.area} style={s.area}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${a.area}, 10조각 중 ${a.fitted}조각 맞춤, ${a.seen}조각 틈새에서 봄`}
                onPress={() => setOpen(expanded ? null : a.area)}
                style={({ pressed }) => [s.areaHead, pressed && { opacity: 0.7 }]}
              >
                <View style={s.areaTitleRow}>
                  <Text style={s.areaName}>{a.area}</Text>
                  <Text style={s.areaCount}>{a.fitted} / 10</Text>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.bandText2}
                    accessible={false}
                  />
                </View>
                <PuzzleMap pieces={a.pieces.map((p) => p.state)} size={20} tone="light" />
              </Pressable>
              {expanded &&
                a.pieces.map((p) => (
                  <Pressable
                    key={p.conceptId}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.title}${stateLabel[p.state] ? `, ${stateLabel[p.state]}` : ""}`}
                    onPress={() =>
                      router.push({ pathname: "/concept/[conceptId]", params: { conceptId: p.conceptId } })
                    }
                    style={({ pressed }) => [s.piece, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={s.pieceTitle}>{p.title}</Text>
                    <Text style={s.pieceState}>{stateLabel[p.state]}</Text>
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
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  total: { fontFamily: fonts.serif, fontSize: 56, lineHeight: 64, color: colors.ink },
  totalOf: { ...type.body, color: colors.bandText2 },
  legend: { flexDirection: "row", gap: 16, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { ...type.small, fontSize: 13, color: colors.bandLabel },
  area: { borderTopWidth: 1, borderTopColor: colors.bandLine },
  areaHead: { paddingVertical: 18, gap: 12 },
  areaTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  areaName: { ...type.option, fontFamily: fonts.semibold, color: colors.ink, flex: 1 },
  areaCount: { ...type.small, color: colors.bandText2 },
  piece: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
  },
  pieceTitle: { ...type.small, fontSize: 16, color: colors.ink, flex: 1 },
  pieceState: { ...type.small, fontSize: 13, color: colors.bandText2 },
});
