import { Pressable, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, type } from "../theme/tokens";

/** The thin "ask AI" bar under a question: a hint before answering, "why" after. */
export function AskBar({
  conceptId,
  questionId,
  selected,
  answered,
}: {
  conceptId: string;
  questionId: string;
  selected: string;
  answered: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/ai/[conceptId]",
          params: { conceptId, mode: answered ? "why" : "hint", questionId, selected },
        })
      }
      style={({ pressed }) => [s.bar, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.inkSoft} accessible={false} />
      <Text style={s.text}>{answered ? "왜 그런지 AI에게 물어보기" : "힌트 물어보기"}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: {
    minHeight: 48,
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.inkLine,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  text: { ...type.small, color: colors.inkSoft },
});
