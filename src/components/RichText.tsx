import { Text, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts } from "../theme/tokens";

export type Span = { text: string; bold?: boolean; code?: boolean };

/**
 * The little markdown AI replies use: **bold**, `code`, "# " headings and "- " bullets.
 * Anything else stays as written; an unclosed marker is shown as-is.
 */
export function spans(source: string): Span[] {
  const text = source
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^(\s*)[-*]\s+/, "$1· "))
    .join("\n");
  const out: Span[] = [];
  const re = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], code: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function RichText({
  children,
  style,
  selectable,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
}) {
  return (
    <Text selectable={selectable} style={style}>
      {spans(children).map((p, i) =>
        p.bold ? (
          <Text key={i} style={{ fontFamily: fonts.semibold }}>
            {p.text}
          </Text>
        ) : p.code ? (
          <Text key={i} style={{ fontFamily: fonts.mono, backgroundColor: colors.bandFaint }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}
