import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Header from '../components/Header';
import { useSettings } from '../context/settings';

const FACILITY_ID = 'eng5_cafeteria';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
const LEVEL_LABEL = { LOW: '여유', MEDIUM: '보통', HIGH: '포화' };

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export default function HistoryScreen() {
  const { pushToken } = useSettings();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    if (!API_BASE_URL || !pushToken) {
      setAlerts([]);
      setError(pushToken ? 'API 주소가 설정되지 않았습니다.' : '푸시 알림을 켜면 이 기기의 알림 내역을 볼 수 있습니다.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/history`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facility_id: FACILITY_ID, push_token: pushToken }),
      });
      if (!response.ok) throw new Error(`알림 내역을 불러오지 못했습니다 (${response.status})`);
      const body = await response.json();
      setAlerts(body.alerts ?? []);
      setError('');
    } catch (requestError) {
      setError(requestError.message || '알림 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [pushToken]);

  useFocusEffect(useCallback(() => {
    loadHistory();
  }, [loadHistory]));

  async function clearHistory() {
    if (!API_BASE_URL || !pushToken) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/history`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facility_id: FACILITY_ID, push_token: pushToken }),
      });
      if (!response.ok) throw new Error(`알림 내역을 지우지 못했습니다 (${response.status})`);
      setAlerts([]);
      setError('');
    } catch (requestError) {
      setError(requestError.message || '알림 내역을 지우지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <Header title="알림 내역" onBack={() => router.back()} />
      {loading ? <ActivityIndicator color="#39714b" style={styles.loader} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!loading && !error && alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.rowTitle}>아직 받은 알림이 없어요.</Text>
          <Text style={styles.bodyText}>혼잡도가 낮아져 푸시가 발송되면 여기에 표시됩니다.</Text>
        </View>
      ) : null}
      {alerts.length > 0 ? (
        <ScrollView contentContainerStyle={styles.list}>
          {alerts.map((alert) => (
            <View key={`${alert.id}-${alert.created_at}`} style={styles.alertCard}>
              <View style={styles.alertIcon}><Text style={styles.alertIconText}>↓</Text></View>
              <View style={styles.alertCopy}>
                <Text style={styles.alertTitle}>혼잡도가 낮아졌어요</Text>
                <Text style={styles.alertChange}>
                  {LEVEL_LABEL[alert.previous_level] ?? alert.previous_level} → {LEVEL_LABEL[alert.crowd_level] ?? alert.crowd_level}
                  {' · '}{alert.head_count}명
                </Text>
                <Text style={styles.alertTime}>{formatTime(alert.created_at)}</Text>
              </View>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={clearHistory} style={styles.clearButton}>
            <Text style={styles.clearText}>알림 내역 전체 삭제</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f2' },
  loader: { marginTop: 40 },
  errorText: { margin: 24, color: '#a23434', textAlign: 'center', fontSize: 14 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyIcon: { marginBottom: 16, color: '#799681', fontSize: 48 },
  rowTitle: { color: '#202a23', fontSize: 15, fontWeight: '700' },
  bodyText: { marginTop: 6, color: '#707a73', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  list: { padding: 20, gap: 12 },
  alertCard: { minHeight: 90, padding: 16, flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: '#fff' },
  alertIcon: { width: 42, height: 42, marginRight: 13, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f1e9' },
  alertIconText: { color: '#39714b', fontSize: 23, fontWeight: '800' },
  alertCopy: { flex: 1 },
  alertTitle: { color: '#202a23', fontSize: 15, fontWeight: '800' },
  alertChange: { marginTop: 5, color: '#43554a', fontSize: 13 },
  alertTime: { marginTop: 4, color: '#879189', fontSize: 11 },
  clearButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: '#8d4646', fontSize: 13, fontWeight: '700' },
});
