import { useState } from 'react';
import { apiPost } from '../../lib/api';
import { normalizeRoute } from '../../lib/routes';
import { track } from '../../lib/analytics';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, colors } from '../../lib/theme';


const POLICIES = [
  { label: 'Terms of Service', doc: 'terms-of-use', icon: '📄' },
  { label: 'Privacy Policy', doc: 'privacy-policy', icon: '🔒' },
  { label: 'Community Guidelines', doc: 'community-guidelines', icon: '👥' },
  { label: 'Reporting & Enforcement', doc: 'reporting-enforcement', icon: '🛡️' },
];

export default function AcceptanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();

  // mode: "onboarding" (default) | "reaccept" — set by authResolve when policy version changes
  const isReaccept = params.mode === 'reaccept';

  const [openedDocs, setOpenedDocs] = useState<Set<string>>(new Set());
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allDocsOpened = POLICIES.every((p) => openedDocs.has(p.doc));
  const canAccept = allDocsOpened;
  const canContinue = allDocsOpened && accepted;

  const handleContinue = async () => {
    if (!canContinue || submitting) return;
    setSubmitting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (isReaccept) {
        const res = await apiPost('/onboarding/submit', {
          step: 'L2Acc',
          mode: 'reaccept',
          appVersion: Constants.expoConfig?.version ?? 'unknown',
        });
        if (res?.nextRoute?.startsWith('/')) {
          router.replace(normalizeRoute(res.nextRoute) as any);
        } else {
          router.replace('/home' as any);
        }
        return;
      }

      const res = await apiPost('/onboarding/submit', {
        step: 'L2Acc',
        appVersion: Constants.expoConfig?.version ?? 'unknown',
      });
      // Acceptance is the final onboarding step. Profile data (drinks, genres,
      // tropes) was submitted in earlier steps and lives server-side; the
      // backend can join it to this event by userId.
      track('onboarding_completed', {});
      if (res?.nextRoute) {
        router.replace(normalizeRoute(res.nextRoute) as any);
        return;
      }
    } catch (err) {
      console.error('submit failed:', err);
    }
    setSubmitting(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          {isReaccept ? 'Our Policies Have Updated' : 'Before You Continue…'}
        </Text>
        <Text style={styles.subtitle}>
          {isReaccept
            ? 'Please review and re-accept our updated policies to continue.'
            : 'Please review and accept our policies to proceed.'}
        </Text>

        <View style={styles.card}>
          {POLICIES.map((p, i) => {
            const opened = openedDocs.has(p.doc);
            return (
              <View key={p.doc}>
                <TouchableOpacity
                  style={styles.policyRow}
                  onPress={() => {
                    setOpenedDocs((prev) => new Set([...prev, p.doc]));
                    router.push(`/legal/document?doc=${p.doc}` as any);
                  }}
                >
                  <View style={styles.policyLeft}>
                    <Text style={styles.policyIcon}>{p.icon}</Text>
                    <Text style={[styles.policyLabel, opened && styles.policyLabelOpened]}>{p.label}</Text>
                  </View>
                  {opened
                    ? <Text style={styles.openedCheck}>✓</Text>
                    : <Text style={styles.chevron}>›</Text>
                  }
                </TouchableOpacity>
                {i < POLICIES.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })}

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => {
              if (!canAccept) return;
              Haptics.selectionAsync();
              setAccepted(!accepted);
            }}
            activeOpacity={canAccept ? 0.7 : 1}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked, !canAccept && styles.checkboxDisabled]}>
              {accepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkboxLabel, !canAccept && styles.checkboxLabelDisabled]}>
              I have read and accept all policies
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, (!canContinue || submitting) && styles.continueDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || submitting}
        >
          <Text style={styles.continueText}>
            {submitting ? 'Continuing…' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#A9C0D4',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  title: {
    fontSize: 34,
    fontFamily: 'DancingScript_700Bold',
    color: '#0F2A48',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: '#0F2A48',
    textAlign: 'center',
    marginBottom: spacing.xl,
    opacity: 0.8,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  policyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  policyIcon: { fontSize: 18 },
  policyLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0F2A48',
  },
  chevron: {
    fontSize: 20,
    color: '#0F2A48',
    opacity: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0E6E6',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#B83255',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#B83255',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#0F2A48',
  },
  checkboxDisabled: {
    borderColor: '#D4C4C4',
    backgroundColor: '#F8F5F5',
  },
  checkboxLabelDisabled: {
    color: '#B8A8A8',
  },
  policyLabelOpened: {
    color: '#7A9AB0',
  },
  openedCheck: {
    fontSize: 15,
    color: '#B83255',
    fontWeight: '700',
  },
  continueButton: {
    width: '100%',
    height: 56,
    borderRadius: radius.full,
    backgroundColor: '#0F2A48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: {
    backgroundColor: '#D4C4C4',
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
