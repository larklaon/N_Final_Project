/** D direction: dark ground for focus, one pale-mint band (the gap) for what matters. */
export const colors = {
  ink: "#121513",
  band: "#E8F0EA",
  inkMuted: "#7E877F",
  inkSoft: "#9AA29B",
  inkLine: "#2E342F",
  inkText: "#E9ECE8",
  bandText2: "#4B5F55",
  bandLabel: "#3F5A4C",
  bandBody: "#263A30",
  bandFaint: "rgba(18,21,19,0.07)",
  bandLine: "rgba(18,21,19,0.10)",
  /**
   * The deepening mint from the app mark: things that fill up (resolution, progress, right
   * answers). `mint` reads on ink; `mintDeep` is the same hue dark enough to read on the band.
   */
  mintSoft: "#C2E9D7",
  mint: "#78DEB6",
  mintDeep: "#2E9E77",
  danger: "#A53332",
  /** Danger readable on the ink ground. */
  dangerOnInk: "#E3907F",
} as const;
/** Android embeds fonts by file name (expo-font config plugin). */
export const fonts = {
  serif: "Hahmlet_700Bold",
  regular: "IBMPlexSansKR_400Regular",
  medium: "IBMPlexSansKR_500Medium",
  semibold: "IBMPlexSansKR_600SemiBold",
  mono: "monospace",
} as const;
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  band: 28,
  xxl: 32,
  section: 48,
} as const;
export const type = {
  answer: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 54 },
  answerLong: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 36 },
  question: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 37 },
  title: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 34 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 27 },
  option: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 26 },
  button: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.5,
  },
  code: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 22 },
};
