import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, type } from '../src/theme/tokens';
export default function Home() {
  return <SafeAreaView style={s.safe}><View style={s.content}><Text accessibilityRole="header" style={s.title}>틈지식</Text><Text style={s.body}>짧게 익히고, 오래 기억하기</Text><Text style={s.small}>정보처리기사 기초를 한 개념씩 쌓아가요.</Text></View></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 }, title: { ...type.heading, color: colors.textPrimary }, body: { ...type.body, color: colors.textPrimary }, small: { ...type.small, color: colors.textSecondary } });
