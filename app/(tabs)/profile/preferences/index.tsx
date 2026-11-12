import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Switch,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { CaretLeft } from '../../../../components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPatch, ApiError } from '../../../../lib/api';
import { TROPES, tropeLabel } from '../../../../lib/tagTaxonomy';
import { spacing, colors } from '../../../../lib/theme';
import { PF } from '../../../../lib/profileTheme';
import {
  getFinishedBookPromptEnabled,
  setFinishedBookPromptEnabled,
} from '../../../../lib/finishedBookPromptPreference';
import { SPICE_OPTIONS, TRIGGER_OPTIONS } from '../../../../lib/guestPreferences';

// Reading time, drinks and snacks are no longer asked here, and the reading
// location moved to Account & Settings (My Escape). Saving leaves those
// profile fields as they are on the server.

const TROPE_OPTIONS = [
  { key: 'CONTEMPORARY_ROMANCE', label: '✨ Contemporary Romance' },
  { key: 'ROMANTIC_SUSPENSE', label: '🕵️ Romantic Suspense' },
  { key: 'FANTASY_ROMANCE', label: '🧚 Fantasy Romance' },
  { key: 'PARANORMAL_ROMANCE', label: '🧛 Paranormal Romance' },
  { key: 'HISTORICAL_ROMANCE', label: '👑 Historical Romance' },
  { key: 'DARK_ROMANCE', label: '🖤 Dark Romance' },
  { key: 'SPICY_EROTIC_ROMANCE', label: '🔥 Spicy / Erotic Romance' },
];

// Favorite Tropes (saved as `tropes`) — NOT the subgenre list above, which is
// historically named TROPE_OPTIONS. A fixed, curated set of 10 (keys match
// the book trope taxonomy); shown in this order.
const MAX_FAVORITE_TROPES = 5;
const FAVORITE_TROPE_OPTIONS = [
  { key: 'ENEMIES_TO_LOVERS', label: 'Enemies to Lovers' },
  { key: 'FRIENDS_TO_LOVERS', label: 'Friends to Lovers' },
  { key: 'SECOND_CHANCE', label: 'Second Chance' },
  { key: 'FAKE_DATING', label: 'Fake Dating' },
  { key: 'FORCED_PROXIMITY', label: 'Forced Proximity' },
  { key: 'MARRIAGE_OF_CONVENIENCE', label: 'Marriage of Convenience' },
  { key: 'GRUMPY_SUNSHINE', label: 'Grumpy / Sunshine' },
  { key: 'FORBIDDEN_LOVE', label: 'Forbidden Love' },
  { key: 'SLOW_BURN', label: 'Slow Burn' },
  { key: 'FATED_MATES', label: 'Fated Mates' },
];
const FAVORITE_TROPE_KEYS = new Set(FAVORITE_TROPE_OPTIONS.map((o) => o.key));

type TropeOption = { key: string; label: string };

// "Explore more" group: every other trope, A–Z by label, excluding the 10.
function extraTropes(options: TropeOption[]): TropeOption[] {
  return options
    .filter((o) => !FAVORITE_TROPE_KEYS.has(o.key))
    .sort((a, b) => a.label.localeCompare(b.label));
}
// Saved `tropes` may hold duplicates, blanks, non-strings, labels instead of
// keys ("Slow Burn"), or lowercase keys. Clean them so the "N of 5" count only
// counts picks that show as selected chips: label -> key, else KEY_FORMAT,
// de-duplicated. The cleaned list is what gets saved next time.
const labelToken = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const TROPE_KEY_BY_LABEL = new Map<string, string>(
  [...FAVORITE_TROPE_OPTIONS, ...TROPES.map((t) => ({ key: t.key as string, label: t.label }))]
    .map((o) => [labelToken(o.label), o.key])
);
function cleanSavedTropes(raw: unknown): string[] {
  const out: string[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const key = TROPE_KEY_BY_LABEL.get(labelToken(v))
      ?? v.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

// Used until GET /taxonomy?type=TROPE answers, and kept if it fails.
const EXTRA_TROPE_FALLBACK = extraTropes(TROPES.map((t) => ({ key: t.key as string, label: t.label })));

// LGBTQ+ romance (saved as `lgbtqPreference`; nothing selected = null).
const LGBTQ_PREFERENCE_OPTIONS = [
  { key: 'LOVE', label: 'Love it' },
  { key: 'OPEN', label: 'Open to it' },
  { key: 'NOT_FOR_ME', label: 'Not for me' },
];

// `count` sits right after the title (e.g. "Favorite Tropes · 3 of 5").
function PrefCard({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLine} />
        <Text style={styles.cardLabel}>{label}</Text>
        {!!count && <Text style={styles.cardCount}>· {count}</Text>}
        <View style={styles.cardLine} />
      </View>
      {children}
    </View>
  );
}

function ChipGroup({ options, selected, onSelect }: {
  options: readonly { key: string; label: string }[];
  selected: string | null;
  onSelect: (val: string) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      {options.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          style={[styles.chip, selected === key && styles.chipSelected]}
          onPress={() => onSelect(key)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === key }}
        >
          <Text style={[styles.chipText, selected === key && styles.chipTextSelected]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MultiChipGroup({ options, value, onChange, danger, max }: {
  options: readonly { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  danger?: boolean;
  // Once `max` are selected, unselected chips are disabled (selected ones
  // stay tappable so they can be removed).
  max?: number;
}) {
  const atMax = max != null && value.length >= max;
  return (
    <View style={styles.chipGroup}>
      {options.map(({ key, label }) => {
        const active = value.includes(key);
        const disabled = !active && atMax;
        return (
          <TouchableOpacity
            key={key}
            disabled={disabled}
            style={[styles.chip, active && (danger ? styles.chipDanger : styles.chipSelected), disabled && styles.chipDisabled]}
            onPress={() => onChange(active ? value.filter((v) => v !== key) : [...value, key])}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
          >
            <Text style={[styles.chipText, active && styles.chipTextSelected]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ReadingPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);

  const [genres, setGenres] = useState<string[]>([]);
  const [comfortBoundaries, setComfortBoundaries] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState<string | null>(null);
  const [favoriteTropes, setFavoriteTropes] = useState<string[]>([]);
  const [extraTropeOptions, setExtraTropeOptions] = useState<TropeOption[]>(EXTRA_TROPE_FALLBACK);
  const [showMoreTropes, setShowMoreTropes] = useState(false);
  const [lgbtqPreference, setLgbtqPreference] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Local-only (SecureStore, not /profile) — unlike the fields above, this
  // writes immediately on toggle rather than batching into "Save
  // Preferences" below (see handleFinishedBookPromptToggle).
  const [finishedBookPromptEnabled, setFinishedBookPromptEnabledState] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await apiGet('/profile');
      setGenres(Array.isArray(data.genres) ? data.genres : []);
      setComfortBoundaries(Object.keys(data.comfortBoundaries ?? {}));
      setSpiceLevel(data.spiceLevel ?? null);
      const savedTropes = cleanSavedTropes(data.tropes);
      setFavoriteTropes(savedTropes);
      // A saved pick outside the 10 starts the "Explore more" group open so
      // it's visible.
      if (savedTropes.some((k) => !FAVORITE_TROPE_KEYS.has(k))) setShowMoreTropes(true);
      setLgbtqPreference(data.lgbtqPreference ?? null);
      setFinishedBookPromptEnabledState(await getFinishedBookPromptEnabled());
      setSaved(true);
      setLoading(false);
    };
    load();

    // Full trope vocabulary for the "Explore more" group; on failure the
    // lib/tagTaxonomy fallback stays.
    apiGet<{ items?: { sk: string; label: string }[] }>('/taxonomy?type=TROPE')
      .then((res) => {
        const items = (res?.items ?? []).filter((i) => i?.sk && i?.label);
        if (items.length) setExtraTropeOptions(extraTropes(items.map((i) => ({ key: i.sk, label: i.label }))));
      })
      .catch(() => {});
  }, []);

  // Saved tropes that are in neither list still appear (at the end of the
  // extra group), so they're never silently dropped and can be removed.
  const extraTropeChips: TropeOption[] = [
    ...extraTropeOptions,
    ...favoriteTropes
      .filter((k) => !FAVORITE_TROPE_KEYS.has(k) && !extraTropeOptions.some((o) => o.key === k))
      .map((k) => ({ key: k, label: tropeLabel(k) })),
  ];
  // Collapsed ("Show fewer"), the extra group still shows its selected picks,
  // so every pick in the count is on screen.
  const visibleExtraTropeChips = showMoreTropes
    ? extraTropeChips
    : extraTropeChips.filter((o) => favoriteTropes.includes(o.key));

  const handleFinishedBookPromptToggle = async (v: boolean) => {
    Haptics.selectionAsync();
    setFinishedBookPromptEnabledState(v); // optimistic UI update
    await setFinishedBookPromptEnabled(v);
  };

  const save = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    setSaveError(null);
    const comfortMap: Record<string, boolean> = {};
    comfortBoundaries.forEach((k) => (comfortMap[k] = true));
    try {
      await apiPatch('/profile', {
        genres,
        comfortBoundaries: comfortMap,
        spiceLevel,
        tropes: favoriteTropes,
        lgbtqPreference,
      });
      setSaved(true);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body ?? {}) as { message?: unknown; error?: unknown } : {};
      const msg = typeof body.message === 'string' ? body.message
        : typeof body.error === 'string' ? body.error
        : "Couldn't save your preferences. Please try again.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const markUnsaved = () => setSaved(false);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
              <CaretLeft size={24} color={PF.text} weight="bold" />
            </TouchableOpacity>
            <Text style={styles.title}>Reading Preferences</Text>
          </View>
          <View style={styles.titleDivider} />
        </View>
        <View style={styles.curve} />

        <View style={styles.content}>
          <PrefCard label="Favorite Genres">
            <MultiChipGroup options={TROPE_OPTIONS} value={genres} onChange={(v) => { Haptics.selectionAsync(); setGenres(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Favorite Tropes" count={`${favoriteTropes.length} of ${MAX_FAVORITE_TROPES}`}>
            {/* Both groups share one selection, so the max of 5 and the count
                apply across them combined. */}
            <MultiChipGroup
              options={FAVORITE_TROPE_OPTIONS}
              value={favoriteTropes}
              max={MAX_FAVORITE_TROPES}
              onChange={(v) => { Haptics.selectionAsync(); setFavoriteTropes(v); markUnsaved(); }}
            />
            <TouchableOpacity onPress={() => setShowMoreTropes((v) => !v)} style={styles.moreTropesLink} accessibilityRole="button">
              <Text style={styles.moreTropesLinkText}>
                {showMoreTropes ? 'Show fewer' : "Don't see your favorite trope? Explore more →"}
              </Text>
            </TouchableOpacity>
            {visibleExtraTropeChips.length > 0 && (
              <MultiChipGroup
                options={visibleExtraTropeChips}
                value={favoriteTropes}
                max={MAX_FAVORITE_TROPES}
                onChange={(v) => { Haptics.selectionAsync(); setFavoriteTropes(v); markUnsaved(); }}
              />
            )}
          </PrefCard>

          <PrefCard label="Spice Level">
            <ChipGroup options={SPICE_OPTIONS} selected={spiceLevel} onSelect={(v) => { Haptics.selectionAsync(); setSpiceLevel(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="LGBTQ+ Romance">
            <ChipGroup
              options={LGBTQ_PREFERENCE_OPTIONS}
              selected={lgbtqPreference}
              onSelect={(v) => { Haptics.selectionAsync(); setLgbtqPreference((prev) => (prev === v ? null : v)); markUnsaved(); }}
            />
            <Text style={styles.prefNote}>This only affects Iris's personal recommendations.</Text>
          </PrefCard>

          <PrefCard label="Comfort Boundaries">
            <Text style={styles.boundaryNote}>
              We'll do our best to avoid these themes in your personalized picks, but not every book description includes complete warnings.
            </Text>
            <MultiChipGroup options={TRIGGER_OPTIONS} value={comfortBoundaries} onChange={(v) => { Haptics.selectionAsync(); setComfortBoundaries(v); markUnsaved(); }} danger />
          </PrefCard>

          {/* Local-only setting, not part of the batched Save below — it
              writes immediately on toggle. */}
          <PrefCard label="Book Ratings">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Remind me to rate books when I finish</Text>
              <Switch
                value={finishedBookPromptEnabled}
                onValueChange={handleFinishedBookPromptToggle}
                trackColor={{ false: PF.switchOff, true: PF.accent }}
                thumbColor="#fff"
              />
            </View>
          </PrefCard>

          <TouchableOpacity
            style={[styles.saveButton, saved ? styles.saveButtonSaved : styles.saveButtonUnsaved, saving && styles.saveButtonDisabled]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Preferences'}
            </Text>
          </TouchableOpacity>
          {saveError && <Text style={styles.saveError}>{saveError}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PF.page },
  scrollContent: { paddingBottom: spacing.xl },
  header: { backgroundColor: PF.header, padding: spacing.lg, paddingTop: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  backButton: { padding: 2 },
  title: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: PF.text, lineHeight: 38 },
  titleDivider: { width: 40, height: 1, backgroundColor: PF.accent, marginTop: 10 },
  curve: { height: 20, backgroundColor: PF.page, borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: { backgroundColor: PF.card, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: PF.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  cardLine: { flex: 1, height: 1, backgroundColor: PF.border },
  cardLabel: { fontSize: 9, fontFamily: 'Lato_700Bold', letterSpacing: 1.6, textTransform: 'uppercase', color: PF.label },
  cardCount: { fontSize: 10, fontFamily: 'Lato_700Bold', color: PF.label, marginLeft: -4 },
  boundaryNote: { fontSize: 12, color: PF.secondary, lineHeight: 18, marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  toggleLabel: { flex: 1, fontSize: 14, color: PF.text },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: PF.inputBorder, backgroundColor: '#FFFFFF' },
  // Selected: navy (white text 14.5:1); comfort boundaries: the accent (5.8:1).
  chipSelected: { backgroundColor: PF.text, borderColor: PF.text },
  chipDanger: { backgroundColor: PF.accent, borderColor: PF.accent },
  chipDisabled: { opacity: 0.4 },
  moreTropesLink: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.sm },
  moreTropesLinkText: { fontSize: 12, color: PF.label, fontFamily: 'Lato_700Bold' },
  prefNote: { fontSize: 12, color: PF.secondary, lineHeight: 18, marginTop: spacing.md },
  saveError: { fontSize: 12, color: PF.accent, textAlign: 'center', marginTop: spacing.sm },
  chipText: { fontSize: 12, color: PF.text },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  saveButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveButtonSaved: { backgroundColor: PF.text },
  saveButtonUnsaved: { backgroundColor: PF.accent },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
});
