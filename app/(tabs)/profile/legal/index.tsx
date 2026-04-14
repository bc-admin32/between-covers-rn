import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../../../lib/theme';

const LEGAL_LINKS = [
  { label: 'Terms of Service', doc: 'terms-of-use' },
  { label: 'Privacy Policy', doc: 'privacy-policy' },
  { label: 'Community Guidelines', doc: 'community-guidelines' },
  { label: 'Reporting & Enforcement', doc: 'reporting-enforcement' },
];

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Legal</Text>
        <View style={styles.titleDivider} />
      </View>
      <View style={styles.curve} />

      {/* LINKS */}
      <View style={styles.content}>
        <View style={styles.card}>
          {LEGAL_LINKS.map((item, index) => (
            <TouchableOpacity
              key={item.doc}
              style={[styles.row, index !== 0 && styles.rowBorder]}
              onPress={() => router.push(`/(tabs)/profile/legal/document?doc=${item.doc}` as any)}
            >
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(15,42,72,0.25)" />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.support}>
          Questions?{' '}
          <Text style={styles.supportLink}>support@betweencovers.app</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  header: { backgroundColor: '#6B9AB8', padding: spacing.lg, paddingTop: spacing.md },
  backButton: { marginBottom: spacing.lg },
  backArrow: { fontSize: 20, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  title: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: '#F0EDE4', lineHeight: 38 },
  titleDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 10 },
  curve: { height: 20, backgroundColor: '#F1F4F8', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { padding: spacing.lg },
  card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: 'rgba(15,42,72,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(15,42,72,0.07)' },
  rowLabel: { fontSize: 14, color: '#0F2A48' },
  support: { marginTop: spacing.xl, textAlign: 'center', fontSize: 12, color: '#A9C0D4', letterSpacing: 0.2 },
  supportLink: { color: '#6B9AB8' },
});