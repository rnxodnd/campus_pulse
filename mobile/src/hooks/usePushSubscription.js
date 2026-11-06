import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSettings } from '../context/settings';

const FACILITY_ID = 'eng5_cafeteria';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

async function getExpoPushToken() {
  if (Platform.OS !== 'android') throw new Error('현재 Android 푸시만 지원합니다.');
  await Notifications.setNotificationChannelAsync('default', {
    name: '캠퍼스 펄스 알림',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#39714b',
  });

  const permission = await Notifications.getPermissionsAsync();
  const finalStatus = permission.granted
    ? permission.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') throw new Error('기기 설정에서 캠퍼스 펄스 알림 권한을 허용해 주세요.');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Expo 프로젝트 ID를 찾지 못했습니다.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function usePushSubscription() {
  const { settings, loaded, pushToken, setPushToken, setPushStatus } = useSettings();
  const lastSyncKey = useRef('');

  useEffect(() => {
    if (!loaded) return undefined;
    let active = true;

    async function sync() {
      if (!settings.enabled) {
        lastSyncKey.current = '';
        if (!pushToken || !API_BASE_URL) {
          setPushStatus('알림이 꺼져 있습니다.');
          return;
        }
        const response = await fetch(`${API_BASE_URL}/api/subscriptions`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ facility_id: FACILITY_ID, push_token: pushToken }),
        });
        if (!response.ok) throw new Error(`알림 구독 해제 실패 (${response.status})`);
        if (active) setPushStatus('알림이 꺼져 있습니다.');
        return;
      }

      if (!API_BASE_URL) throw new Error('API 주소가 설정되지 않았습니다.');
      if (active) setPushStatus('푸시 알림을 연결하는 중…');
      const token = pushToken || await getExpoPushToken();
      const syncKey = `${token}:${settings.notifyOnMedium}:${settings.notifyOnLow}`;
      if (lastSyncKey.current === syncKey) return;

      const response = await fetch(`${API_BASE_URL}/api/subscriptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          facility_id: FACILITY_ID,
          push_token: token,
          notify_on_medium: settings.notifyOnMedium,
          notify_on_low: settings.notifyOnLow,
        }),
      });
      if (!response.ok) throw new Error(`알림 구독 등록 실패 (${response.status})`);
      if (!pushToken) await setPushToken(token);
      lastSyncKey.current = syncKey;
      if (active) setPushStatus('Android 푸시 알림이 연결되어 있습니다.');
    }

    sync().catch((error) => {
      if (active) setPushStatus(error.message || '푸시 알림을 연결하지 못했습니다.');
    });

    return () => { active = false; };
  }, [loaded, settings.enabled, settings.notifyOnMedium, settings.notifyOnLow, pushToken, setPushToken, setPushStatus]);
}
