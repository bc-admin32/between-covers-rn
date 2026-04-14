import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPatch } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

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

const TRIGGER_OPTIONS = [
  { key: 'cheating', label: '🚫 Cheating / Infidelity' },
  { key: 'abuse', label: '🖤 Emotional or physical abuse' },
  { key: 'mentalHealthTrauma', label: '🧠 Mental health trauma / self-harm' },
  { key: 'violence', label: '🩸 Violence or graphic injury' },
  { key: 'pregnancyLoss', label: '👶 Pregnancy loss / fertility struggle' },
  { key: 'addiction', label: '🧪 Drug or addiction themes' },
  { key: 'heavyHeartbreak', label: '😢 Heavy emotional heartbreak' },
  { key: 'illness', label: '😰 Illness or injury' },
];

const SPICE_OPTIONS = [
  { key: 'NONE', label: '🫖 Clean & cozy' },
  { key: 'LIGHT', label: '😇 Keep it cute' },
  { key: 'WARM', label: '🍹 A little kick' },
  { key: 'HOT', label: "🥂 We're day drinking" },
  { key: 'VERY_HOT', label: '🥵 Absolutely unhinged' },
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
  options: { key: string; label: string }[];
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

function MultiChipGroup({ options, value, onChange, danger }: {
  options: { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  danger?: boolean;
}) {
  return (
    <View style={styles.chipGroup}>
      {options.map(({ key, label }) => {
        const active = value.includes(key);
        return (
          <TouchableOpacity
            key={key}
            style={[styles.chip, active && (danger ? styles.chipDanger : styles.chipSelected)]}
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
  const [genre, setGenre] = useState<string[]>([]);
  const [comfortBoundaries, setComfortBoundaries] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [drink, setDrink] = useState<string | null>(null);
  const [readingLocation, setReadingLocation] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const data = await apiGet('/profile');
      setReadingTime(data.readingTime?.preferredWindow ?? null);
      setGenre(Array.isArray(data.genre) ? data.genre : []);
      setComfortBoundaries(Object.keys(data.comfortBoundaries ?? {}));
      setSpiceLevel(data.spiceLevel ?? null);
      setSnack(data.snack ?? null);
      setDrink(data.drink ?? null);
      setReadingLocation(data.readingLocation ?? null);
      setSaved(true);
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    const comfortMap: Record<string, boolean> = {};
    comfortBoundaries.forEach((k) => (comfortMap[k] = true));
    await apiPatch('/profile', {
      readingTime: readingTime ? { preferredWindow: readingTime } : null,
      genre,
      comfortBoundaries: comfortMap,
      spiceLevel,
      snack,
      drink,
      readingLocation,
    });
    setSaved(true);
    setSaving(false);
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
            <MultiChipGroup options={TROPE_OPTIONS} value={genre} onChange={(v) => { Haptics.selectionAsync(); setGenre(v); markUnsaved(); }} />
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

          <PrefCard label="Favorite Snack">
            <ChipGroup options={SNACK_OPTIONS} selected={snack} onSelect={(v) => { Haptics.selectionAsync(); setSnack(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Favorite Drink">
            <ChipGroup options={DRINK_OPTIONS} selected={drink} onSelect={(v) => { Haptics.selectionAsync(); setDrink(v); markUnsaved(); }} />
          </PrefCard>

          <PrefCard label="Reading Location">
            <ChipGroup options={READING_LOCATION_OPTIONS} selected={readingLocation} onSelect={(v) => { Haptics.selectionAsync(); setReadingLocation(v); markUnsaved(); }} />
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
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(15,42,72,0.12)', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#6B9AB8', borderColor: '#6B9AB8' },
  chipDanger: { backgroundColor: '#B83255', borderColor: '#B83255' },
  chipText: { fontSize: 12, color: '#0F2A48' },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  saveButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveButtonSaved: { backgroundColor: '#0F2A48' },
  saveButtonUnsaved: { backgroundColor: '#B83255' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
});