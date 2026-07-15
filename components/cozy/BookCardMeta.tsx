import { View, Text, StyleSheet } from 'react-native';
import { prettifyEnum } from '../../lib/tagTaxonomy';

/**
 * Shared spice-peppers + trope-pills (+ optional content-warning badges) row,
 * extracted from BookCard so every surface renders spice/tropes identically
 * instead of reimplementing the pepper/pill logic per screen.
 *
 * - spice 1–5 → 🌶️ repeated (nothing when null/0)
 * - tropes[]  → prettified pills, capped at `maxTropes` (default 2)
 * - triggers[] → quieter CW badges, only when the array is passed & non-empty
 *
 * Renders a Fragment (stacked Text/View blocks) so the parent card owns layout.
 * Every field is optional — untagged books render nothing, no placeholders.
 */
export default function BookCardMeta({
  spice,
  tropes,
  triggers,
  maxTropes = 2,
}: {
  spice?: number | null;
  tropes?: string[];
  triggers?: string[];
  maxTropes?: number;
}) {
  const hasSpice = typeof spice === 'number' && spice > 0;
  const shownTropes = (tropes ?? []).slice(0, maxTropes);
  const shownTriggers = triggers ?? [];

  return (
    <>
      {hasSpice && (
        <Text style={styles.spice} numberOfLines={1}>
          {'🌶️'.repeat(spice as number)}
        </Text>
      )}

      {shownTropes.length > 0 && (
        <View style={styles.tropeRow}>
          {shownTropes.map((t) => (
            <View key={t} style={styles.tropePill}>
              <Text style={styles.tropePillText} numberOfLines={1}>{prettifyEnum(t)}</Text>
            </View>
          ))}
        </View>
      )}

      {shownTriggers.length > 0 && (
        <View style={styles.cwRow}>
          {shownTriggers.map((t) => (
            <View key={t} style={styles.cwPill}>
              <Text style={styles.cwPillText} numberOfLines={1}>{prettifyEnum(t)}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  spice: { marginTop: 5, fontSize: 11, letterSpacing: 1 },
  tropeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tropePill: { backgroundColor: 'rgba(15,42,72,0.06)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, maxWidth: '100%' },
  tropePillText: { fontSize: 8, fontWeight: '700', color: '#6A5969', textTransform: 'uppercase', letterSpacing: 0.5 },
  cwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  cwPill: { backgroundColor: 'rgba(15,42,72,0.03)', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1, maxWidth: '100%' },
  cwPillText: { fontSize: 7, fontWeight: '500', color: '#A9A0A6', letterSpacing: 0.3 },
});
