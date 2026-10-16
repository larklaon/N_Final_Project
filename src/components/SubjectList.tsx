import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { packs } from "../data/content/packs";
import { colors, fonts, type } from "../theme/tokens";

/**
 * Subject rows. Picking one that is not on the device plays a short "download"
 * (the packs ship with the app; this is the paper plan of a real download).
 */
export function SubjectList({
  installed,
  current,
  onPick,
  tone = "band",
}: {
  installed: string[];
  current: string | null;
  onPick: (id: string) => void;
  tone?: "band" | "light";
}) {
  const [loading, setLoading] = useState<{ id: string; percent: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  function pick(id: string) {
    if (loading) return;
    if (installed.includes(id)) return onPick(id);
    let percent = 0;
    setLoading({ id, percent });
    timer.current = setInterval(() => {
      percent = Math.min(100, percent + 7 + Math.round(Math.random() * 9));
      setLoading({ id, percent });
      if (percent >= 100) {
        clearInterval(timer.current!);
        timer.current = null;
        setTimeout(() => {
          setLoading(null);
          onPick(id);
        }, 250);
      }
    }, 90);
  }
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup">
      {packs.map((p) => {
        const isCurrent = p.id === current;
        const isLoading = loading?.id === p.id;
        const status = !p.available
          ? "곧 열려요"
          : isLoading
            ? `받는 중 ${loading!.percent}%`
            : isCurrent
              ? "공부 중"
              : installed.includes(p.id)
                ? "받음"
                : "받기";
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityLabel={`${p.title}, ${p.subtitle}, ${status}`}
            accessibilityState={{ checked: isCurrent, disabled: !p.available }}
            disabled={!p.available}
            onPress={() => pick(p.id)}
            style={({ pressed }) => [
              s.row,
              { backgroundColor: isCurrent ? colors.ink : colors.bandFaint },
              !p.available && { opacity: 0.45 },
              pressed && { opacity: 0.75 },
            ]}
          >
            {isLoading && (
              <View
                pointerEvents="none"
                style={[s.progress, { width: `${loading!.percent}%` }]}
              />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.title, { color: isCurrent ? colors.band : colors.ink }]}>{p.title}</Text>
              <Text style={[s.sub, { color: isCurrent ? colors.inkSoft : colors.bandText2 }]}>
                {p.subtitle}
              </Text>
            </View>
            <View style={s.status}>
              {!isLoading && p.available && !installed.includes(p.id) && (
                <Ionicons name="arrow-down-circle-outline" size={18} color={colors.bandLabel} accessible={false} />
              )}
              {isCurrent && <Ionicons name="checkmark" size={18} color={colors.band} accessible={false} />}
              <Text style={[s.statusText, { color: isCurrent ? colors.band : colors.bandLabel }]}>{status}</Text>
            </View>
          </Pressable>
        );
      })}
      {tone === "light" && <View style={{ height: 4 }} />}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 68,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  progress: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(63,90,76,0.18)" },
  title: { ...type.option, fontFamily: fonts.semibold },
  sub: { ...type.small, fontSize: 13, lineHeight: 19 },
  status: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusText: { ...type.small, fontSize: 13, fontFamily: fonts.medium },
});
