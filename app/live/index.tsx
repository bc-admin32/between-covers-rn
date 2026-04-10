import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiPost } from '../../lib/api';
import { spacing, radius, colors } from '../../lib/theme';

type LiveEvent = {
  eventId: string;
  title: string;
  description: string | null;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
  hostName: string;
  coverUrl: string | null;
  scheduledAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  rsvpCount: number;
  bookTitle?: string | null;
};

function eventTypeLabel(type: LiveEvent['eventType']) {
  switch (type) {
    case 'AUTHOR_EVENT': return 'Author Event';
    case 'DANCE_PARTY': return 'Dance Party';
    case 'IRIS_LIVE': return 'Iris Live';
  }
}

function eventTypeEmoji(type: LiveEvent['eventType']) {
  switch (type) {
    case 'AUTHOR_EVENT': return '✍🏽';
    case 'DANCE_PARTY': return '🎧';
    case 'IRIS_LIVE': return '✦';
  }
}

function eventTypeColor(type: LiveEvent['eventType']) {
  switch (type) {
    case 'AUTHOR_EVENT': return { bg: '#EEF4FF', color: '#3B5BDB' };
    case 'DANCE_PARTY': return { bg: '#FFF0F6', color: '#B83255' };
    case 'IRIS_LIVE': return { bg: '#F5EEF4', color: '#9B6B9B' };
  }
}

function formatEventDate(scheduledAt: string) {
  return new Date(scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatEventTime(scheduledAt: string, endsAt: string) {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  return `${new Date(scheduledAt).toLocaleTimeString('en-US', opts)} – ${new Date(endsAt).toLocaleTimeString('en-US', opts)}`;
}

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerStar}>✦</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export default function LiveEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ events: LiveEvent[] }>('/live')
      .then((res) => setEvents(res.events))
      .catch(() => setError("Couldn't load live events right now."))
      .finally(() => setLoading(false));
  }, []);

  const activeEvent = events.find((e) => e.status === 'ACTIVE');
  const upcomingEvents = events.filter((e) => e.status === 'SCHEDULED');

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Checking the schedule…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Between Covers</Text>
          <Text style={styles.title}>Live</Text>
          <Text style={styles.subtitle}>Real-time moments with your people.</Text>
        </View>

        <Divider />

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ACTIVE EVENT */}
        {activeEvent && (
          <View style={styles.activeCard}>
            <View style={styles.activeCardBg1} />
            <View style={styles.activeCardBg2} />
            <View style={styles.activeCardContent}>
              <View style={styles.activeCardHeader}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>Live Now</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: eventTypeColor(activeEvent.eventType).bg }]}>
                  <Text style={[styles.typeBadgeText, { color: eventTypeColor(activeEvent.eventType).color }]}>
                    {eventTypeEmoji(activeEvent.eventType)} {eventTypeLabel(activeEvent.eventType)}
                  </Text>
                </View>
              </View>

              {activeEvent.coverUrl && (
                <Image source={{ uri: activeEvent.coverUrl }} style={styles.activeCover} resizeMode="cover" />
              )}

              <Text style={styles.activeTitle}>{activeEvent.title}</Text>
              {activeEvent.bookTitle && (
                <Text style={styles.activeBookTitle}>📖 {activeEvent.bookTitle}</Text>
              )}
              {activeEvent.description && (
                <Text style={styles.activeDescription}>{activeEvent.description}</Text>
              )}

              <View style={styles.activeFooter}>
                <Text style={styles.activeRsvp}>{activeEvent.rsvpCount} joined ✦</Text>
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={() => router.push(`/live/event?eventId=${activeEvent.eventId}` as any)}
                >
                  <Text style={styles.joinButtonText}>Join Now →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* UPCOMING EVENTS */}
        {upcomingEvents.length > 0 && (
          <>
            {activeEvent && <Divider />}
            <View style={styles.upcomingSection}>
              <Text style={styles.upcomingLabel}>Coming Up</Text>
              {upcomingEvents.map((event) => {
                const typeColor = eventTypeColor(event.eventType);
                return (
                  <View key={event.eventId} style={styles.upcomingCard}>
                    <View style={styles.upcomingCardHeader}>
                      <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
                        <Text style={[styles.typeBadgeText, { color: typeColor.color }]}>
                          {eventTypeEmoji(event.eventType)} {eventTypeLabel(event.eventType)}
                        </Text>
                      </View>
                      <Text style={styles.upcomingRsvp}>{event.rsvpCount} going</Text>
                    </View>

                    {event.coverUrl && (
                      <Image source={{ uri: event.coverUrl }} style={styles.upcomingCover} resizeMode="cover" />
                    )}

                    <Text style={styles.upcomingTitle}>{event.title}</Text>
                    {event.bookTitle && <Text style={styles.upcomingMeta}>📖 {event.bookTitle}</Text>}
                    <Text style={styles.upcomingMeta}>📅 {formatEventDate(event.scheduledAt)}</Text>
                    <Text style={styles.upcomingMeta}>🕐 {formatEventTime(event.scheduledAt, event.endsAt)}</Text>
                    {event.description && <Text style={styles.upcomingDescription}>{event.description}</Text>}

                    <TouchableOpacity
                      style={styles.rsvpButton}
                      onPress={() => router.push(`/live/event?eventId=${event.eventId}` as any)}
                    >
                      <Text style={styles.rsvpButtonText}>RSVP →</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* EMPTY STATE */}
        {!activeEvent && upcomingEvents.length === 0 && !error && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🌸</Text>
            <Text style={styles.emptyTitle}>Nothing scheduled yet</Text>
            <Text style={styles.emptyText}>Check back soon — Iris is always planning something good.</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDE9DF' },
  scrollContent: { paddingBottom: spacing.xl },
  loadingText: { fontSize: 14, color: '#B09A7E', marginTop: spacing.sm },
  header: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  headerLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#C4A882', fontWeight: '600', marginBottom: spacing.sm },
  title: { fontSize: 52, color: '#1A1A2E', fontStyle: 'italic', fontWeight: '800', lineHeight: 56 },
  subtitle: { fontSize: 17, color: '#6A5550', fontStyle: 'italic', marginTop: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 28, marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#C4A882', opacity: 0.5 },
  dividerStar: { marginHorizontal: spacing.sm, color: '#C4A882', fontSize: 12 },
  errorCard: { marginHorizontal: spacing.md, backgroundColor: '#FDFAF6', borderRadius: 20, padding: spacing.lg, marginBottom: spacing.sm },
  errorText: { fontSize: 13, color: '#6A5550', textAlign: 'center' },
  activeCard: { marginHorizontal: spacing.md, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1A1A2E', borderWidth: 0.5, borderColor: '#C4A882', marginBottom: spacing.sm },
  activeCardBg1: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(184,50,85,0.15)' },
  activeCardBg2: { position: 'absolute', bottom: -30, left: 10, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(196,168,130,0.07)' },
  activeCardContent: { padding: spacing.lg },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#B83255', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 1.5, textTransform: 'uppercase' },
  typeBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '600' },
  activeCover: { width: '100%', height: 144, borderRadius: 14, marginBottom: spacing.md },
  activeTitle: { fontSize: 26, color: '#FDFAF6', fontStyle: 'italic', fontWeight: '600', lineHeight: 32, marginBottom: spacing.xs },
  activeBookTitle: { fontSize: 12, color: '#C4A882', marginBottom: spacing.xs },
  activeDescription: { fontSize: 13, color: 'rgba(253,250,246,0.65)', lineHeight: 20, marginBottom: spacing.md },
  activeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeRsvp: { fontSize: 11, color: 'rgba(196,168,130,0.8)' },
  joinButton: { backgroundColor: '#B83255', borderRadius: 999, paddingHorizontal: 24, paddingVertical: 10 },
  joinButtonText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  upcomingSection: { paddingHorizontal: spacing.md, gap: spacing.sm },
  upcomingLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#B09A7E', fontWeight: '600', marginBottom: spacing.xs },
  upcomingCard: { backgroundColor: '#FDFAF6', borderRadius: 20, padding: spacing.lg, borderWidth: 1, borderColor: '#DDD5C4' },
  upcomingCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  upcomingRsvp: { fontSize: 11, color: '#B09A7E' },
  upcomingCover: { width: '100%', height: 112, borderRadius: 12, marginBottom: spacing.sm },
  upcomingTitle: { fontSize: 21, color: '#1A1A2E', fontStyle: 'italic', fontWeight: '600', lineHeight: 26, marginBottom: spacing.xs },
  upcomingMeta: { fontSize: 11, color: '#B09A7E', marginBottom: 2 },
  upcomingDescription: { fontSize: 13, color: '#6A5550', lineHeight: 20, marginTop: spacing.sm, marginBottom: spacing.md },
  rsvpButton: { borderRadius: 999, paddingVertical: 10, borderWidth: 1, borderColor: '#B83255', alignItems: 'center' },
  rsvpButtonText: { fontSize: 12, fontWeight: '600', color: '#B83255', letterSpacing: 0.5 },
  emptyCard: { marginHorizontal: spacing.md, backgroundColor: '#FDFAF6', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#DDD5C4' },
  emptyEmoji: { fontSize: 32, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 22, color: '#1A1A2E', fontStyle: 'italic', fontWeight: '600', marginBottom: spacing.sm },
  emptyText: { fontSize: 13, color: '#6A5550', lineHeight: 20, textAlign: 'center' },
});