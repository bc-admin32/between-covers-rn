import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  AppState, type AppStateStatus,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { apiGet } from '../../lib/api';
import { spacing } from '../../lib/theme';
import LobbyModal from './LobbyModal';
import type { LiveRoom } from '../../lib/types';

type LiveEvent = {
  eventId: string;
  title: string;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
  status: string;
  scheduledAt?: string;
  rooms?: LiveRoom[];
};

const POLL_INTERVAL_MS = 60_000;

function pickEligible(events: LiveEvent[]): LiveEvent | null {
  return (
    events.find((e) => {
      if (e.status === 'ACTIVE') return true;
      // Multi-room IRIS_LIVE: show banner from 5 min before scheduled start.
      // Dead branch until backend brief lands rooms[] on /live/active responses.
      if (e.status === 'SCHEDULED' && e.eventType === 'IRIS_LIVE' && e.rooms?.length && e.scheduledAt) {
        const minsUntil = (new Date(e.scheduledAt).getTime() - Date.now()) / 60_000;
        return minsUntil <= 5 && minsUntil >= -0.5;
      }
      return false;
    }) ?? null
  );
}

function PulseDot() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.9, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(scale,   { toValue: 1,   duration: 800, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.livePulseContainer}>
      <Animated.View style={[styles.livePulseRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.livePulseDot} />
    </View>
  );
}

export default function LiveEventBanner() {
  const router = useRouter();
  const [activeEvent, setActiveEvent] = useState<LiveEvent | null>(null);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [lobbyEventId, setLobbyEventId] = useState<string | null>(null);

  const refetch = useCallback(() => {
    apiGet<{ events: LiveEvent[] }>('/live?status=ACTIVE')
      .then((res) => setActiveEvent(pickEligible(res.events)))
      .catch(() => {});
  }, []);

  // Layer 2 — refetch every time the home tab regains focus.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Layers 1 + 3 — AppState listener pairs with the 60s poll so the interval
  // only runs while the app is foregrounded, and a fresh fetch fires the
  // moment the app returns to the foreground.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId == null) {
        intervalId = setInterval(refetch, POLL_INTERVAL_MS);
      }
    };
    const stopPolling = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    startPolling();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refetch();
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      sub.remove();
    };
  }, [refetch]);

  const handlePress = () => {
    if (!activeEvent) return;
    // Multi-room IRIS_LIVE → lobby modal; everything else → existing single-room route.
    // The rooms[] check no-ops until the backend brief returns rooms on /live responses.
    if (activeEvent.eventType === 'IRIS_LIVE' && activeEvent.rooms && activeEvent.rooms.length > 0) {
      setLobbyEventId(activeEvent.eventId);
      setLobbyOpen(true);
      return;
    }
    router.push(`/live/event?eventId=${activeEvent.eventId}` as any);
  };

  return (
    <>
      {activeEvent && (
        <TouchableOpacity style={styles.liveBanner} onPress={handlePress}>
          <PulseDot />
          <View style={styles.liveBannerText}>
            <Text style={styles.liveLabel}>Live Now</Text>
            <Text style={styles.liveTitle} numberOfLines={1}>{activeEvent.title}</Text>
          </View>
          <View style={styles.joinButton}>
            <Text style={styles.joinText}>Join →</Text>
          </View>
        </TouchableOpacity>
      )}
      {lobbyEventId && (
        <LobbyModal
          eventId={lobbyEventId}
          visible={lobbyOpen}
          onClose={() => {
            setLobbyOpen(false);
            setLobbyEventId(null);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  liveBanner: {
    marginHorizontal: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(184,50,85,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.sm,
    width: '90%',
  },
  livePulseContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(184,50,85,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePulseRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(184,50,85,0.45)',
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B83255',
  },
  liveBannerText: { flex: 1 },
  liveLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B83255',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  liveTitle: { fontSize: 15, color: '#FDFAF6', fontStyle: 'italic' },
  joinButton: {
    backgroundColor: '#B83255',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  joinText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
