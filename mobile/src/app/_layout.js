import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { SettingsProvider } from '../context/settings';
import { usePushSubscription } from '../hooks/usePushSubscription';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function PushRuntime() {
  usePushSubscription();

  useEffect(() => {
    const responseListener = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/history');
    });
    return () => responseListener.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <PushRuntime />
      <Stack id="root" screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </SettingsProvider>
  );
}
