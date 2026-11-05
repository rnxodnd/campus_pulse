import { Stack } from 'expo-router';
import { SettingsProvider } from '../context/settings';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Stack id="root" screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </SettingsProvider>
  );
}
