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
import { TROPES, prettifyEnum } from '../../../../lib/tagTaxonomy';
import { spacing, radius, colors } from '../../../../lib/theme';
import {
  getFinishedBookPromptEnabled,
  setFinishedBookPromptEnabled,
} from '../../../../lib/finishedBookPromptPreference';
import { SPICE_OPTIONS, TRIGGER_OPTIONS } from '../../../../lib/guestPreferences';

const READING_TIME_OPTIONS = [
  { key: 'Morning Light', label: 'Morning Light' },
  { key: 'Afternoon Energy', label: 'Afternoon Energy' },
  { key: 'Nighttime Calm', label: 'Nighttime Calm' },
  { key: 'Flexible', label: 'Flexible' },
];

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
// Used until GET /taxonomy?type=TROPE answers, and kept if it fails.
const EXTRA_TROPE_FALLBACK = extraTropes(TROPES.map((t) => ({ key: t.key as string, label: t.label })));

// LGBTQ+ romance (saved as `lgbtqPreference`; nothing selected = null).
const LGBTQ_PREFERENCE_OPTIONS = [
  { key: 'LOVE', label: 'Love it' },
  { key: 'OPEN', label: 'Open to it' },
  { key: 'NOT_FOR_ME', label: 'Not for me' },
];

const SNACK_OPTIONS = [
  { key: 'POPCORN', label: '🍿 Popcorn' },
  { key: 'CHOCOLATE', label: '🍫 Chocolate' },
  { key: 'CHIPS', label: '🥨 Pretzel / Chips' },
  { key: 'FRUIT', label: '🍇 Fruit' },
  { key: 'CANDY', label: '🍬 Candy' },
  { key: 'PASTRY', label: '🍪 Cookies / Pastry' },
  { key: 'NONE', label: '✨ No Snack' },
];

const DRINK_OPTIONS = [
  { key: 'TEA', label: '🍵 Tea' },
  { key: 'COFFEE', label: '☕ Coffee' },
  { key: 'HOT_CHOCOLATE', label: '🍫 Hot Chocolate' },
  { key: 'WATER', label: '💧 Water' },
  { key: 'SODA', label: '🥤 Soda' },
  { key: 'WINE', label: '🍷 Wine' },
  { key: 'COCKTAIL', label: '🍹 Cocktail / Mocktail' },
];

const READING_LOCATION_OPTIONS = [
  { key: 'SOFA', label: '🛋️ Curled up on the sofa with a blanket' },
  { key: 'FIREPLACE', label: '🔥 Reading by a cozy fireplace' },
  { key: 'OUTSIDE', label: '🌅 Relaxing outside on a warm summer evening' },
  { key: 'BEACH', label: '🏖️ Reading by the ocean on a sunny day' },
  { key: 'NOOK', label: '✨ Cozy reading nook with pillows & fairy lights' },
  { key: 'CAFE', label: '☕ Local café with pastries' },
  { key: 'BED', label: '🛏️ Snuggled in bed with soft lighting' },
];

function PrefCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLine} />
        <Text style={styles.cardLabel}>{label}</Text>
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

  const [readingTime, setReadingTime] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [comfortBoundaries, setComfortBoundaries] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState<string | null>(null);
  const [snacks, setSnacks] = useState<string[]>([]);
  const [drinks, setDrinks] = useState<string[]>([]);
  const [readingLocation, setReadingLocation] = useState<string | null>(null);
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
      setReadingTime(data.readingTime?.preferredWindow ?? null);
      setGenres(Array.isArray(data.genres) ? data.genres : []);
      setComfortBoundaries(Object.keys(data.comfortBoundaries ?? {}));
      setSpiceLevel(data.spiceLevel ?? null);
      setSnacks(data.snacks ?? []);
      setDrinks(data.drinks ?? []);
      setReadingLocation(data.readingLocation ?? null);
      const savedTropes: string[] = Array.isArray(data.tropes) ? data.tropes : [];
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
      .map((k) => ({ key: k, label: prettifyEnum(k) })),
  ];

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
        readingTime: readingTime ? { preferredWindow: readingTime } : null,
        genres,
        comfortBoundaries: comfortMap,
        spiceLevel,
        snacks,
        drinks,
        readingLocation,
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
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <CaretLeft size={24} color="rgba(255,255,255,0.85)" weight="bold" />
            </TouchableOpacity>
            <Text style={styles.title}>Reading Preferences</Text>
          </View>
          <View style={styles.titleDivider} />
        </View>
        <View style={styles.curve} />

        <View style={styles.content}>
          <PrefCard label="Reading Time">
            <ChipGroup options={READING_TIME_OPTIONS} selected={readingTime} onSelect={(v) => { Haptics.selectionAsync(); setReadingTime(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Favorite Genres">
            <MultiChipGroup options={TROPE_OPTIONS} value={genres} onChange={(v) => { Haptics.selectionAsync(); setGenres(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Favorite Tropes">
            <Text style={styles.tropeCount}>{favoriteTropes.length} of {MAX_FAVORITE_TROPES}</Text>
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
            {showMoreTropes && (
              <MultiChipGroup
                options={extraTropeChips}
                value={favoriteTropes}
                max={MAX_FAVORITE_TROPES}
                onChange={(v) => { Haptics.selectionAsync(); setFavoriteTropes(v); markUnsaved(); }}
              />
            )}
          </PrefCard>

          <PrefCard label="LGBTQ+ Romance">
            <ChipGroup
              options={LGBTQ_PREFERENCE_OPTIONS}
              selected={lgbtqPreference}
              onSelect={(v) => { Haptics.selectionAsync(); setLgbtqPreference((prev) => (prev === v ? null : v)); markUnsaved(); }}
            />
            <Text style={styles.prefNote}>
              {"This only shapes Iris's personal pick for you — you'll still see every book."}
            </Text>
          </PrefCard>

          <PrefCard label="Comfort Boundaries">
            <Text style={styles.boundaryNote}>
              We'll do our best to avoid these themes. Not every book description tells the full story, so we can't guarantee every trigger is caught.
            </Text>
            <MultiChipGroup options={TRIGGER_OPTIONS} value={comfortBoundaries} onChange={(v) => { Haptics.selectionAsync(); setComfortBoundaries(v); markUnsaved(); }} danger />
          </PrefCard>

          <PrefCard label="Spice Level">
            <ChipGroup options={SPICE_OPTIONS} selected={spiceLevel} onSelect={(v) => { Haptics.selectionAsync(); setSpiceLevel(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Favorite Snacks">
            <MultiChipGroup options={SNACK_OPTIONS} value={snacks} onChange={(v) => { Haptics.selectionAsync(); setSnacks(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Favorite Drinks">
            <MultiChipGroup options={DRINK_OPTIONS} value={drinks} onChange={(v) => { Haptics.selectionAsync(); setDrinks(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Reading Location">
            <ChipGroup options={READING_LOCATION_OPTIONS} selected={readingLocation} onSelect={(v) => { Haptics.selectionAsync(); setReadingLocation(v); markUnsaved(); }} />
          </PrefCard>

          {/* Local-only setting, not part of the batched Save below — it
              writes immediately on toggle. */}
          <PrefCard label="Book Ratings">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Ask me to rate books when I finish them</Text>
              <Switch
                value={finishedBookPromptEnabled}
                onValueChange={handleFinishedBookPromptToggle}
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

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  scrollContent: { paddingBottom: spacing.xl },
  header: { backgroundColor: '#6B9AB8', padding: spacing.lg, paddingTop: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  backButton: { padding: 2 },
  title: { fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: '#F0EDE4', lineHeight: 38 },
  titleDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 10 },
  curve: { height: 20, backgroundColor: '#F1F4F8', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: 'rgba(15,42,72,0.06)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  cardLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.08)' },
  cardLabel: { fontSize: 9, fontFamily: 'Lato_700Bold', letterSpacing: 1.6, textTransform: 'uppercase', color: '#A9C0D4' },
  boundaryNote: { fontSize: 12, color: '#A9C0D4', lineHeight: 18, marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  toggleLabel: { flex: 1, fontSize: 14, color: '#0F2A48' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(15,42,72,0.12)', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#6B9AB8', borderColor: '#6B9AB8' },
  chipDanger: { backgroundColor: '#B83255', borderColor: '#B83255' },
  chipDisabled: { opacity: 0.4 },
  moreTropesLink: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.sm },
  moreTropesLinkText: { fontSize: 12, color: '#6B9AB8', fontFamily: 'Lato_700Bold' },
  tropeCount: { fontSize: 11, color: '#A9C0D4', fontFamily: 'Lato_700Bold', marginBottom: spacing.sm, textAlign: 'right' },
  prefNote: { fontSize: 12, color: '#A9C0D4', lineHeight: 18, marginTop: spacing.md },
  saveError: { fontSize: 12, color: '#B83255', textAlign: 'center', marginTop: spacing.sm },
  chipText: { fontSize: 12, color: '#0F2A48' },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  saveButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveButtonSaved: { backgroundColor: '#0F2A48' },
  saveButtonUnsaved: { backgroundColor: '#B83255' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
});
