import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, CaretRight, FileText, LockSimple, ShieldWarning, UsersThree } from '../../../../components/icons';
import { spacing } from '../../../../lib/theme';
import { PF } from '../../../../lib/profileTheme';

const LEGAL_LINKS = [
  { label: 'Terms of Service',        doc: 'terms-of-use',           Icon: FileText },
  { label: 'Privacy Policy',          doc: 'privacy-policy',         Icon: LockSimple },
  { label: 'Community Guidelines',    doc: 'community-guidelines',   Icon: UsersThree },
  { label: 'Reporting & Enforcement', doc: 'reporting-enforcement',  Icon: ShieldWarning },
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
            <CaretLeft size={24} color={PF.text} weight="bold" />
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
              onPress={() => router.push(`/legal/document?doc=${item.doc}` as any)}
            >
              <item.Icon size={20} weight="regular" color={PF.icon} />
              <Text style={styles.rowLabel}>{item.label}</Text>
              <CaretRight size={14} weight="regular" color={PF.icon} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.support}>Questions?</Text>
        <TouchableOpacity
          style={styles.supportLinkWrap}
          onPress={() => Linking.openURL('mailto:support@betweencovers.app').catch(() => {})}
          accessibilityRole="link"
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        >
          <Text style={styles.supportLink}>support@betweencovers.app</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PF.page },
  header: { backgroundColor: PF.header, padding: spacing.lg, paddingTop: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  backButton: { padding: 2 },
  title: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: PF.text, lineHeight: 38 },
  titleDivider: { width: 40, height: 1, backgroundColor: PF.accent, marginTop: 4 },
  curve: { height: 20, backgroundColor: PF.page, borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { padding: spacing.lg },
  card: { backgroundColor: PF.card, borderRadius: 20, overflow: 'hidden', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: PF.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: PF.border },
  rowLabel: { flex: 1, fontSize: 14, color: PF.text },
  support: { marginTop: spacing.xl, textAlign: 'center', fontSize: 11, color: PF.secondary, letterSpacing: 0.2 },
  // Quieter than before but clearly a link (5.4:1), and it opens Mail.
  supportLinkWrap: { alignSelf: 'center', marginTop: 2 },
  supportLink: { fontSize: 12, color: PF.label, textDecorationLine: 'underline' },
});