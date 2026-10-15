export const colors = {
  background: '#F7F6F2', surface: '#FFFFFF', textPrimary: '#172D2A', textSecondary: '#53625E',
  primary: '#176B5B', onPrimary: '#FFFFFF', primarySoft: '#E5F1EC', border: '#D7DFD9', controlBorder: '#71847C',
  success: '#216644', successSoft: '#E8F3EA', error: '#A53332', errorSoft: '#FBEDEC', warning: '#825200', warningSoft: '#FFF2D7',
} as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 48 } as const;
export const type = {
  heading: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  section: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 28 }, label: { fontSize: 16, lineHeight: 24 }, small: { fontSize: 14, lineHeight: 22 },
};
