import { useEffect, useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, ImageBackground, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { apiGet, apiPost } from '../../../lib/api';
import { spacing, radius } from '../../../lib/theme';
import { VideoView, useVideoPlayer } from 'expo-video';

const CACHE_KEY = 'bc_home_cache';

type LiveEvent = {
  eventId: string;
  title: string;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
  status: string;
};

type HomeData = {
  nextRoute?: string;
  greeting: { text: string };
  background: { imageUrl: string };
  irisDaily: {
    mode: 'video' | 'static';
    videoUrl?: string;
    staticImageUrl?: string;
    context: { isIntro: boolean; timeBucket: string | null; holiday: string | null };
  };
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeData | null>(null);
  const [activeEvent, setActiveEvent] = useState<LiveEvent | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [watched, setWatched] = useState(false);
  const markedRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const player = useVideoPlayer(
    data?.irisDaily?.videoUrl ?? '',
    (p) => { p.loop = false; }
  );

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = await SecureStore.getItemAsync(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!parsed.nextRoute) setData(parsed);
        }
        const json = await apiGet<HomeData>('/home/resolve');
        if (json.nextRoute?.startsWith('/')) {
          router.replace(json.nextRoute as any);
          return;
        }
        setData(json);
        await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(json));
      } catch {}
    };
    load();
  }, []);

  useEffect(() => {
    apiGet<{ events: LiveEvent[] }>('/live?status=ACTIVE')
      .then((res) => {
        const active = res.events.find((e) => e.status === 'ACTIVE');
        setActiveEvent(active ?? null);
      })
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#B83255" />
      </View>
    );
  }

  const iris = data.irisDaily;

  const markViewed = () => {
    if (markedRef.current) return;
    markedRef.current = true;
    apiPost('/cozy/iris/daily/viewed', {
      isIntro: iris.context?.isIntro === true,
    }).catch(() => {});
  };

  const openVideo = () => {
    setOverlayOpen(true);
    markViewed();
    player.play();
  };

  const closeVideo = () => {
    player.pause();
    setOverlayOpen(false);
    setWatched(true);
  };

  const handleLiveBanner = () => {
    if (!activeEvent) return;
    const dest = activeEvent.eventType === 'IRIS_LIVE'
      ? `/(tabs)/lounge?eventId=${activeEvent.eventId}`
      : `/(tabs)/lounge?eventId=${activeEvent.eventId}`;
    router.push(dest as any);
  };

  return (
    <ImageBackground
      source={{ uri: data.background.imageUrl }}
      style={styles.container}
      imageStyle={{ opacity: 0.75 }}
    >
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 88 + insets.bottom }]}>

        {/* GREETING */}
        <Text style={styles.greeting}>{data.greeting.text}</Text>

        {/* CENTER CONTENT */}
        <View style={styles.center}>

          {/* LIVE EVENT BANNER */}
          {activeEvent && (
            <TouchableOpacity style={styles.liveBanner} onPress={handleLiveBanner}>
              <View style={styles.livePulseContainer}>
                <View style={styles.livePulseDot} />
              </View>
              <View style={styles.liveBannerText}>
                <Text style={styles.liveLabel}>Live Now</Text>
                <Text style={styles.liveTitle} numberOfLines={1}>{activeEvent.title}</Text>
              </View>
              <View style={styles.joinButton}>
                <Text style={styles.joinText}>Join →</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* IRIS - VIDEO MODE */}
          {iris.mode === 'video' && iris.videoUrl && (
            <View style={styles.irisContainer}>
              {overlayOpen ? (
                <View style={styles.videoContainer}>
                  <VideoView
                    player={player}
                    style={styles.video}
                    contentFit="cover"
                    nativeControls={false}
                  />
                  <TouchableOpacity style={styles.skipButton} onPress={closeVideo}>
                    <Text style={styles.skipText}>skip</Text>
                  </TouchableOpacity>
                </View>
              ) : watched ? (
                <TouchableOpacity
                  style={styles.irisButton}
                  onPress={() => router.push('/(tabs)/lounge' as any)}
                >
                  <Image
                    source={{ uri: iris.staticImageUrl ?? 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
                    style={styles.irisAvatar}
                  />
                  <Text style={styles.irisLabel}>Chat with Iris ✦</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={openVideo}>
                  <Animated.View style={[styles.irisAvatarWrapper, { transform: [{ scale: pulseAnim }] }]}>
                    <Image
                      source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
                      style={styles.irisAvatar}
                    />
                  </Animated.View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* IRIS - STATIC MODE */}
          {iris.mode === 'static' && (
            <TouchableOpacity
              style={styles.irisButton}
              onPress={() => router.push('/(tabs)/lounge' as any)}
            >
              <Image
                source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
                style={styles.irisAvatar}
              />
              <Text style={styles.irisLabel}>Chat with Iris ✦</Text>
            </TouchableOpacity>
          )}

        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6E6EA' },
  loading: { flex: 1, backgroundColor: '#F6E6EA', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center' },
  greeting: {
    fontSize: 34,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    fontStyle: 'italic',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: spacing.md,
  },
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
    backgroundColor: 'rgba(184,50,85,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
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
  irisContainer: { alignItems: 'center' },
  irisButton: { alignItems: 'center', gap: spacing.sm },
  irisAvatarWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(169,192,212,0.5)',
  },
  irisAvatar: { width: 96, height: 96, borderRadius: 48 },
  irisLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '300',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  videoContainer: {
    width: 140,
    height: 140,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  video: { width: 140, height: 140 },
  skipButton: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  skipText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, letterSpacing: 0.4 },
});