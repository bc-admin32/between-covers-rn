import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPatch } from '../../../lib/api';
import { spacing, radius, colors } from '../../../lib/theme';

const DEFAULT_PHOTO = 'https://cdn.betweencovers.app/default_profile_image.jpg';

const GENRE_LABELS: Record<string, string> = {
  CONTEMPORARY_ROMANCE: 'Contemporary',
  ROMANTIC_SUSPENSE: 'Romantic Suspense',
  FANTASY_ROMANCE: 'Fantasy Romance',
  PARANORMAL_ROMANCE: 'Paranormal',
  HISTORICAL_ROMANCE: 'Historical',
  DARK_ROMANCE: 'Dark Romance',
  SPICY_EROTIC_ROMANCE: 'Spicy / Erotic',
};

const SPICE_LABELS: Record<string, string> = {
  NONE: 'Clean & cozy',
  LIGHT: 'Keep it cute',
  WARM: 'A little kick',
  HOT: "We're day drinking",
  VERY_HOT: 'Absolutely unhinged',
};

const SPICE_GLYPHS: Record<string, string> = {
  NONE: '🫖',
  LIGHT: '😇',
  WARM: '🍹',
  HOT: '🥂',
  VERY_HOT: '🥵',
};

function MenuRow({ icon, label, onPress, danger }: {
  icon: string; label: string; onPress: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuRowLeft}>
        <Ionicons name={icon as any} size={16} color={danger ? '#B83255' : '#A9C0D4'} />
        <Text style={[styles.menuRowLabel, danger && styles.menuRowLabelDanger]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={13} color={danger ? '#B83255' : 'rgba(15,42,72,0.25)'} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = await SecureStore.getItemAsync('bc_profile_cache');
        if (cached) {
          setUser(JSON.parse(cached));
          setLoading(false);
        }
        const result = await apiGet('/profile');
        setUser(result);
        await SecureStore.setItemAsync('bc_profile_cache', JSON.stringify(result));
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePhotoUpload = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setLocalPhotoUrl(asset.uri);
    setUploadStatus('uploading');

    try {
      const contentType = 'image/jpeg';
      const { uploadUrl, fileKey } = await apiPatch('/profile', {
        action: 'REQUEST_PHOTO_UPLOAD',
        contentType,
      });

      const fileData = await fetch(asset.uri);
      const blob = await fileData.blob();

      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });

      if (!s3Res.ok) throw new Error('Upload failed');

      const confirm = await apiPatch('/profile', { fileKey });
      setUser((prev: any) => ({ ...prev, photoUrl: confirm.photoUrl }));
      setLocalPhotoUrl(null);
      setUploadStatus('success');
      setTimeout(() => setUploadStatus('idle'), 3000);
    } catch {
      setLocalPhotoUrl(null);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 4000);
    }
  };

  const handleLogout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('bc_id_token');
          await SecureStore.deleteItemAsync('bc_access_token');
          await SecureStore.deleteItemAsync('bc_profile_cache');
          router.replace('/(auth)/login' as any);
        },
      },
    ]);
  };

  if (loading || !user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const photoToShow = localPhotoUrl ?? user.photoUrl ?? DEFAULT_PHOTO;
  const isFounding = user?.recognition?.foundingMember?.isFounding === true;
  const genres: string[] = Array.isArray(user.genre) ? user.genre.filter((g: string) => GENRE_LABELS[g]) : [];
  const spiceLabel = user.spiceLevel ? SPICE_LABELS[user.spiceLevel] : null;
  const spiceGlyph = user.spiceLevel ? SPICE_GLYPHS[user.spiceLevel] : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroBg1} />
          <View style={styles.heroBg2} />

          <View style={styles.heroContent}>
            {isFounding && (
              <Text style={styles.foundingBadge}>✦ Founding Member</Text>
            )}

            <TouchableOpacity style={styles.avatarContainer} onPress={handlePhotoUpload}>
              <View style={[styles.avatarWrapper, uploadStatus === 'error' && styles.avatarWrapperError, uploadStatus === 'success' && styles.avatarWrapperSuccess]}>
                <Image source={{ uri: photoToShow }} style={styles.avatar} />
                {uploadStatus === 'uploading' && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </View>
              <View style={[styles.cameraButton, uploadStatus === 'error' && { backgroundColor: '#B83255' }, uploadStatus === 'success' && { backgroundColor: '#6B9AB8' }]}>
                <Text style={styles.cameraButtonText}>
                  {uploadStatus === 'uploading' ? '…' : uploadStatus === 'success' ? '✓' : uploadStatus === 'error' ? '!' : '📷'}
                </Text>
              </View>
              {uploadStatus !== 'idle' && (
                <Text style={[styles.uploadStatusText, uploadStatus === 'error' && { color: '#B83255' }]}>
                  {uploadStatus === 'uploading' ? 'Saving…' : uploadStatus === 'success' ? 'Photo saved ✓' : 'Upload failed — try again'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.displayName}>{user.displayName ?? ''}</Text>
            <View style={styles.nameDivider} />
          </View>
        </View>

        {/* CURVE */}
        <View style={styles.curve} />

        {/* READING VIBE */}
        <View style={styles.vibeCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionLabel}>Reading Vibe</Text>
            <View style={styles.sectionLine} />
          </View>

          {genres.length > 0 ? (
            <View style={styles.genreTags}>
              {genres.map((g) => (
                <View key={g} style={styles.genreTag}>
                  <Text style={styles.genreTagText}>{GENRE_LABELS[g]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyVibe}>Add your favorite genres ✦</Text>
          )}

          {spiceLabel && (
            <Text style={styles.spiceLabel}>{spiceGlyph} {spiceLabel}</Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* MENU */}
        <View style={styles.menu}>
          <MenuRow icon="person-outline" label="Account & Settings" onPress={() => router.push('/(tabs)/profile/account' as any)} />
          <MenuRow icon="heart-outline" label="Reading Preferences" onPress={() => router.push('/(tabs)/profile/preferences' as any)} />
          <MenuRow icon="document-text-outline" label="Legal" onPress={() => router.push('/(tabs)/profile/legal' as any)} />
          <MenuRow icon="log-out-outline" label="Log Out" onPress={handleLogout} danger />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F4F8' },
  scrollContent: { paddingBottom: spacing.xl },
  hero: { backgroundColor: '#6B9AB8', paddingBottom: 64, position: 'relative', overflow: 'hidden' },
  heroBg1: { position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(184,50,85,0.15)' },
  heroBg2: { position: 'absolute', bottom: -30, left: 10, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroContent: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  foundingBadge: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase', color: '#B83255' },
  avatarContainer: { alignItems: 'center', gap: spacing.sm },
  avatarWrapper: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#C0C8D0', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 32, elevation: 8 },
  avatarWrapperError: { borderColor: '#B83255' },
  avatarWrapperSuccess: { borderColor: '#6B9AB8' },
  avatar: { width: 96, height: 96 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(107,154,184,0.3)', alignItems: 'center', justifyContent: 'center' },
  cameraButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraButtonText: { fontSize: 13 },
  uploadStatusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  displayName: { fontSize: 38, fontStyle: 'italic', color: '#F0EDE4', lineHeight: 44, letterSpacing: 0.1 },
  nameDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)' },
  curve: { height: 20, backgroundColor: '#F1F4F8', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  vibeCard: { marginHorizontal: spacing.lg, backgroundColor: '#fff', borderRadius: 20, padding: spacing.lg, shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: 'rgba(15,42,72,0.07)', marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,42,72,0.1)' },
  sectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#A9C0D4' },
  genreTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: spacing.md },
  genreTag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F1F4F8', borderWidth: 1, borderColor: 'rgba(15,42,72,0.1)' },
  genreTagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: '#0F2A48' },
  emptyVibe: { fontSize: 16, fontStyle: 'italic', color: '#A9C0D4', textAlign: 'center', marginBottom: spacing.md },
  spiceLabel: { fontSize: 15, fontStyle: 'italic', fontWeight: '500', color: '#6A5969', textAlign: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  menu: { paddingHorizontal: spacing.lg },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(15,42,72,0.08)' },
  menuRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuRowLabel: { fontSize: 14, color: '#0F2A48', letterSpacing: 0.1 },
  menuRowLabelDanger: { color: '#B83255' },
});