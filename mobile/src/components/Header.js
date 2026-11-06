import { Pressable, StyleSheet, Text, View } from 'react-native';

/** @param {{ title: string, onBack?: () => void, onMenu?: () => void, onAlerts?: () => void, light?: boolean }} props */
export default function Header({ title, onBack, onMenu, onAlerts, light = false }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} style={styles.iconButton}>
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="공간 메뉴 열기" onPress={onMenu} style={styles.iconButton}>
          <Text style={styles.iconText}>☰</Text>
        </Pressable>
      )}
      <Text style={[styles.headerTitle, light && styles.lightText]}>{title}</Text>
      {!onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="알림 설정" onPress={onAlerts} style={styles.iconButton}>
          <Text style={styles.iconText}>🔔</Text>
        </Pressable>
      ) : <View style={styles.iconButton} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, color: '#18231c', fontWeight: '800' },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#1e2c23', fontSize: 25, lineHeight: 28 },
  lightText: { color: '#fff' },
});
