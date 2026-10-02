import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SPICE_OPTIONS, TRIGGER_OPTIONS, getGuestPreferences, saveGuestPreferences } from '../lib/guestPreferences';
import type { ComfortBoundary, GuestPreferences } from '../lib/guestPreferences';

export default function GuestPreferencesPrompt() {
  const [visible, setVisible] = useState(false);
  const [spiceLevel, setSpiceLevel] = useState<GuestPreferences['spiceLevel']>(null);
  const [comfortBoundaries, setComfortBoundaries] = useState<ComfortBoundary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGuestPreferences()
      .then((preferences) => {
        if (!cancelled && preferences) {
          setSpiceLevel(preferences.spiceLevel);
          setComfortBoundaries(preferences.comfortBoundaries);
        }
      })
      .catch((loadError) => {
        console.warn('[guest-preferences] failed to load preferences for editing', loadError);
        if (!cancelled) setError('Could not load saved preferences. Please close and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [visible]);

  const toggleBoundary = (key: ComfortBoundary) => {
    setComfortBoundaries((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveGuestPreferences({ spiceLevel, comfortBoundaries });
      setVisible(false);
    } catch (saveError) {
      console.warn('[guest-preferences] failed to save preferences', saveError);
      setError('Could not save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.prompt} onPress={() => setVisible(true)}>
        <Text style={styles.promptText}>Set your spice &amp; boundaries</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Your reading comfort</Text>
              <TouchableOpacity onPress={() => setVisible(false)} accessibilityLabel="Close preferences">
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.note}>Optional — change these anytime. You can keep browsing without setting anything.</Text>
            {loading ? (
              <ActivityIndicator color="#B83255" style={styles.loader} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Spice level</Text>
                <View style={styles.chips}>
                  {SPICE_OPTIONS.map(({ key, label }) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.chip, spiceLevel === key && styles.chipSelected]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSpiceLevel(spiceLevel === key ? null : key);
                      }}
                    >
                      <Text style={[styles.chipText, spiceLevel === key && styles.chipTextSelected]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Comfort boundaries</Text>
                <View style={styles.chips}>
                  {TRIGGER_OPTIONS.map(({ key, label }) => {
                    const selected = comfortBoundaries.includes(key);
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.chip, selected && styles.boundarySelected]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          toggleBoundary(key);
                        }}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={() => setVisible(false)} disabled={saving}>
                <Text style={styles.cancelText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save} disabled={loading || saving}>
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save preferences'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  prompt: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  promptText: { color: '#B83255', fontSize: 13, fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '86%',
    backgroundColor: '#FFF9F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#0F2A48', fontSize: 20, fontWeight: '700' },
  close: { color: '#6A5969', fontSize: 20, padding: 4 },
  note: { color: '#6A5969', fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 14 },
  loader: { marginVertical: 32 },
  label: { color: '#0F2A48', fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  chip: { borderWidth: 1, borderColor: '#E8D9DC', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  chipSelected: { backgroundColor: '#B83255', borderColor: '#B83255' },
  boundarySelected: { backgroundColor: '#79505D', borderColor: '#79505D' },
  chipText: { color: '#4A3D48', fontSize: 13 },
  chipTextSelected: { color: '#fff' },
  error: { color: '#B83255', fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  cancelText: { color: '#6A5969', fontWeight: '600' },
  save: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#B83255' },
  saveText: { color: '#fff', fontWeight: '700' },
});
