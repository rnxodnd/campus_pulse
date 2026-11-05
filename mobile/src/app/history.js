import { router } from 'expo-router';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Header from '../components/Header';

export default function HistoryScreen() {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <Header title="알림 내역" onBack={() => router.back()} />
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🔔</Text>
        <Text style={styles.rowTitle}>아직 받은 알림이 없어요.</Text>
        <Text style={styles.bodyText}>푸시 알림 연동 후 내역을 확인할 수 있습니다.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f2' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyIcon: { marginBottom: 16, color: '#799681', fontSize: 48 },
  rowTitle: { color: '#202a23', fontSize: 15, fontWeight: '700' },
  bodyText: { marginTop: 5, color: '#707a73', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
