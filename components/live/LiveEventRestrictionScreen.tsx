import { View, Text, TouchableOpacity, StyleSheet, Linking, Image } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../lib/theme';
import { formatFullDate } from '../../lib/dateUtils';

// Backend-stable reason codes carried on 403 responses from /live/{eventId}/chat-token
// and /live/{eventId}/rooms/{roomId}/join. TERMS_ACCEPTANCE_REQUIRED is handled by
// the caller redirecting to LiveEventTermsModal instead of rendering this screen.
export type LiveEventRestrictionReason =
  | 'LIVE_EVENTS_BANNED'
  | 'LIVE_EVENTS_SUSPENDED'
  | 'LOUNGE_SUSPENDED';

const BC_LOGO = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/backgrounds/logo.png';
const SUPPORT_EMAIL = 'support@betweencovers.app';

type Props = {
  reason: LiveEventRestrictionReason;
  // For SUSPENDED / LOUNGE_SUSPENDED — when access returns. Backend sends ISO string.
  liftsAt?: string | null;
  onBack: () => void;
};

export default function LiveEventRestrictionScreen({ reason, liftsAt, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const liftsAtMs = liftsAt ? new Date(liftsAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  // Only the SUSPENDED screen renders a countdown — skip the timer otherwise
  // so we don't churn state in BANNED / LOUNGE_SUSPENDED.
  useEffect(() => {
    if (reason !== 'LIVE_EVENTS_SUSPENDED' || !liftsAtMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reason, liftsAtMs]);

  const headline = headlineFor(reason);
  const body = bodyFor(reason, liftsAt);
  const countdown = reason === 'LIVE_EVENTS_SUSPENDED' && liftsAtMs
    ? formatCountdown(Math.max(0, liftsAtMs - now))
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Image source={{ uri: BC_LOGO }} style={styles.logo} resizeMode="contain" />
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.body}>{body}</Text>

      {countdown && (
        <View style={styles.countdownBox}>
          <Text style={styles.countdownLabel}>Access returns in</Text>
          <Text style={styles.countdownValue}>{countdown}</Text>
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.support}>
        Questions? Email{' '}
        <Text
          style={styles.supportLink}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          suppressHighlighting
        >
          {SUPPORT_EMAIL}
        </Text>
      </Text>

      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

function headlineFor(reason: LiveEventRestrictionReason): string {
  switch (reason) {
    case 'LIVE_EVENTS_BANNED':
      return 'Your access to live events has been permanently restricted.';
    case 'LIVE_EVENTS_SUSPENDED':
      return 'Your live event access is paused.';
    case 'LOUNGE_SUSPENDED':
      return "You don't have live event access while your Lounge access is restricted.";
  }
}

function bodyFor(reason: LiveEventRestrictionReason, liftsAt: string | null | undefined): string {
  const dateStr = liftsAt ? formatFullDate(liftsAt) : '';
  switch (reason) {
    case 'LIVE_EVENTS_BANNED':
      return 'You can still use the rest of Between Covers — your library, Iris, and personalized recommendations.';
    case 'LIVE_EVENTS_SUSPENDED':
      return dateStr
        ? `You'll be able to join live events again on ${dateStr}.`
        : "We'll let you know when access returns.";
    case 'LOUNGE_SUSPENDED':
      return dateStr
        ? `Your Lounge suspension lifts on ${dateStr}, and live event access returns at the same time.`
        : 'Live event access returns when your Lounge suspension lifts.';
  }
}

// Renders ms as DD:HH:MM:SS when liftsAt is more than a day out, HH:MM:SS otherwise.
function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2A48',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  logo: { width: 140, height: 67, marginBottom: spacing.lg, opacity: 0.85 },
  headline: {
    fontSize: 22,
    fontFamily: 'Cormorant_700Bold_Italic',
    color: '#FDFAF6',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 14,
    color: 'rgba(253,250,246,0.75)',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  countdownBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,163,188,0.25)',
    marginBottom: spacing.lg,
  },
  countdownLabel: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#F5A3BC',
    fontWeight: '700',
    marginBottom: 6,
  },
  countdownValue: {
    fontSize: 28,
    color: '#FDFAF6',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: spacing.lg,
  },
  support: { fontSize: 13, color: 'rgba(253,250,246,0.6)', textAlign: 'center' },
  supportLink: { color: '#F5A3BC', textDecorationLine: 'underline' },
  backButton: {
    marginTop: spacing.xl,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(253,250,246,0.3)',
  },
  backButtonText: { fontSize: 13, color: 'rgba(253,250,246,0.85)', fontWeight: '600' },
});
