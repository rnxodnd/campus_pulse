import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, ImageBackground, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Header from '../components/Header';

const FACILITY_ID = 'eng5_cafeteria';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
const REFRESH_MS = 15_000;

function formatDate(value) {
  if (!value) return '분석 시각 정보 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function HomeScreen() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLatest = useCallback(async () => {
    if (!API_BASE_URL) {
      setError('API 기본 주소가 설정되지 않았습니다.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/facilities/${FACILITY_ID}`);
      if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
      setResult(await response.json());
      setError('');
    } catch (requestError) {
      setError(requestError.message || '서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(loadLatest, 0);
    const timer = setInterval(loadLatest, REFRESH_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [loadLatest]);

  const latest = result?.latest_analysis;
  const hasData = latest && latest.latest_head_count !== null && latest.latest_head_count !== undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={require('../../assets/eng5-cafeteria.jpg')} resizeMode="cover" style={styles.home}>
        <View style={styles.imageTint} />
        <Header title="캠퍼스 펄스" light onAlerts={() => router.push('/settings')} />
        <View style={styles.homeContent}>
          <View style={styles.facilityTag}><Text style={styles.facilityTagText}>5공학관 · 식당</Text></View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>현재 분석 정보</Text>
            {loading && !result ? <ActivityIndicator color="#355f49" style={styles.loader} /> : null}
            <Text style={styles.peopleCount}>{hasData ? latest.latest_head_count : '—'}</Text>
            <Text style={styles.peopleLabel}>감지된 인원 수</Text>
            <View style={styles.divider} />
            <Text style={styles.statusHint}>{hasData ? '영상 분석의 마지막 프레임 기준' : '아직 표시할 분석 결과가 없습니다.'}</Text>
            {hasData && <Text style={styles.timeText}>분석 등록 {formatDate(latest.analyzed_at)}</Text>}
            {hasData && latest.video_name ? <Text style={styles.videoName} numberOfLines={1}>{latest.video_name}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!API_BASE_URL && <Text style={styles.errorText}>API 주소를 설정하면 서버 데이터가 표시됩니다.</Text>}
            <Pressable style={styles.refreshButton} onPress={loadLatest} accessibilityRole="button">
              <Text style={styles.refreshText}>{loading ? '새로고침 중…' : '새로고침'}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.homeFootnote}>분석된 영상의 최신 프레임 인원 수입니다.</Text>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#dfe9d9' },
  home: { flex: 1, backgroundColor: '#dfe9d9' },
  imageTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22, 37, 28, 0.28)' },
  homeContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  facilityTag: { paddingHorizontal: 15, paddingVertical: 8, marginBottom: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.93)' },
  facilityTagText: { color: '#294c38', fontSize: 14, fontWeight: '800' },
  statusCard: { width: '100%', maxWidth: 360, padding: 24, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', shadowColor: '#16251c', shadowOpacity: 0.16, shadowRadius: 22, elevation: 5 },
  statusLabel: { color: '#526158', fontSize: 15, fontWeight: '700' },
  loader: { marginTop: 14 },
  peopleCount: { marginTop: 8, fontSize: 72, lineHeight: 82, fontWeight: '800', color: '#274d37' },
  peopleLabel: { fontSize: 16, fontWeight: '700', color: '#27342b' },
  divider: { width: '100%', height: 1, marginVertical: 18, backgroundColor: '#e8ebe7' },
  statusHint: { textAlign: 'center', color: '#505b53', fontSize: 14 },
  timeText: { marginTop: 8, color: '#68746c', fontSize: 12 },
  videoName: { maxWidth: '100%', marginTop: 4, color: '#89928b', fontSize: 11 },
  errorText: { marginTop: 8, textAlign: 'center', color: '#a23434', fontSize: 12 },
  refreshButton: { marginTop: 18, borderRadius: 14, backgroundColor: '#eaf2ec', paddingHorizontal: 18, paddingVertical: 10 },
  refreshText: { color: '#315b40', fontWeight: '800' },
  homeFootnote: { paddingHorizontal: 20, paddingBottom: 18, textAlign: 'center', color: '#fff', fontSize: 11, textShadowColor: '#17251d', textShadowRadius: 5 },
});
