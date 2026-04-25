import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, ImageBackground, Animated, Easing, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { apiGet, apiPost } from '../../../lib/api';
import { normalizeRoute } from '../../../lib/routes';
import { spacing, radius } from '../../../lib/theme';
import { VideoView, useVideoPlayer } from 'expo-video';
import { FeedbackModal } from '../../../components/FeedbackModal';

function getDaysSinceTrial(startDateStr: string, timeZone: string): number {
  const today = new Date().toLocaleDateString('en-CA', { timeZone });
  const start = new Date(startDateStr).toLocaleDateString('en-CA', { timeZone });
  return Math.round((new Date(today).getTime() - new Date(start).getTime()) / 86400000);
}

const CACHE_KEY = 'bc_home_cache';
const BG_CACHE_KEY = 'bc_home_bg';
const DEFAULT_BG = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/loc_default.jpg';

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

function IrisPulseAvatar({ uri, onPress }: { uri: string; onPress: () => void }) {
  const ringScale   = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.35)).current;
  const ring2Scale  = useRef(new Animated.Value(1)).current;
  const ring2Opacity= useRef(new Animated.Value(0.2)).current;
  const shakeX      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Soft pulse rings
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale,   { toValue: 1.25, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(ringScale,   { toValue: 1,    duration: 1200, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0,    duration: 1200, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.35, duration: 1200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring2Scale,   { toValue: 1.12, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(ring2Scale,   { toValue: 1,    duration: 1200, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        ]),
        Animated.sequence([
          Animated.timing(ring2Opacity, { toValue: 0,   duration: 1200, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0.2, duration: 1200, useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Gentle shake every ~5s
    Animated.loop(
      Animated.sequence([
        Animated.timing(shakeX, { toValue: 1.5,  duration: 90, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -1.5, duration: 90, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 1,    duration: 90, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -1,   duration: 90, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0,    duration: 90, useNativeDriver: true }),
        Animated.delay(5000),
      ])
    ).start();
  }, []);

  return (
    <TouchableOpacity onPress={onPress} style={styles.irisPulseContainer}>
      <Animated.View style={[styles.irisPulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
      <Animated.View style={[styles.irisPulseRing2, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
      <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
        <View style={styles.irisAvatarWrapper}>
          <Image source={{ uri }} style={styles.irisAvatar} />
        </View>
      </Animated.View>
    </TouchableOpacity>
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeData | null>(null);
  const [bgUrl, setBgUrl] = useState(DEFAULT_BG);

  // Restore the user's last known background immediately from cache
  // so returning users never see the default background flash.
  useEffect(() => {
    SecureStore.getItemAsync(BG_CACHE_KEY).then((cached) => {
      if (cached) setBgUrl(cached);
    });
  }, []);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [focusCount, setFocusCount] = useState(0);

  useFocusEffect(useCallback(() => {
    setFocusCount((c) => c + 1);
  }, []));
  const [activeEvent, setActiveEvent] = useState<LiveEvent | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [watched, setWatched] = useState(false);
  const [showTrialOverlay, setShowTrialOverlay] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isTrialDay6, setIsTrialDay6] = useState(false);
  const markedRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const isTrialDay6Ref = useRef(false);
  const player = useVideoPlayer(
    data?.irisDaily?.videoUrl ?? '',
    (p) => { p.loop = false; }
  );

  // Keep refs in sync so listeners always read fresh state
  useEffect(() => { overlayOpenRef.current = overlayOpen; }, [overlayOpen]);
  useEffect(() => { isTrialDay6Ref.current = isTrialDay6; }, [isTrialDay6]);

  // Check once on mount whether this user is on trial day 6 and hasn't seen the overlay today
  useEffect(() => {
    SecureStore.getItemAsync('bc_profile_cache').then((cached) => {
      if (!cached) return;
      try {
        const profile = JSON.parse(cached);
        if (
          profile.subscriptionStatus === 'trial' &&
          profile.subscriptionStartDate &&
          profile.timeZone &&
          getDaysSinceTrial(profile.subscriptionStartDate, profile.timeZone) === 6
        ) {
          const today = new Date().toLocaleDateString('en-CA', { timeZone: profile.timeZone });
          SecureStore.getItemAsync('bc_last_day6_video_shown').then((lastShown) => {
            if (lastShown !== today) setIsTrialDay6(true);
          });
        }
      } catch {}
    });
  }, []);

  // When the video ends naturally, either close or show the trial-day-6 overlay
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }: { isPlaying: boolean }) => {
      if (!isPlaying && overlayOpenRef.current) {
        if (isTrialDay6Ref.current) {
          setShowTrialOverlay(true);
          // Mark shown so it doesn't appear again today
          SecureStore.getItemAsync('bc_profile_cache').then((cached) => {
            if (!cached) return;
            try {
              const { timeZone } = JSON.parse(cached);
              const today = new Date().toLocaleDateString('en-CA', { timeZone: timeZone ?? 'UTC' });
              SecureStore.setItemAsync('bc_last_day6_video_shown', today).catch(() => {});
            } catch {}
          });
        } else {
          setOverlayOpen(false);
          setWatched(true);
        }
      }
    });
    return () => sub.remove();
  }, [player]);


  useEffect(() => {
    const load = async () => {
      setLoadError(false);
      try {
        const cached = await SecureStore.getItemAsync(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!parsed.nextRoute) setData(parsed);
        }
        const json = await apiGet<HomeData>('/home/resolve');
        if (json.nextRoute?.startsWith('/')) {
          router.replace(normalizeRoute(json.nextRoute) as any);
          return;
        }
        setData(json);
        // Update and persist the background from the live API response.
        if (json.background?.imageUrl) {
          setBgUrl(json.background.imageUrl);
          SecureStore.setItemAsync(BG_CACHE_KEY, json.background.imageUrl).catch(() => {});
        }
        await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(json));
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, [retryCount, focusCount]);

  useEffect(() => {
    apiGet<{ events: LiveEvent[] }>('/live?status=ACTIVE')
      .then((res) => {
        const active = res.events.find((e) => e.status === 'ACTIVE');
        setActiveEvent(active ?? null);
      })
      .catch(() => {});
  }, []);

  if (!data && loadError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Couldn't load your home right now.</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setRetryCount((c) => c + 1)}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) {
    return (
      <ImageBackground source={{ uri: DEFAULT_BG }} style={styles.loading} imageStyle={{ opacity: 0.75 }}>
        <ActivityIndicator color="#B83255" />
      </ImageBackground>
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

  const dismissTrialOverlay = () => {
    setShowTrialOverlay(false);
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
      source={{ uri: bgUrl }}
      style={styles.container}
      imageStyle={{ opacity: 0.75 }}
    >
      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} source="trial" />
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 88 + insets.bottom }]}>

        {/* GREETING */}
        <Text style={styles.greeting}>{data.greeting.text}</Text>

        {/* CENTER CONTENT */}
        <View style={styles.center}>

          {/* LIVE EVENT BANNER */}
          {activeEvent && (
            <TouchableOpacity style={styles.liveBanner} onPress={handleLiveBanner}>
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
                  {!showTrialOverlay && (
                    <TouchableOpacity style={styles.skipButton} onPress={closeVideo}>
                      <Text style={styles.skipText}>skip</Text>
                    </TouchableOpacity>
                  )}
                  {showTrialOverlay && (
                    <View style={styles.trialOverlay}>
                      <TouchableOpacity
                        style={styles.trialBtn}
                        onPress={() => Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() => {})}
                      >
                        <Text style={styles.trialBtnText}>Manage trial</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.trialBtn, styles.trialBtnSecondary]}
                        onPress={() => setFeedbackOpen(true)}
                      >
                        <Text style={[styles.trialBtnText, styles.trialBtnTextSecondary]}>Share feedback</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trialDismiss} onPress={dismissTrialOverlay}>
                        <Text style={styles.trialDismissText}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : watched ? (
                <TouchableOpacity
                  style={styles.irisButton}
                  onPress={() => router.push('/iris/chat' as any)}
                >
                  <Image
                    source={{ uri: iris.staticImageUrl ?? 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
                    style={styles.irisAvatar}
                  />
                  <Text style={styles.irisLabel}>Chat with Iris ✦</Text>
                </TouchableOpacity>
              ) : (
                <IrisPulseAvatar
                  uri={iris.staticImageUrl ?? 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png'}
                  onPress={openVideo}
                />
              )}
            </View>
          )}

          {/* IRIS - STATIC MODE */}
          {iris.mode === 'static' && (
            <TouchableOpacity
              style={styles.irisButton}
              onPress={() => router.push('/iris/chat' as any)}
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
  loading: { flex: 1, backgroundColor: '#F6E6EA', alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15, color: '#6A5969', textAlign: 'center', paddingHorizontal: 32 },
  retryButton: { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 999, backgroundColor: '#B83255' },
  retryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  content: { flex: 1, alignItems: 'center' },
  greeting: {
    fontSize: 34,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    fontFamily: 'DancingScript_400Regular',
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
  irisContainer: { alignItems: 'center' },
  irisButton: { alignItems: 'center', gap: spacing.sm },
  irisPulseContainer: { alignItems: 'center', justifyContent: 'center', width: 96, height: 96 },
  irisPulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(184,50,85,0.5)',
  },
  irisPulseRing2: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
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
  trialOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 14,
  },
  trialBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#B83255',
    alignItems: 'center',
  },
  trialBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  trialBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  trialBtnTextSecondary: {
    color: 'rgba(255,255,255,0.85)',
  },
  trialDismiss: {
    marginTop: 2,
    paddingVertical: 4,
  },
  trialDismissText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
  },
});
