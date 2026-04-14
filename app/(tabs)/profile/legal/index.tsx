import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CaretLeft } from 'phosphor-react-native';
import { spacing } from '../../../../lib/theme';

const LEGAL_LINKS = [
  { label: 'Terms of Service',        doc: 'terms-of-use',           icon: '📄' },
  { label: 'Privacy Policy',          doc: 'privacy-policy',         icon: '🔒' },
  { label: 'Community Guidelines',    doc: 'community-guidelines',   icon: '👥' },
  { label: 'Reporting & Enforcement', doc: 'reporting-enforcement',  icon: '🛡️' },
];

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <CaretLeft size={24} color="rgba(255,255,255,0.85)" weight="bold" />
          </TouchableOpacity>
          <Text style={styles.title}>Legal</Text>
        </View>
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
              <Text style={styles.rowIcon}>{item.icon}</Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  backButton: { padding: 2 },
  title: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: '#F0EDE4', lineHeight: 38 },
  titleDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 4 },
  curve: { height: 20, backgroundColor: '#F1F4F8', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { padding: spacing.lg },
  card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: 'rgba(15,42,72,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(15,42,72,0.07)' },
  rowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 14, color: '#0F2A48' },
  support: { marginTop: spacing.xl, textAlign: 'center', fontSize: 12, color: '#A9C0D4', letterSpacing: 0.2 },
  supportLink: { color: '#6B9AB8' },
});