import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { apiGet } from '../../lib/api';
import { spacing, colors } from '../../lib/theme';
import type { LiveRoom, LiveEvent } from '../../lib/types';
import RoomScreen from './RoomScreen';

// LobbyModal — speakeasy entry for multi-room IRIS_LIVE events.
// Slides up over home; backdrop tap is a no-op (only "Call it a Night"
// closes). Renders RoomScreen on top when a tile is tapped — two-layer
// modal stack, closing the inner reveals the outer.

const PRE_EVENT_TAGLINES = {
  // 4-5 minutes before
  early: [
    'You showed up… and I love that for us. Go find your room.',
    'Go ahead… look around. Some of these rooms are about to get messy.',
  ],
  // 2-3 minutes before
  mid: [
    'Pour yourself something cute and find your people.',
    'Some of these rooms are about to get spicy… choose carefully.',
    "Tonight's lineup is a little unhinged. You've been warned.",
  ],
  // last minute
  final: [
    'Doors open in 1 min…',
    "I already know which room I'm choosing 👀",
  ],
};

const ACTIVE_TAGLINES = [
  'Pick your room. Iris is already in there.',
  "Each room's got its own vibe — what's yours?",
];

function getCurrentTaglineSet(scheduledAtMs: number, status: string): string[] {
  if (status === 'ACTIVE') return ACTIVE_TAGLINES;
  const minsLeft = (scheduledAtMs - Date.now()) / 60_000;
  if (minsLeft <= 1) return PRE_EVENT_TAGLINES.final;
  if (minsLeft <= 3) return PRE_EVENT_TAGLINES.mid;
  return PRE_EVENT_TAGLINES.early;
}

function formatCountdown(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type LobbyModalProps = {
  eventId: string;
  visible: boolean;
  onClose: () => void;
};

export default function LobbyModal({ eventId, visible, onClose }: LobbyModalProps) {
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<LiveRoom | null>(null);
  const [showKickoutBanner, setShowKickoutBanner] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);

  // Poll event state
  useEffect(() => {
    if (!visible || !eventId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await apiGet<{ event: LiveEvent }>(`/live/${eventId}`);
        if (cancelled) return;

        if (res.event.status === 'ENDED') {
          setShowKickoutBanner(true);
          setTimeout(() => {
            if (!cancelled) {
              setActiveRoom(null);
              onClose();
            }
          }, 5000);
          return;
        }

        setEvent(res.event);
        setLoading(false);
      } catch {
        if (!cancelled && !event) {
          setError("Couldn't load the lobby. Try again?");
          setLoading(false);
        }
      }
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [visible, eventId]);

  // Tagline rotation
  useEffect(() => {
    if (!visible || !event) return;
    const scheduledAtMs = new Date(event.scheduledAt).getTime();
    const taglines = getCurrentTaglineSet(scheduledAtMs, event.status);
    const interval = setInterval(() => {
      setTaglineIndex((i) => (i + 1) % taglines.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [visible, event?.status, event?.scheduledAt]);

  // Reset tagline index when status changes (start fresh on ACTIVE)
  useEffect(() => {
    setTaglineIndex(0);
  }, [event?.status]);

  // Countdown timer (pre-event only)
  useEffect(() => {
    if (!event || event.status !== 'SCHEDULED') {
      setCountdownSec(null);
      return;
    }
    const scheduledAtMs = new Date(event.scheduledAt).getTime();
    function tick() {
      const ms = scheduledAtMs - Date.now();
      setCountdownSec(Math.max(0, Math.floor(ms / 1000)));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event?.status, event?.scheduledAt]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        // Speakeasy: backdrop tap / Android back is no-op. Only "Call it a Night" closes.
      }}
    >
      <View style={styles.backdrop} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        {showKickoutBanner && (
          <View style={styles.kickoutBanner}>
            <Text style={styles.kickoutText}>Iris has signed off ✦ Thanks for coming!</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Opening the door…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={onClose} style={styles.callItNightButton}>
              <Text style={styles.callItNightLine1}>Call it a Night</Text>
              <Text style={styles.callItNightLine2}>(Tab Please)</Text>
            </TouchableOpacity>
          </View>
        ) : event ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.headerLabel}>The Game Room</Text>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.headerMeta}>
                Hosted by {event.hostName ?? 'Iris'} ✦
              </Text>
            </View>

            <View style={styles.taglineStrip}>
              <Text style={styles.taglineText}>
                ✦ {getCurrentTaglineSet(new Date(event.scheduledAt).getTime(), event.status)[taglineIndex]}
              </Text>
            </View>

            {event.status === 'SCHEDULED' && countdownSec !== null && countdownSec > 0 && (
              <Text style={styles.countdown}>
                Doors open in {formatCountdown(countdownSec)}
              </Text>
            )}

            <View style={styles.tilesContainer}>
              {event.rooms?.map((room) => (
                <RoomTile
                  key={room.roomId}
                  room={room}
                  onEnter={() => setActiveRoom(room)}
                />
              ))}
            </View>

            <TouchableOpacity onPress={onClose} style={styles.callItNightButton}>
              <Text style={styles.callItNightLine1}>Call it a Night</Text>
              <Text style={styles.callItNightLine2}>(Tab Please)</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        ) : null}
      </View>

      {activeRoom && event && (
        <RoomScreen
          eventId={eventId}
          roomId={activeRoom.roomId}
          room={activeRoom}
          eventTitle={event.title}
          onBackToLobby={() => setActiveRoom(null)}
        />
      )}
    </Modal>
  );
}

function RoomTile({ room, onEnter }: { room: LiveRoom; onEnter: () => void }) {
  return (
    <TouchableOpacity onPress={onEnter} style={tileStyles.tile} activeOpacity={0.85}>
      <View style={tileStyles.tileHeader}>
        <Text style={tileStyles.tileLabel}>
          {room.gameBanner?.label ?? `✦ ${room.name}`}
        </Text>
      </View>

      {room.description && (
        <Text style={tileStyles.tileDescription}>{room.description}</Text>
      )}

      {room.gameBanner?.instruction && (
        <Text style={tileStyles.tileInstruction}>{room.gameBanner.instruction}</Text>
      )}

      <View style={tileStyles.tileFooter}>
        <Text style={tileStyles.tileAttendees}>👥 {room.attendeeCount} here</Text>
        <View style={tileStyles.tileButton}>
          <Text style={tileStyles.tileButtonText}>Step Inside →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,42,72,0.4)',
  },
  sheet: {
    position: 'absolute',
    top: '5%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FDFAF6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0d8cc',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 80,
  },
  loadingText: { fontSize: 14, color: '#9c8f7e', fontWeight: '300' },
  errorContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 60,
    alignItems: 'center',
    gap: spacing.lg,
  },
  errorText: { fontSize: 14, color: '#6A5969', textAlign: 'center' },
  kickoutBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(184,50,85,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(184,50,85,0.25)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  kickoutText: { fontSize: 13, color: '#B83255', fontStyle: 'italic' },
  header: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: 4,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#A9C0D4',
  },
  eventTitle: {
    fontSize: 32,
    fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48',
    textAlign: 'center',
    lineHeight: 38,
    marginTop: 4,
  },
  headerMeta: { fontSize: 12, color: '#6A5969', fontWeight: '300', marginTop: 4 },
  taglineStrip: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: '#e0d8cc',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: spacing.lg,
  },
  taglineText: {
    fontSize: 14,
    color: '#3d352e',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  countdown: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B83255',
    textAlign: 'center',
    marginBottom: spacing.lg,
    letterSpacing: 0.4,
  },
  tilesContainer: { gap: spacing.md, marginBottom: spacing.xl },
  callItNightButton: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  callItNightLine1: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B83255',
    letterSpacing: 0.5,
  },
  callItNightLine2: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#9c8f7e',
    marginTop: 2,
  },
});

const tileStyles = StyleSheet.create({
  tile: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0d8cc',
    borderRadius: 18,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#0F2A48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tileHeader: { flexDirection: 'row', alignItems: 'center' },
  tileLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2A48',
    flex: 1,
  },
  tileDescription: {
    fontSize: 13,
    color: '#6A5969',
    fontWeight: '300',
    lineHeight: 19,
  },
  tileInstruction: {
    fontSize: 12,
    color: '#9c8f7e',
    fontStyle: 'italic',
    lineHeight: 17,
  },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  tileAttendees: { fontSize: 12, color: '#9c8f7e' },
  tileButton: {
    backgroundColor: '#B83255',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tileButtonText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});
