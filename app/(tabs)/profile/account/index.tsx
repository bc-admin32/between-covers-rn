import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Switch, Linking, Platform,
} from 'react-native';
import * as Device from 'expo-device';
import { CaretDown, CaretLeft } from '../../../../components/icons';
import OptionSheet from '../../../../components/profile/OptionSheet';
import { PF } from '../../../../lib/profileTheme';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiGet, apiPatch, apiPost } from '../../../../lib/api';
import { signOut } from '../../../../lib/signout';
import { spacing, radius, colors } from '../../../../lib/theme';
import { ChurnFeedbackModal } from '../../../../components/ChurnFeedbackModal';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

type Country = 'US' | 'CA' | 'GB' | 'AU';
const COUNTRIES: readonly { value: Country; label: string }[] = [
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'AU', label: '🇦🇺 Australia' },
];

// My Escape: the Home background's reading atmosphere (saved as
// `readingLocation`; same keys as before, new labels). The Monthly theme /
// Choose my own switch waits for the backend, so the choices show directly.
const ESCAPES = [
  { value: 'SOFA', label: 'Cozy on the sofa' },
  { value: 'FIREPLACE', label: 'By the fireplace' },
  { value: 'OUTSIDE', label: 'Warm evenings outdoors' },
  { value: 'BEACH', label: 'By the ocean' },
  { value: 'NOOK', label: 'My cozy reading nook' },
  { value: 'CAFE', label: 'At a café' },
  { value: 'BED', label: 'Snuggled in bed' },
] as const;

// The store this copy of the app bills through, for the Delete note.
function subscriptionStore(): { name: string; url: string } {
  if (Platform.OS === 'ios') {
    return { name: 'App Store', url: 'https://apps.apple.com/account/subscriptions' };
  }
  if (Device.manufacturer === 'Amazon') {
    return { name: 'Amazon Appstore', url: 'https://www.amazon.com/gp/mas/your-account/myapps/yoursubscriptions' };
  }
  return { name: 'Google Play', url: 'https://play.google.com/store/account/subscriptions?package=com.betweencovers.app' };
}

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
  const [country, setCountry] = useState<Country>('US');
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [notifStatus, setNotifStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [escape, setEscape] = useState<string | null>(null);
  const [escapeStatus, setEscapeStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Home's My Escape button opens this screen with ?section=escape: scroll to the card.
  const params = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [contentY, setContentY] = useState<number | null>(null);
  const [escapeY, setEscapeY] = useState<number | null>(null);
  const [savingBiometric, setSavingBiometric] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [churnModalVisible, setChurnModalVisible] = useState(false);
  const [churnAction, setChurnAction] = useState<'deactivate' | 'delete'>('deactivate');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);

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
        setEscape(data.readingLocation ?? null);
      } catch {
        setLoadFailed(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadBiometric() {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const available = compatible && enrolled;
        // "Face ID" / "Touch ID" whenever the phone has that sensor (even
        // before it's set up, so the helper names it); "Biometric" otherwise.
        let label = 'Biometric';
        if (compatible) {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
          const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
          // Apple's names on iOS only; Android says "Fingerprint".
          if (Platform.OS === 'ios') {
            if (face) label = 'Face ID';
            else if (finger) label = 'Touch ID';
          } else if (finger) {
            label = 'Fingerprint';
          }
        }
        const stored = await SecureStore.getItemAsync('bc_biometric_enabled');
        if (mounted) {
          setBiometricAvailable(available);
          setBiometricLabel(label);
          setBiometricEnabled(stored === 'true');
          setBiometricReady(true);
        }
      } catch {
        if (mounted) setBiometricReady(true);
      }
    }
    loadBiometric();
    return () => { mounted = false; };
  }, []);

  const handleBiometricToggle = async (v: boolean) => {
    await Haptics.selectionAsync();
    setBiometricEnabled(v); // optimistic UI update
    setSavingBiometric(true);
    setBiometricStatus('saving');

    try {
      // Persist the preference to the user record FIRST.
      await apiPatch('/profile', { biometricPreferred: v });

      await SecureStore.setItemAsync('bc_biometric_enabled', v ? 'true' : 'false');

      setBiometricStatus('saved');
      setTimeout(() => setBiometricStatus('idle'), 2000);
    } catch {
      // Rollback the toggle visually; don't wipe tokens (user is still signed in)
      setBiometricEnabled(!v);
      setBiometricStatus('error');
      setTimeout(() => setBiometricStatus('idle'), 3000);
    } finally {
      setSavingBiometric(false);
    }
  };

  const saveChanges = async () => {
    if (loadFailed) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    setSaveStatus('saving');
    try {
      await apiPatch('/profile', {
        displayName,
        birthdate: birthdate.length === 5 ? birthdate : undefined,
        timeZone,
        timeZoneMode,
        country,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (params.section !== 'escape' || contentY == null || escapeY == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, contentY + escapeY - 12), animated: true });
  }, [params.section, contentY, escapeY]);

  // Saved right away, like Notifications.
  const chooseEscape = async (value: string) => {
    if (value === escape) return;
    await Haptics.selectionAsync();
    const previous = escape;
    setEscape(value);
    setEscapeStatus('saving');
    try {
      await apiPatch('/profile', { readingLocation: value });
      setEscapeStatus('saved');
      setTimeout(() => setEscapeStatus('idle'), 2000);
    } catch {
      setEscape(previous);
      setEscapeStatus('error');
      setTimeout(() => setEscapeStatus('idle'), 3000);
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

  const openDeactivateChurnModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setChurnAction('deactivate');
    setChurnModalVisible(true);
  };

  const confirmDeactivateAccount = () => {
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
              await apiPost('/account/deactivate', {});
            } catch {
              setDeactivating(false);
              Alert.alert("Couldn't deactivate your account", 'Nothing was changed. Please check your connection and try again.');
              return;
            }
            try {
              await signOut({ force: true });
              router.replace('/(auth)/login' as any);
            } finally {
              setDeactivating(false);
            }
          },
        },
      ]
    );
  };

  const openDeleteChurnModal = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setChurnAction('delete');
    setChurnModalVisible(true);
  };

  const confirmDeleteAccount = () => {
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
              await apiPost('/account/delete', {});
            } catch {
              setDeleting(false);
              Alert.alert("Couldn't delete your account", 'Nothing was changed. Please check your connection and try again.');
              return;
            }
            try {
              await signOut({ force: true });
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
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <CaretLeft size={24} color={PF.text} weight="bold" />
            </TouchableOpacity>
            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              Account & Settings
            </Text>
          </View>
          <View style={styles.titleDivider} />
        </View>
        <View style={styles.curve} />

        <View style={styles.content} onLayout={(e) => setContentY(e.nativeEvent.layout.y)}>

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
                placeholderTextColor={PF.placeholder}
                maxLength={5}
                style={styles.input}
                editable={!loadFailed}
                keyboardType="numeric"
              />
            </Field>
            <Field label="Country">
              {/* One compact row; the choices open in a small menu. */}
              <TouchableOpacity
                style={[styles.select, loadFailed && styles.selectDisabled]}
                onPress={() => setCountryMenuOpen(true)}
                disabled={loadFailed}
                accessibilityRole="button"
                accessibilityLabel={`Country: ${COUNTRIES.find((c) => c.value === country)?.label ?? ''}. Tap to change`}
              >
                <Text style={styles.selectText}>{COUNTRIES.find((c) => c.value === country)?.label}</Text>
                <CaretDown size={16} color={PF.icon} />
              </TouchableOpacity>
            </Field>
            <TouchableOpacity
              style={[styles.saveButton, (saving || loadFailed) && styles.saveButtonDisabled]}
              onPress={saveChanges}
              disabled={saving || loadFailed}
            >
              <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
            {saveStatus === 'saved' && <Text style={[styles.notifStatusText, { color: PF.success, textAlign: 'center' }]}>Saved ✓</Text>}
            {saveStatus === 'error' && <Text style={[styles.notifStatusText, { color: PF.accent, textAlign: 'center' }]}>Failed to save — try again</Text>}
          </SectionCard>

          {/* MY ESCAPE */}
          <View onLayout={(e) => setEscapeY(e.nativeEvent.layout.y)}>
            <SectionCard title="My Escape">
              <Text style={styles.escapeIntro}>Set the scene for your escape. Choose the monthly theme or a favorite reading atmosphere.</Text>
              <View style={styles.tzOptions}>
                {ESCAPES.map((e) => {
                  const active = escape === e.value;
                  return (
                    <TouchableOpacity
                      key={e.value}
                      style={[styles.tzOption, active && styles.tzOptionSelected]}
                      onPress={() => chooseEscape(e.value)}
                      disabled={loadFailed}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.tzOptionText, active && styles.tzOptionTextSelected]}>{e.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {escapeStatus === 'saving' && <Text style={styles.notifStatusText}>Saving…</Text>}
              {escapeStatus === 'saved' && <Text style={[styles.notifStatusText, { color: PF.success }]}>Saved ✓</Text>}
              {escapeStatus === 'error' && <Text style={[styles.notifStatusText, { color: PF.accent }]}>Failed to save</Text>}
            </SectionCard>
          </View>

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
                trackColor={{ false: PF.switchOff, true: PF.accent }}
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
                {notifStatus === 'saved' && <Text style={[styles.notifStatusText, { color: PF.success }]}>Saved ✓</Text>}
                {notifStatus === 'error' && <Text style={[styles.notifStatusText, { color: PF.accent }]}>Failed to save</Text>}
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                disabled={savingNotifications}
                trackColor={{ false: PF.switchOff, true: PF.accent }}
                thumbColor="#fff"
              />
            </View>
          </SectionCard>

          {/* SECURITY */}
          <SectionCard title="Security">
            <View style={styles.toggleRow}>
              <View style={styles.biometricLabelWrap}>
                <Text style={styles.toggleLabel}>Sign in with {biometricLabel}</Text>
                {!biometricAvailable && biometricReady && (
                  <Text style={styles.biometricHelper}>Set up {biometricLabel} in your device settings to use this feature.</Text>
                )}
                {biometricStatus === 'saving' && <Text style={styles.notifStatusText}>Saving…</Text>}
                {biometricStatus === 'saved' && <Text style={[styles.notifStatusText, { color: PF.success }]}>Saved ✓</Text>}
                {biometricStatus === 'error' && <Text style={[styles.notifStatusText, { color: PF.accent }]}>Failed to save</Text>}
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                disabled={!biometricAvailable || !biometricReady || savingBiometric}
                trackColor={{ false: PF.switchOff, true: PF.accent }}
                thumbColor="#fff"
              />
            </View>
          </SectionCard>

          {/* DANGER ZONE */}
          <SectionCard title="Danger Zone" danger>
            <TouchableOpacity
              style={styles.deactivateButton}
              onPress={openDeactivateChurnModal}
              disabled={deactivating || loadFailed}
            >
              <Text style={styles.deactivateButtonText}>
                {deactivating ? 'Deactivating…' : 'Deactivate Account'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={openDeleteChurnModal}
              disabled={deleting || loadFailed}
            >
              <Text style={styles.deleteButtonText}>
                {deleting ? 'Deleting…' : 'Permanently Delete Account'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.subscriptionNote}>
              Deleting your account doesn't cancel your {subscriptionStore().name} subscription.{' '}
              <Text
                style={styles.subscriptionLink}
                onPress={() => Linking.openURL(subscriptionStore().url).catch(() => {})}
                accessibilityRole="link"
              >
                Manage subscription
              </Text>
            </Text>
          </SectionCard>

        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <OptionSheet
        visible={countryMenuOpen}
        title="Country"
        options={COUNTRIES}
        selected={country}
        onSelect={setCountry}
        onClose={() => setCountryMenuOpen(false)}
      />

      <ChurnFeedbackModal
        visible={churnModalVisible}
        action={churnAction}
        onClose={() => setChurnModalVisible(false)}
        onContinue={() => {
          setChurnModalVisible(false);
          if (churnAction === 'deactivate') {
            confirmDeactivateAccount();
          } else {
            confirmDeleteAccount();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PF.page },
  scrollContent: { paddingBottom: spacing.xl },
  header: { backgroundColor: PF.header, padding: spacing.lg, paddingTop: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 8 },
  backButton: { padding: 2, flexShrink: 0 },
  // flex:1 bounds the title to the remaining row width so it can shrink-to-fit
  // instead of overflowing/clipping on Android. No fixed lineHeight: it isn't
  // multiplied by the device fontScale, so a fixed value clips glyphs vertically
  // when the system font is enlarged. adjustsFontSizeToFit keeps the rendered
  // size within bounds on both axes.
  title: { flex: 1, fontSize: 34, fontFamily: 'Cormorant_700Bold_Italic', color: PF.text },
  titleDivider: { width: 40, height: 1, backgroundColor: PF.accent, marginTop: 4 },
  curve: { height: 20, backgroundColor: PF.page, borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: { backgroundColor: PF.card, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.md, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: PF.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.lg },
  cardHeaderLine: { flex: 1, height: 1, backgroundColor: PF.border },
  cardHeaderTitle: { fontSize: 9, fontFamily: 'Lato_700Bold', letterSpacing: 1.6, textTransform: 'uppercase', color: PF.label },
  cardHeaderTitleDanger: { color: PF.accent },
  cardContent: { gap: spacing.md },
  field: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: PF.label },
  input: { height: 46, borderRadius: 10, borderWidth: 1, borderColor: PF.inputBorder, backgroundColor: '#FFFFFF', paddingHorizontal: 14, fontSize: 14, color: PF.text },
  inputDisabled: { backgroundColor: PF.readOnly, color: PF.label },
  select: { height: 46, borderRadius: 10, borderWidth: 1, borderColor: PF.inputBorder, backgroundColor: '#FFFFFF', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectDisabled: { backgroundColor: PF.readOnly },
  selectText: { fontSize: 14, color: PF.text },
  saveButton: { height: 48, borderRadius: 12, backgroundColor: PF.text, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { backgroundColor: PF.pill },
  saveButtonText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 13, color: PF.text },
  notifStatusText: { fontSize: 11, color: PF.label, marginTop: 2 },
  tzOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tzOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: PF.inputBorder, backgroundColor: '#FFFFFF' },
  tzOptionSelected: { backgroundColor: PF.accent, borderColor: PF.accent },
  tzOptionDisabled: { backgroundColor: PF.readOnly },
  tzOptionText: { fontSize: 12, color: PF.text },
  tzOptionTextSelected: { color: '#fff', fontWeight: '600' },
  tzOptionTextDisabled: { color: PF.label },
  biometricLabelWrap: { flex: 1, marginRight: spacing.md },
  biometricHelper: { fontSize: 11, color: PF.secondary, marginTop: 4, lineHeight: 15 },
  deactivateButton: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: PF.inputBorder, alignItems: 'center', justifyContent: 'center' },
  deactivateButtonText: { fontSize: 13, color: PF.secondary },
  deleteButton: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: PF.accent, alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { fontSize: 13, fontWeight: '700', color: PF.accent },
  escapeIntro: { fontSize: 13, lineHeight: 19, color: PF.secondary },
  subscriptionNote: { fontSize: 12, lineHeight: 17, color: PF.secondary, textAlign: 'center' },
  subscriptionLink: { color: PF.text, fontWeight: '700', textDecorationLine: 'underline' },
});
