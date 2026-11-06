import { router } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import Header from '../components/Header';
import { useSettings } from '../context/settings';

export default function SettingsScreen() {
  const { settings, updateSettings, pushStatus } = useSettings();
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <Header title="알림 설정" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.pageBody}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>자리 알림</Text>
          <Text style={styles.bodyText}>식당에 이용 가능한 자리가 생기면 알림을 받습니다.</Text>
          <View style={styles.switchRow}><Text style={styles.rowTitle}>알림 받기</Text><Switch value={settings.enabled} onValueChange={(value) => updateSettings({ enabled: value })} /></View>
        </View>
        <Text style={styles.sectionTitle}>알림 받을 상황</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}><View style={styles.flexText}><Text style={styles.rowTitle}>포화 → 보통으로 낮아질 때</Text><Text style={styles.bodyText}>감지 인원이 101명 이상에서 22~100명으로 바뀌면 알려드려요.</Text></View><Switch value={settings.notifyOnMedium} onValueChange={(value) => updateSettings({ notifyOnMedium: value })} disabled={!settings.enabled} /></View>
          <View style={styles.rowDivider} />
          <View style={styles.switchRow}><View style={styles.flexText}><Text style={styles.rowTitle}>보통 또는 포화 → 여유로 낮아질 때</Text><Text style={styles.bodyText}>감지 인원이 22명 이상에서 0~21명으로 바뀌면 알려드려요.</Text></View><Switch value={settings.notifyOnLow} onValueChange={(value) => updateSettings({ notifyOnLow: value })} disabled={!settings.enabled} /></View>
        </View>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>푸시 알림 상태</Text>
          <Text style={styles.bodyText}>{pushStatus}</Text>
        </View>
        <Pressable style={styles.linkCard} onPress={() => router.push('/history')}><Text style={styles.rowTitle}>알림 내역 보기</Text><Text style={styles.chevron}>›</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f2' },
  pageBody: { padding: 20, gap: 16 },
  card: { borderRadius: 20, padding: 18, backgroundColor: '#fff' },
  cardTitle: { color: '#1e2921', fontSize: 17, fontWeight: '800' },
  bodyText: { marginTop: 5, color: '#707a73', fontSize: 13, lineHeight: 19 },
  switchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowTitle: { color: '#202a23', fontSize: 15, fontWeight: '700' },
  flexText: { flex: 1 },
  sectionTitle: { marginTop: 4, marginLeft: 2, fontSize: 14, fontWeight: '800', color: '#4f5c53' },
  rowDivider: { height: 1, backgroundColor: '#edf0ec' },
  noticeCard: { padding: 17, borderRadius: 18, backgroundColor: '#edf3ee' },
  noticeTitle: { color: '#315b40', fontSize: 14, fontWeight: '800' },
  linkCard: { minHeight: 58, paddingHorizontal: 18, borderRadius: 18, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: { color: '#829087', fontSize: 30 },
});
