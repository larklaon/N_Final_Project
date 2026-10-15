import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/theme/tokens';
export default function Layout() {
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.textPrimary, contentStyle: { backgroundColor: colors.background } }} /></>;
}
