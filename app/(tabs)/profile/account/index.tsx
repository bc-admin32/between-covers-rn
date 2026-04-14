import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { apiGet, apiPatch, apiPost } from '../../../../lib/api';
import { spacing, radius, colors } from '../../../../lib/theme';

function SectionCard({ title, children, danger }: {
  title: string; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLine} />
        <Text style={[styles.cardHeaderTitle, danger && styles.cardHeaderTitleDanger]}>{title}</Text>
        <View style={styles.cardHeaderLine} />
      </View>
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function AccountSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [email, setEmail] = useState('');
  const [timeZone, setTimeZone] = useState('America/Chicago');
  const [timeZoneMode, setTimeZoneMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [country, setCountry] = useState<'US' | 'CA'>('US');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiGet('/profile');
        setDisplayName(data.displayName ?? '');
        setEmail(data.email ?? '');
        setBirthdate(data.birthdate ?? '');
        setTimeZone(data.timeZone ?? 'America/Chicago');
        setTimeZoneMode(data.timeZoneMode ?? 'AUTO');
        setCountry(data.country ?? 'US');
        setNotificationsEnabled(data.notificationsEnabled ?? false);
      } catch {
        setLoadFailed(true);
      }
    };
    load();
  }, []);

  const saveChanges = async () => {
    if (loadFailed) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    try {
      await apiPatch('/profile', {
        displayName,
        birthdate: birthdate.length === 5 ? birthdate : undefined,
        timeZone,
        timeZoneMode,
        country,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationToggle = async (v: boolean) => {
    await Haptics.selectionAsync();
    setNotificationsEnabled(v);
    setSavingNotifications(true);
    setNotifStatus('saving');
    try {
      await apiPatch('/profile', { notificationsEnabled: v });
      setNotifStatus('saved');
      setTimeout(() => setNotifStatus('idle'), 2000);
    } catch {
      setNotificationsEnabled(!v);
      setNotifStatus('error');
      setTimeout(() => setNotifStatus('idle'), 3000);
    } finally {
      setSavingNotifications(false);
    }
  };

  const deactivateAccount = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Deactivate Account',
      'Are you sure you want to deactivate your account? You can reactivate it later by signing back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate', style: 'destructive',
          onPress: async () => {
            setDeactivating(true);
            try {
              await apiPost('/account/deactivate');
              await SecureStore.deleteItemAsync('bc_id_token');
              await SecureStore.deleteItemAsync('bc_access_token');
              router.replace('/(auth)/login' as any);
            } finally {
              setDeactivating(false);
            }
          },
        },
      ]
    );
  };

  const deleteAccount = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Account',
      'Are you absolutely sure you want to permanently delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiPost('/account/delete');
              await SecureStore.deleteItemAsync('bc_id_token');
              await SecureStore.deleteItemAsync('bc_access_token');
              router.replace('/(auth)/login' as any);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Account & Settings</Text>
          <View style={styles.titleDivider} />
        </View>
        <View style={styles.curve} />

        <View style={styles.content}>

          {/* ACCOUNT INFORMATION */}
          <SectionCard title="Account Information">
            <Field label="Display Name">
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                style={styles.input}
                editable={!loadFailed}
              />
            </Field>
            <Field label="Email Address">
              <TextInput value={email} style={[styles.input, styles.inputDisabled]} editable={false} />
            </Field>
            <Field label="Birthday (MM/DD)">
              <TextInput
                value={birthdate}
                onChangeText={(v) => {
                  let val = v.replace(/[^\d]/g, '');
                  if (val.length >= 3) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                  setBirthdate(val.slice(0, 5));
                }}
                placeholder="MM/DD"
                placeholderTextColor="#A9C0D4"
                maxLength={5}
                style={styles.input}
                editable={!loadFailed}
                keyboardType="numeric"
              />
            </Field>
            <Field label="Country">
              <View style={styles.countryRow}>
                {(['US', 'CA'] as const).map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.countryOption, country === c && styles.countryOptionSelected]}
                    onPress={() => setCountry(c)}
                    disabled={loadFailed}
                  >
                    <Text style={[styles.countryOptionText, country === c && styles.countryOptionTextSelected]}>
                      {c === 'US' ? '🇺🇸 United States' : '🇨🇦 Canada'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>
            <TouchableOpacity
              style={[styles.saveButton, (saving || loadFailed) && styles.saveButtonDisabled]}
              onPress={saveChanges}
              disabled={saving || loadFailed}
            >
              <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </SectionCard>

          {/* TIME ZONE */}
          <SectionCard title="Time Zone">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Automatic Time Zone</Text>
              <Switch
                value={timeZoneMode === 'AUTO'}
                onValueChange={(v) => {
                  setTimeZoneMode(v ? 'AUTO' : 'MANUAL');
                  if (v) {
                    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    setTimeZone(detected);
                  }
                }}
                trackColor={{ false: 'rgba(15,42,72,0.12)', true: '#6B9AB8' }}
                thumbColor="#fff"
              />
            </View>
            <Field label="Select Time Zone">
              <View style={styles.tzOptions}>
                {[
                  { value: 'America/New_York', label: 'Eastern (US)' },
                  { value: 'America/Chicago', label: 'Central (US)' },
                  { value: 'America/Denver', label: 'Mountain (US)' },
                  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
                  { value: 'Europe/London', label: 'UK' },
                  { value: 'Australia/Sydney', label: 'Australia' },
                ].map((tz) => (
                  <TouchableOpacity
                    key={tz.value}
                    style={[styles.tzOption, timeZone === tz.value && styles.tzOptionSelected, timeZoneMode === 'AUTO' && styles.tzOptionDisabled]}
                    onPress={() => timeZoneMode === 'MANUAL' && setTimeZone(tz.value)}
                    disabled={timeZoneMode === 'AUTO'}
                  >
                    <Text style={[styles.tzOptionText, timeZone === tz.value && styles.tzOptionTextSelected, timeZoneMode === 'AUTO' && styles.tzOptionTextDisabled]}>
                      {tz.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>
          </SectionCard>

          {/* NOTIFICATIONS */}
          <SectionCard title="Notifications">
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Receive messages from Iris</Text>
                {notifStatus === 'saving' && <Text style={styles.notifStatusText}>Saving…</Text>}
                {notifStatus === 'saved' && <Text style={[styles.notifStatusText, { color: '#2E9E68' }]}>Saved ✓</Text>}
                {notifStatus === 'error' && <Text style={[styles.notifStatusText, { color: '#B83255' }]}>Failed to save</Text>}
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                disabled={savingNotifications}
                trackColor={{ false: 'rgba(15,42,72,0.12)', true: '#6B9AB8' }}
                thumbColor="#fff"
              />
            </View>
          </SectionCard>

          {/* DANGER ZONE */}
          <SectionCard title="Danger Zone" danger>
            <TouchableOpacity
              style={styles.deactivateButton}
              onPress={deactivateAccount}
              disabled={deactivating || loadFailed}
            >
              <Text style={styles.deactivateButtonText}>
                {deactivating ? 'Deactivating…' : 'Deactivate Account'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={deleteAccount}
              disabled={deleting || loadFailed}
            >
              <Text style={styles.deleteButtonText}>
                {deleting ? 'Deleting…' : 'Permanently Delete Account'}
              </Text>
            </TouchableOpacity>
          </SectionCard>

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
  backButton: { marginBottom: spacing.lg },
  backArrow: { fontSize: 20, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  title: { fontSize: 34, fontStyle: 'italic', color: '#F0EDE4', lineHeight: 38 },
  titleDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 10 },
  curve: { height: 20, backgroundColor: '#F1F4F8', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: 'rgba(15,42,72,0.06)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.lg },
  cardHeaderLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.08)' },
  cardHeaderTitle: { fontSize: 9, fontFamily: 'Lato_700Bold', letterSpacing: 1.6, textTransform: 'uppercase', color: '#A9C0D4' },
  cardHeaderTitleDanger: { color: '#B83255' },
  cardContent: { gap: spacing.md },
  field: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#A9C0D4' },
  input: { height: 46, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(15,42,72,0.12)', backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 14, color: '#0F2A48' },
  inputDisabled: { backgroundColor: '#F1F4F8', color: '#A9C0D4' },
  countryRow: { flexDirection: 'row', gap: spacing.sm },
  countryOption: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(15,42,72,0.12)', alignItems: 'center', backgroundColor: '#fff' },
  countryOptionSelected: { backgroundColor: '#6B9AB8', borderColor: '#6B9AB8' },
  countryOptionText: { fontSize: 13, color: '#0F2A48' },
  countryOptionTextSelected: { color: '#fff', fontWeight: '600' },
  saveButton: { height: 48, borderRadius: 12, backgroundColor: '#0F2A48', alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { backgroundColor: '#A9C0D4' },
  saveButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 13, color: '#0F2A48' },
  notifStatusText: { fontSize: 11, color: '#A9C0D4', marginTop: 2 },
  tzOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tzOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(15,42,72,0.12)', backgroundColor: '#fff' },
  tzOptionSelected: { backgroundColor: '#6B9AB8', borderColor: '#6B9AB8' },
  tzOptionDisabled: { backgroundColor: '#F1F4F8' },
  tzOptionText: { fontSize: 12, color: '#0F2A48' },
  tzOptionTextSelected: { color: '#fff', fontWeight: '600' },
  tzOptionTextDisabled: { color: '#A9C0D4' },
  deactivateButton: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(184,50,85,0.3)', alignItems: 'center', justifyContent: 'center' },
  deactivateButtonText: { fontSize: 13, color: '#8A5A58' },
  deleteButton: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#B83255', alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { fontSize: 13, fontWeight: '700', color: '#B83255' },
});