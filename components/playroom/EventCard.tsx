import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { spacing } from '../../lib/theme';
import { parseLocalDate } from '../../lib/dateUtils';
import { EVENT_STAGE_LABELS, eventStage, type CozyEvent } from '../../lib/cozyEvents';
import { CHAMPAGNE, ROSE_GOLD, CARD_FILL, CARD_BORDER, FONT_CAPS, FONT_SERIF } from './playroomStyle';

function formatEventDate(iso?: string): string {
  if (!iso) return '';
  const d = parseLocalDate(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

async function openLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    try { await WebBrowser.openBrowserAsync(url); } catch {}
  }
}

// One Cozy event, labelled by where it is in its life: "You're Invited" until
// the end of its day, then "Recording coming soon", then "Watch the
// Recording" once the recording link is filled in.
// `canOpenEvent`: an upcoming event opens the Cozy Events screen on this
// event (join, questions, the live player). Off for last month's events.
// `variant="playroom"`: the PlayRoom home page's wine-and-rose-gold look. The
// Self Care page uses the default.
export default function EventCard({ event, canOpenEvent = true, variant = 'default' }: {
  event: CozyEvent;
  canOpenEvent?: boolean;
  variant?: 'default' | 'playroom';
}) {
  const router = useRouter();
  const pr = variant === 'playroom';
  const stage = eventStage(event);
  const date = formatEventDate(event.eventDate);

  const onPress =
    stage === 'recording' ? () => openLink(event.recordingLink!.trim())
    : stage === 'invited' && canOpenEvent
      ? () => router.push(`/(tabs)/cozy/events${event.eventId ? `?eventId=${encodeURIComponent(event.eventId)}` : ''}` as any)
    : undefined;

  const cta =
    stage === 'recording' ? 'Watch the Recording'
    : stage === 'invited' && canOpenEvent ? 'See the Details'
    : null;

  return (
    <TouchableOpacity
      style={[styles.card, pr && playroom.card]}
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {!!event.imageUrl && <Image source={{ uri: event.imageUrl }} style={styles.image} contentFit="cover" />}
      <View style={styles.body}>
        <Text style={[styles.stage, pr && playroom.stage]}>{EVENT_STAGE_LABELS[stage]}</Text>
        <Text style={[styles.title, pr && playroom.title]} numberOfLines={2}>{event.title}</Text>
        {!!date && <Text style={[styles.date, pr && playroom.date]}>{date}</Text>}
        {!!event.description && (
          <Text style={[styles.description, pr && playroom.description]} numberOfLines={3}>{event.description}</Text>
        )}
        {cta && (
          <View style={[styles.cta, pr && playroom.cta]}>
            <Text style={[styles.ctaText, pr && playroom.ctaText]}>{cta}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#2A1420', borderWidth: 1, borderColor: 'rgba(232,180,195,0.35)',
  },
  image: { width: '100%', aspectRatio: 16 / 9 },
  body: { padding: spacing.lg },
  stage: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#E8B4C3', fontFamily: 'Nunito_700Bold', marginBottom: 6 },
  title: { fontSize: 24, lineHeight: 28, color: '#FDF0F4', fontFamily: 'Cormorant_700Bold_Italic' },
  date: { fontSize: 13, color: '#E8B4C3', fontFamily: 'Nunito_700Bold', marginTop: 6 },
  description: { fontSize: 14, lineHeight: 20, color: 'rgba(253,240,244,0.85)', fontFamily: 'Nunito_400Regular', marginTop: spacing.sm },
  cta: { alignSelf: 'flex-start', marginTop: spacing.md, borderRadius: 999, backgroundColor: '#B83255', paddingHorizontal: 18, paddingVertical: 9 },
  ctaText: { fontSize: 13, color: '#fff', fontFamily: 'Nunito_700Bold' },
});

const playroom = StyleSheet.create({
  card: { backgroundColor: CARD_FILL, borderColor: CARD_BORDER, borderRadius: 18 },
  stage: { fontSize: 11, letterSpacing: 3, color: ROSE_GOLD, fontFamily: FONT_CAPS },
  title: { fontSize: 25, lineHeight: 29, color: CHAMPAGNE, fontFamily: FONT_SERIF },
  date: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: ROSE_GOLD, fontFamily: FONT_CAPS },
  description: { color: 'rgba(247,231,206,0.85)' },
  cta: { backgroundColor: 'transparent', borderWidth: 1, borderColor: ROSE_GOLD },
  ctaText: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: CHAMPAGNE, fontFamily: FONT_CAPS },
});
