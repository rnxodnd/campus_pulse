import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const SettingsContext = createContext(null);
const SETTINGS_KEY = 'campus-pulse:alert-settings:v1';
const PUSH_TOKEN_KEY = 'campus-pulse:expo-push-token:v1';
const DEFAULT_SETTINGS = { enabled: false, notifyOnMedium: true, notifyOnLow: true };

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pushToken, setPushTokenValue] = useState(null);
  const [pushStatus, setPushStatus] = useState('알림을 켜면 기기 권한을 요청합니다.');
  const [loaded, setLoaded] = useState(false);
  const settingsRef = useRef(DEFAULT_SETTINGS);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(SETTINGS_KEY), AsyncStorage.getItem(PUSH_TOKEN_KEY)])
      .then(([storedSettings, storedToken]) => {
        if (!active) return;
        const parsed = storedSettings ? JSON.parse(storedSettings) : {};
        const initial = {
          enabled: parsed.enabled === true,
          notifyOnMedium: parsed.notifyOnMedium !== false,
          notifyOnLow: parsed.notifyOnLow !== false,
        };
        settingsRef.current = initial;
        setSettings(initial);
        setPushTokenValue(storedToken);
      })
      .catch(() => {
        if (active) setPushStatus('기기에 저장된 알림 설정을 읽지 못했습니다.');
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const updateSettings = useCallback(async (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const setPushToken = useCallback(async (token) => {
    setPushTokenValue(token);
    if (token) await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    else await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  }, []);

  const value = useMemo(() => ({
    settings,
    updateSettings,
    pushToken,
    setPushToken,
    pushStatus,
    setPushStatus,
    loaded,
  }), [settings, updateSettings, pushToken, setPushToken, pushStatus, loaded]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
