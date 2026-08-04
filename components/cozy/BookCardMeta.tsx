import { View, Text, StyleSheet } from 'react-native';
import { prettifyEnum } from '../../lib/tagTaxonomy';

// Defensive normalization: a field typed string[] may arrive from backfilled
// catalog data as a real array, a comma-joined string, or an array containing
// null/non-string elements. Produce a clean string[] so malformed data renders
// blank instead of crashing (e.g. `.map` on a string, or prettifyEnum(null)).
function toStringList(value: unknown): string[] {
  const arr = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',') // only split when it's NOT already an array
      : [];
  return arr
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

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
  // Guard the actual value reaching String.repeat(): a non-integer truncates,
  // but Infinity/NaN or a negative/corrupted value would throw a RangeError.
  // Clamp to the valid 1–5 domain (leaves genuine data unchanged).
  const spiceCount =
    typeof spice === 'number' && Number.isFinite(spice)
      ? Math.min(Math.max(Math.trunc(spice), 0), 5)
      : 0;
  const hasSpice = spiceCount > 0;
  const shownTropes = toStringList(tropes).slice(0, maxTropes);
  const shownTriggers = toStringList(triggers);

  return (
    <>
      {hasSpice && (
        <Text style={styles.spice} numberOfLines={1}>
          {'🌶️'.repeat(spiceCount)}
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
