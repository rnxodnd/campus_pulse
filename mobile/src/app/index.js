import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, ImageBackground, Modal, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Header from '../components/Header';
import BearCrowdScene from '../components/BearCrowdScene';
import cafeteriaBackground from '../../assets/eng5-cafeteria.jpg';

const FACILITY_ID = 'eng5_cafeteria';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
const REFRESH_MS = 5_000;
const CROWD_LABEL = { LOW: '여유', MEDIUM: '보통', HIGH: '포화' };
const CROWD_RANGE = { LOW: '약 0~21명', MEDIUM: '약 22~100명', HIGH: '101명 이상' };
const CROWD_COLOR = { LOW: '#268449', MEDIUM: '#e69a00', HIGH: '#d92f2f' };

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
  const [menuOpen, setMenuOpen] = useState(false);

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
      <ImageBackground source={cafeteriaBackground} resizeMode="cover" style={styles.home}>
        <View style={styles.imageTint} />
        <BearCrowdScene crowdLevel={hasData ? latest.crowd_level : null} />
        <View style={styles.frontLayer}>
          <Header title="" light onMenu={() => setMenuOpen(true)} onAlerts={() => router.push('/settings')} />
          <View style={styles.badgeWrap}>
            <View style={styles.statusBadge}>
              {loading && !result ? <ActivityIndicator color="#355f49" style={styles.loader} /> : null}
              <View style={styles.levelIcon}>
                <View style={[styles.levelBar, { height: 8, backgroundColor: CROWD_COLOR[latest?.crowd_level] ?? '#32ad4b' }]} />
                <View style={[styles.levelBar, { height: 14, backgroundColor: CROWD_COLOR[latest?.crowd_level] ?? '#32ad4b' }]} />
                <View style={[styles.levelBar, { height: 20, backgroundColor: CROWD_COLOR[latest?.crowd_level] ?? '#32ad4b' }]} />
              </View>
              <View style={styles.badgeText}>
                <View style={styles.badgeMain}>
                  <Text style={styles.statusLabel}>현재 · </Text>
                  <Text style={[styles.levelLabel, { color: CROWD_COLOR[latest?.crowd_level] ?? '#355f49' }]}>
                    {hasData ? CROWD_LABEL[latest.crowd_level] ?? '확인 중' : '확인 중'}
                  </Text>
                </View>
                <Text style={styles.rangeLabel}>{hasData ? CROWD_RANGE[latest.crowd_level] ?? '분석 결과 확인 중' : 'AI 분석 결과 대기 중'}</Text>
              </View>
            </View>
          </View>
        </View>
        {hasData && <Text style={styles.homeFootnote}>분석 기준 {formatDate(latest.analyzed_at)}</Text>}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!API_BASE_URL && <Text style={styles.errorText}>API 주소를 설정하면 서버 데이터가 표시됩니다.</Text>}
      </ImageBackground>
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.menuOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="메뉴 닫기"
            onPress={() => setMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTitle}>공간 선택</Text>
                <Text style={styles.drawerSubtitle}>현재 안내 가능한 공간</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="메뉴 닫기"
                onPress={() => setMenuOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: true }}
              onPress={() => setMenuOpen(false)}
              style={styles.facilityRow}
            >
              <Text style={styles.facilityIcon}>🍽️</Text>
              <View style={styles.facilityCopy}>
                <Text style={styles.facilityName}>5공학관 식당</Text>
                <Text style={styles.facilityDetail}>현재 서비스 장소</Text>
              </View>
              <Text style={styles.selectedMark}>✓</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                router.push('/settings');
              }}
              style={styles.settingsRow}
            >
              <Text style={styles.settingsIcon}>🔔</Text>
              <Text style={styles.settingsLabel}>알림 설정</Text>
              <Text style={styles.settingsChevron}>›</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#dfe9d9' },
  home: { flex: 1, backgroundColor: '#dfe9d9' },
  imageTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22, 37, 28, 0.06)' },
  frontLayer: { zIndex: 10 },
  badgeWrap: { alignItems: 'center', marginTop: 4 },
  statusBadge: { minWidth: 214, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.97)', shadowColor: '#17251d', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
  levelIcon: { height: 22, marginRight: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  levelBar: { width: 6, borderRadius: 2, backgroundColor: '#32ad4b' },
  badgeText: { alignItems: 'center' },
  badgeMain: { flexDirection: 'row', alignItems: 'baseline' },
  statusLabel: { color: '#17251d', fontSize: 15, fontWeight: '800' },
  levelLabel: { fontSize: 21, fontWeight: '900' },
  rangeLabel: { marginTop: 1, color: '#27342b', fontSize: 12, fontWeight: '700' },
  loader: { marginRight: 8 },
  errorText: { position: 'absolute', top: 143, alignSelf: 'center', maxWidth: '90%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.93)', textAlign: 'center', color: '#a23434', fontSize: 12 },
  homeFootnote: { position: 'absolute', bottom: 9, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, color: '#fff', backgroundColor: 'rgba(22, 37, 28, 0.38)', fontSize: 10, textShadowColor: '#17251d', textShadowRadius: 5 },
  menuOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(16, 25, 19, 0.42)' },
  drawer: { width: '82%', maxWidth: 340, paddingHorizontal: 20, paddingTop: 18, backgroundColor: '#f7f8f5', borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  drawerHeader: { minHeight: 72, marginBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drawerTitle: { color: '#1d2a21', fontSize: 22, fontWeight: '800' },
  drawerSubtitle: { marginTop: 4, color: '#778178', fontSize: 13 },
  closeButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9eee9' },
  closeText: { color: '#35483b', fontSize: 28, lineHeight: 30 },
  facilityRow: { minHeight: 74, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: '#e8f1e9' },
  facilityIcon: { marginRight: 12, fontSize: 23 },
  facilityCopy: { flex: 1 },
  facilityName: { color: '#254832', fontSize: 15, fontWeight: '800' },
  facilityDetail: { marginTop: 4, color: '#6a7a6e', fontSize: 12 },
  selectedMark: { color: '#39714b', fontSize: 19, fontWeight: '800' },
  menuDivider: { height: 1, marginVertical: 18, backgroundColor: '#e3e8e3' },
  settingsRow: { minHeight: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 14 },
  settingsIcon: { marginRight: 12, fontSize: 19 },
  settingsLabel: { flex: 1, color: '#2a352d', fontSize: 15, fontWeight: '700' },
  settingsChevron: { color: '#869188', fontSize: 26 },
});
