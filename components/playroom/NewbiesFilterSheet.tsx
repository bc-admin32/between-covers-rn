import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BookCardData } from '../cozy/BookCard';
import { prettifyEnum } from '../../lib/tagTaxonomy';
import { PR } from '../../lib/playroomPage';
import { spacing } from '../../lib/theme';

// Filters this month's Newbies in the app (no extra request): genre group,
// spice 0–5 and tropes. Within a group any choice matches; across groups a
// book has to match all three. Options come from the books on screen, so
// only choices that have books show. /cozy/new-releases has no trigger data,
// so comfort boundaries aren't applied here.

export type NewbiesFilters = { genres: string[]; spice: number[]; tropes: string[] };
export const EMPTY_FILTERS: NewbiesFilters = { genres: [], spice: [], tropes: [] };

export function filterCount(f: NewbiesFilters): number {
  return f.genres.length + f.spice.length + f.tropes.length;
}

// Spice and tropes; genre is applied per group by the screen.
export function matchesFilters(b: BookCardData, f: NewbiesFilters): boolean {
  if (f.spice.length && !f.spice.includes(typeof b.spice === 'number' ? b.spice : -1)) return false;
  if (f.tropes.length && !(b.tropes ?? []).some((t) => f.tropes.includes(t))) return false;
  return true;
}

type Section = { genre: string; books: BookCardData[] };

export function filterSections(sections: Section[], f: NewbiesFilters): Section[] {
  return sections
    .filter((s) => !f.genres.length || f.genres.includes(s.genre))
    .map((s) => ({ ...s, books: s.books.filter((b) => matchesFilters(b, f)) }))
    .filter((s) => s.books.length > 0);
}

// Drops choices the shown month doesn't have (after Last Month / Current).
export function pruneFilters(f: NewbiesFilters, sections: Section[]): NewbiesFilters {
  const books = sections.flatMap((s) => s.books);
  return {
    genres: f.genres.filter((g) => sections.some((s) => s.genre === g)),
    spice: f.spice.filter((n) => books.some((b) => b.spice === n)),
    tropes: f.tropes.filter((t) => books.some((b) => (b.tropes ?? []).includes(t))),
  };
}

const TOP_TROPES = 12;

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function NewbiesFilterSheet({ visible, sections, value, onChange, onClose }: {
  visible: boolean;
  sections: Section[];
  value: NewbiesFilters;
  onChange: (f: NewbiesFilters) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Choices apply when "Show" is tapped; closing without it keeps the old ones.
  const [draft, setDraft] = useState<NewbiesFilters>(value);
  const [allTropes, setAllTropes] = useState(false);
  useEffect(() => { if (visible) { setDraft(value); setAllTropes(false); } }, [visible, value]);

  const books = useMemo(() => sections.flatMap((s) => s.books), [sections]);
  const spiceLevels = useMemo(
    () => [0, 1, 2, 3, 4, 5].filter((n) => books.some((b) => b.spice === n)),
    [books],
  );
  // This month's tropes, most common first.
  const tropes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) for (const t of b.tropes ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [books]);
  const shownTropes = allTropes ? tropes : tropes.slice(0, TOP_TROPES);
  const resultCount = filterSections(sections, draft).reduce((n, s) => n + s.books.length, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Filter Newbies</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.groupLabel}>Genre</Text>
          <View style={styles.chips}>
            {sections.map((s) => (
              <Chip
                key={s.genre}
                label={`${s.genre} (${s.books.length})`}
                active={draft.genres.includes(s.genre)}
                onPress={() => setDraft((d) => ({ ...d, genres: toggle(d.genres, s.genre) }))}
              />
            ))}
          </View>

          {spiceLevels.length > 0 && (
            <>
              <Text style={styles.groupLabel}>Spice</Text>
              <View style={styles.chips}>
                {spiceLevels.map((n) => (
                  <Chip
                    key={n}
                    label={n === 0 ? 'No Spice' : `🌶️ ${n}`}
                    active={draft.spice.includes(n)}
                    onPress={() => setDraft((d) => ({ ...d, spice: toggle(d.spice, n) }))}
                  />
                ))}
              </View>
            </>
          )}

          {tropes.length > 0 && (
            <>
              <Text style={styles.groupLabel}>Tropes</Text>
              <View style={styles.chips}>
                {shownTropes.map((t) => (
                  <Chip
                    key={t}
                    label={prettifyEnum(t)}
                    active={draft.tropes.includes(t)}
                    onPress={() => setDraft((d) => ({ ...d, tropes: toggle(d.tropes, t) }))}
                  />
                ))}
              </View>
              {tropes.length > TOP_TROPES && (
                <TouchableOpacity onPress={() => setAllTropes((v) => !v)} style={styles.moreLink} accessibilityRole="button">
                  <Text style={styles.moreLinkText}>{allTropes ? 'Show fewer' : `Show all ${tropes.length}`}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.clearButton} onPress={() => setDraft(EMPTY_FILTERS)} accessibilityRole="button">
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.showButton}
            onPress={() => { onChange(draft); onClose(); }}
            accessibilityRole="button"
          >
            <Text style={styles.showText}>{resultCount === 1 ? 'Show 1 book' : `Show ${resultCount} books`}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: PR.overlay },
  sheet: { maxHeight: '82%', backgroundColor: PR.pageBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: PR.cardBorder, alignSelf: 'center', marginTop: 12, marginBottom: 10 },
  title: { fontSize: 22, color: PR.heading, fontFamily: 'Cormorant_700Bold_Italic', marginBottom: spacing.sm },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: spacing.md },
  groupLabel: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: PR.eyebrow, fontWeight: '700', marginTop: spacing.md, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: PR.cardBorder, backgroundColor: PR.card },
  // Selected: rose with white text (5.8:1).
  chipActive: { backgroundColor: PR.rose, borderColor: PR.rose },
  chipText: { fontSize: 12, color: PR.heading },
  chipTextActive: { color: PR.onRose, fontWeight: '700' },
  moreLink: { alignSelf: 'flex-start', marginTop: 10 },
  moreLinkText: { fontSize: 12, color: PR.eyebrow, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PR.cardBorder },
  clearButton: { flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: PR.rose, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 14, color: PR.rose, fontWeight: '700' },
  showButton: { flex: 2, height: 46, borderRadius: 999, backgroundColor: PR.rose, alignItems: 'center', justifyContent: 'center' },
  showText: { fontSize: 14, color: PR.onRose, fontWeight: '700' },
});
