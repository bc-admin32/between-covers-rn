import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, ImageBackground, Animated, Easing, Linking, Modal,
  AccessibilityInfo,
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
import LiveEventBanner from '../../../components/live/LiveEventBanner';
import * as LocalAuthentication from 'expo-local-authentication';

// Device-local date key — client-side "already shown today" guard only.
function todayKey(): string { return new Date().toLocaleDateString('en-CA'); }
function markDay6Shown() { SecureStore.setItemAsync('bc_last_day6_video_shown', todayKey()).catch(() => {}); }

const CACHE_KEY = 'bc_home_cache';
const DEFAULT_BG = 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/loc_default.jpg';

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
  irisDay6?: { videoUrl: string; daysSinceTrialStart?: number };
};

// Rendered only while Iris's daily message is unread (the `!watched` branch on
// the home screen), so this component's mount lifetime *is* the unread state —
// the looping attention animation starts on mount and stops when it unmounts
// (i.e. once the user opens the message). No separate flag or API call needed.
function IrisPulseAvatar({ uri, onPress }: { uri: string; onPress: () => void }) {
  const ringScale   = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.35)).current;
  const ring2Scale  = useRef(new Animated.Value(1)).current;
  const ring2Opacity= useRef(new Animated.Value(0.2)).current;
  const wiggle      = useRef(new Animated.Value(0)).current; // -1..1 → rotate + slide
  const glow        = useRef(new Animated.Value(0)).current; // 0..1  → halo opacity + scale
  const [reduceMotion, setReduceMotion] = useState(false);

  // Ambient pulse rings — always breathing, gives the avatar a soft live halo.
  useEffect(() => {
    const rings = Animated.loop(
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
    );
    rings.start();
    return () => rings.stop();
  }, []);

  // Honor the OS "reduce motion" setting — fall back to glow-only (no wiggle).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduceMotion(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(v));
    return () => { mounted = false; sub.remove(); };
  }, []);

  // Attention burst: a quick wiggle + a couple of glow pulses over ~1.3s, then
  // a brief rest (~2.4s), on repeat. Eye-catching without being frantic.
  useEffect(() => {
    const glowPulses = Animated.sequence([
      Animated.timing(glow, { toValue: 1,    duration: 320, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(glow, { toValue: 0.25, duration: 300, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(glow, { toValue: 1,    duration: 320, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(glow, { toValue: 0,    duration: 360, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]);

    const wiggleBurst = Animated.sequence([
      Animated.timing(wiggle, { toValue: 1,    duration: 80, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: -1,   duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0.7,  duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: -0.7, duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0.4,  duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0,    duration: 90, useNativeDriver: true }),
    ]);

    const burst = reduceMotion ? glowPulses : Animated.parallel([wiggleBurst, glowPulses]);
    const loop = Animated.loop(Animated.sequence([burst, Animated.delay(2400)]));
    loop.start();
    return () => {
      loop.stop();
      wiggle.setValue(0);
      glow.setValue(0);
    };
  }, [reduceMotion]);

  const rotate      = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-10deg', '10deg'] });
  const translateX  = wiggle.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] });
  const glowScale   = glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] });

  return (
    <TouchableOpacity onPress={onPress} style={styles.irisPulseContainer} activeOpacity={0.85}>
      <Animated.View pointerEvents="none" style={[styles.irisGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <Animated.View style={[styles.irisPulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
      <Animated.View style={[styles.irisPulseRing2, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
      <Animated.View style={{ transform: [{ rotate }, { translateX }] }}>
        <View style={styles.irisAvatarWrapper}>
          <Image source={{ uri }} style={styles.irisAvatar} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeData | null>(null);
  // Init with DEFAULT_BG so cold start renders a generic, non-personalized
  // image (no leak across users) instead of flashing the previous user's
  // cached background. The setBgUrl call after the API resolves swaps in
  // the user's real background once.
  const [bgUrl, setBgUrl] = useState(DEFAULT_BG);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [focusCount, setFocusCount] = useState(0);

  useFocusEffect(useCallback(() => {
    setFocusCount((c) => c + 1);
  }, []));
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [watched, setWatched] = useState(false);
  const [showTrialOverlay, setShowTrialOverlay] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isTrialDay6, setIsTrialDay6] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric');
  const markedRef = useRef(false);
  const overlayOpenRef = useRef(false);
  const isTrialDay6Ref = useRef(false);
  const player = useVideoPlayer(
    (isTrialDay6 && data?.irisDay6?.videoUrl ? data.irisDay6.videoUrl : data?.irisDaily?.videoUrl) ?? '',
    (p) => { p.loop = false; }
  );

  // Keep refs in sync so listeners always read fresh state
  useEffect(() => { overlayOpenRef.current = overlayOpen; }, [overlayOpen]);
  useEffect(() => { isTrialDay6Ref.current = isTrialDay6; }, [isTrialDay6]);

  // Day-6 reminder is driven off the backend irisDay6 object (always present on
  // home load on trial day 6) — not bc_profile_cache (only written by the
  // Profile tab; absent for users who never opened it). Same-day guard kept.
  useEffect(() => {
    if (!data?.irisDay6?.videoUrl) { setIsTrialDay6(false); return; }
    let cancelled = false;
    SecureStore.getItemAsync('bc_last_day6_video_shown').then((lastShown) => {
      if (!cancelled) setIsTrialDay6(lastShown !== todayKey());
    });
    return () => { cancelled = true; };
  }, [data?.irisDay6?.videoUrl]);

  // One-time biometric opt-in prompt — fires when redirect.tsx flagged it pending
  useEffect(() => {
    let mounted = true;
    async function checkBiometricPrompt() {
      const pending = await SecureStore.getItemAsync('bc_biometric_prompt_pending');
      if (pending !== 'true') return;
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        await SecureStore.deleteItemAsync('bc_biometric_prompt_pending');
        return;
      }
      let label = 'Biometric';
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          label = 'Face ID';
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          label = 'Touch ID';
        }
      } catch {}
      if (mounted) {
        setBiometricLabel(label);
        setShowBiometricPrompt(true);
      }
    }
    checkBiometricPrompt();
    return () => { mounted = false; };
  }, []);

  // When the video ends naturally, either close or show the trial-day-6 overlay.
  // Uses `playToEnd` (fires only on natural completion) instead of `playingChange`
  // (which also fires on buffer pauses and would prematurely close mid-playback).
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (!overlayOpenRef.current) return;
      if (isTrialDay6Ref.current) {
        setShowTrialOverlay(true);
        markDay6Shown();
      } else {
        setOverlayOpen(false);
        setWatched(true);
      }
    });
    return () => sub.remove();
  }, [player]);


  useEffect(() => {
    const load = async () => {
      setLoadError(false);
      try {
        // No SecureStore hydration here — render the loading state until
        // the API confirms which user's home this is. Showing the previous
        // user's cached home for the API roundtrip leaks data across
        // accounts. signOut() also wipes CACHE_KEY, but defense in depth.
        const json = await apiGet<HomeData>('/home/resolve');
        if (json.nextRoute?.startsWith('/')) {
          router.replace(normalizeRoute(json.nextRoute) as any);
          return;
        }
        setData(json);
        if (json.background?.imageUrl) {
          setBgUrl(json.background.imageUrl);
        }
        await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(json));
      } catch {
        setLoadError(true);
      }
    };
    load();
  }, [retryCount, focusCount]);

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
  const day6Active = isTrialDay6 && !!data.irisDay6?.videoUrl;
  const showVideoMode = day6Active || (iris.mode === 'video' && !!iris.videoUrl);

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
    // On day-6, skipping still surfaces the trial overlay (no watch-to-end required).
    if (isTrialDay6Ref.current) { setShowTrialOverlay(true); markDay6Shown(); return; }
    setOverlayOpen(false);
    setWatched(true);
  };

  const dismissTrialOverlay = () => {
    setShowTrialOverlay(false);
    setOverlayOpen(false);
    setWatched(true);
    setIsTrialDay6(false);
  };

  const dismissBiometricPrompt = async () => {
    await SecureStore.setItemAsync('bc_biometric_prompt_dismissed', 'true');
    await SecureStore.deleteItemAsync('bc_biometric_prompt_pending');
    setShowBiometricPrompt(false);
  };

  const enableBiometric = async () => {
    await SecureStore.setItemAsync('bc_biometric_enabled', 'true');
    await SecureStore.deleteItemAsync('bc_biometric_prompt_pending');
    try {
      await apiPost('/user/biometric', { preferred: true });
    } catch {
      // Local enable applies; cross-device sync just doesn't happen this time
    }
    setShowBiometricPrompt(false);
  };

  return (
    <ImageBackground
      source={{ uri: bgUrl }}
      style={styles.container}
      imageStyle={{ opacity: 0.75 }}
    >
      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} source="trial" />
      <Modal
        visible={showBiometricPrompt}
        transparent
        animationType="slide"
        onRequestClose={dismissBiometricPrompt}
      >
        <TouchableOpacity style={styles.bioPromptOverlay} activeOpacity={1} onPress={dismissBiometricPrompt} />
        <View style={styles.bioPromptSheet}>
          <View style={styles.bioPromptHandle} />
          <View style={styles.bioPromptContent}>
            <Text style={styles.bioPromptTitle}>Sign in faster next time</Text>
            <Text style={styles.bioPromptBody}>
              Use {biometricLabel} to sign in to Between Covers without entering your details every time. You can change this anytime in Account & Settings.
            </Text>
            <TouchableOpacity style={styles.bioPromptPrimary} onPress={enableBiometric}>
              <Text style={styles.bioPromptPrimaryText}>Enable {biometricLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bioPromptSecondary} onPress={dismissBiometricPrompt}>
              <Text style={styles.bioPromptSecondaryText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 88 + insets.bottom }]}>

        {/* GREETING */}
        <Text style={styles.greeting}>{data.greeting.text}</Text>

        {/* CENTER CONTENT */}
        <View style={styles.center}>

          {/* LIVE EVENT BANNER */}
          <LiveEventBanner />

          {/* IRIS - VIDEO MODE */}
          {showVideoMode && (
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
                    style={[styles.irisAvatar, styles.irisAvatarRing]}
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
          {iris.mode === 'static' && !day6Active && (
            <TouchableOpacity
              style={styles.irisButton}
              onPress={() => router.push('/iris/chat' as any)}
            >
              <Image
                source={{ uri: 'https://mvdesign-app-assets.s3.us-east-1.amazonaws.com/Iris/avatar.png' }}
                style={[styles.irisAvatar, styles.irisAvatarRing]}
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
  irisContainer: { alignItems: 'center' },
  irisButton: { alignItems: 'center', gap: spacing.sm },
  irisPulseContainer: { alignItems: 'center', justifyContent: 'center', width: 96, height: 96 },
  irisGlow: {
    position: 'absolute',
    top: -12,
    left: -12,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(184,50,85,0.5)',
    shadowColor: '#B83255',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 22,
    elevation: 12,
  },
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
  irisAvatarRing: {
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
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
  bioPromptOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,72,0.5)' },
  bioPromptSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FDFAF6',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  bioPromptHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D7E2E9', alignSelf: 'center', marginTop: 12 },
  bioPromptContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  bioPromptTitle: { fontSize: 22, fontFamily: 'Cormorant_700Bold_Italic', color: '#0F2A48', textAlign: 'center' },
  bioPromptBody: { fontSize: 14, fontWeight: '300', color: '#3d352e', lineHeight: 22, textAlign: 'center', marginBottom: spacing.sm },
  bioPromptPrimary: { paddingVertical: 14, borderRadius: 999, backgroundColor: '#B83255', alignItems: 'center' },
  bioPromptPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  bioPromptSecondary: { paddingVertical: 12, alignItems: 'center' },
  bioPromptSecondaryText: { fontSize: 13, color: '#6A5969' },
});
