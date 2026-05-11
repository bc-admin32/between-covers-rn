import { useEffect, useState, type ReactNode } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { apiGet, apiPost } from '../../lib/api';
import { signOut } from '../../lib/signout';
import { spacing } from '../../lib/theme';

// lib/api.ts throws `Error('HTTP <status>: <detail>')` for non-2xx responses.
// Extract the status so we can route 401/403/400/500 to distinct UX paths
// against the deployed submissionCreate Lambda's response shapes.
function parseHttpStatus(err: unknown): number | null {
  const msg = String((err as Error)?.message ?? '');
  const m = /^HTTP (\d{3})/.exec(msg);
  return m ? parseInt(m[1], 10) : null;
}

type Profile = {
  email?: string;
  displayName?: string;
  subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
  subscriptionEndDate?: string | null;
  isStaff?: boolean;
};

const RECIPE_NAME_MAX = 100;
const WHY_LOVE_MAX = 500;
const WHY_FEATURED_MAX = 1000;

function hasEntitlementSignal(p: Profile): boolean {
  return 'isStaff' in p || 'subscriptionStatus' in p || 'subscriptionEndDate' in p;
}

function isEntitled(p: Profile): boolean {
  if (p.isStaff === true) return true;
  if (p.subscriptionStatus !== 'active' && p.subscriptionStatus !== 'trialing') return false;
  if (!p.subscriptionEndDate) return false;
  const t = new Date(p.subscriptionEndDate).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

type FormType = 'recipe' | 'author';

export default function SubmissionForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const formType: FormType | null =
    params.type === 'recipe' ? 'recipe' :
    params.type === 'author' ? 'author' : null;

  // Account / gating
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [notEntitled, setNotEntitled] = useState(false);

  // Recipe state
  const [recipeName, setRecipeName] = useState('');
  const [whyLove, setWhyLove] = useState('');
  const [source, setSource] = useState<'original' | 'third_party' | null>(null);
  const [originalMode, setOriginalMode] = useState<'write' | 'link' | null>(null);
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [recipeLink, setRecipeLink] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [creatorWhere, setCreatorWhere] = useState('');
  const [pairsWellWith, setPairsWellWith] = useState('');

  // Recipe photo upload state.
  // Mirrors profile/index.tsx's uploadPhoto pattern but against the recipe-specific
  // endpoint that returns the final photoUrl in step 1 — no confirm step needed.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLocalUri, setPhotoLocalUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Author/narrator state
  const [featureType, setFeatureType] = useState<'author' | 'narrator' | 'both' | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [whyFeatured, setWhyFeatured] = useState('');
  const [authorLink, setAuthorLink] = useState('');
  const [favoriteBook, setFavoriteBook] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    apiGet<Profile>('/profile')
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        // Optimistic: only block if we have an explicit non-entitled signal.
        // If /profile doesn't return subscription fields yet, let the backend gate.
        if (hasEntitlementSignal(p) && !isEntitled(p)) setNotEntitled(true);
      })
      .catch(() => {
        if (!cancelled) setProfileError("We couldn't load your account just now. Please try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (formType === 'recipe') {
      if (!recipeName.trim()) e.recipeName = 'Please add a recipe name.';
      else if (recipeName.length > RECIPE_NAME_MAX) e.recipeName = `Please keep this under ${RECIPE_NAME_MAX} characters.`;
      if (!whyLove.trim()) e.whyLove = 'Please share why you love it.';
      else if (whyLove.length > WHY_LOVE_MAX) e.whyLove = `Please keep this under ${WHY_LOVE_MAX} characters.`;
      if (!source) e.source = 'Please choose one.';
      if (source === 'original') {
        if (!originalMode) e.originalMode = 'Please choose one.';
        if (originalMode === 'write') {
          if (!ingredients.trim()) e.ingredients = 'Please add the ingredients.';
          if (!instructions.trim()) e.instructions = 'Please add the instructions.';
        } else if (originalMode === 'link') {
          if (!recipeLink.trim()) e.recipeLink = 'Please add a link.';
          else if (!isValidUrl(recipeLink)) e.recipeLink = 'Please add a valid web link (starting with http or https).';
        }
      } else if (source === 'third_party') {
        if (!creatorName.trim()) e.creatorName = "Please add the creator's name.";
        if (!creatorWhere.trim()) e.creatorWhere = 'Please share where to find them.';
        if (!recipeLink.trim()) e.recipeLink = 'Please add a link.';
        else if (!isValidUrl(recipeLink)) e.recipeLink = 'Please add a valid web link (starting with http or https).';
      }
    } else if (formType === 'author') {
      if (!featureType) e.featureType = 'Please choose one.';
      if (!authorName.trim()) e.authorName = 'Please add their name.';
      if (!whyFeatured.trim()) e.whyFeatured = 'Please share why we should feature them.';
      else if (whyFeatured.length > WHY_FEATURED_MAX) e.whyFeatured = `Please keep this under ${WHY_FEATURED_MAX} characters.`;
      if (!authorLink.trim()) e.authorLink = 'Please add a link to their website or social.';
      else if (!isValidUrl(authorLink)) e.authorLink = 'Please add a valid web link (starting with http or https).';
    }
    return e;
  }

  function buildRecipePayload() {
    const p: Record<string, unknown> = {
      recipeName: recipeName.trim(),
      whyYouLoveIt: whyLove.trim(),
      source,
    };
    if (source === 'original') {
      if (originalMode === 'write') {
        p.ingredients = ingredients.trim();
        p.instructions = instructions.trim();
      } else if (originalMode === 'link') {
        p.link = recipeLink.trim();
      }
    } else if (source === 'third_party') {
      p.originalCreatorName = creatorName.trim();
      p.originalCreatorWhereToFind = creatorWhere.trim();
      p.link = recipeLink.trim();
    }
    if (pairsWellWith.trim()) p.pairsWellWith = pairsWellWith.trim();
    if (photoUrl) p.photoUrl = photoUrl;
    return p;
  }

  function buildAuthorPayload() {
    const p: Record<string, unknown> = {
      featureType,
      name: authorName.trim(),
      whyFeatured: whyFeatured.trim(),
      link: authorLink.trim(),
    };
    if (favoriteBook.trim()) p.favoriteBook = favoriteBook.trim();
    return p;
  }

  // Picks a photo, requests a presigned URL via POST /submissions/photo-upload-url,
  // PUTs the blob to S3, and stashes the final CDN URL in form state. Unlike the
  // profile flow, the response carries the final photoUrl directly — there is no
  // confirm step (the recipe submission Lambda accepts it inline on submit).
  async function pickAndUploadPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const contentType = asset.mimeType ?? 'image/jpeg';

      // Reset previous state before starting a fresh upload (handles retry case).
      setPhotoError(null);
      setPhotoUrl(null);
      setPhotoLocalUri(asset.uri);
      setPhotoUploading(true);

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Step 1 — request presigned URL + final photoUrl in one call.
      const { uploadUrl, photoUrl: finalUrl } = await apiPost<{ uploadUrl: string; photoUrl: string }>(
        '/submissions/photo-upload-url',
        { contentType }
      );

      // Step 2 — read local URI as blob (XHR is reliable for local URIs on RN
      // where fetch on file:// / ph:// is platform-flaky; matches profile pattern).
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new Error('Failed to read image file'));
        xhr.responseType = 'blob';
        xhr.open('GET', asset.uri, true);
        xhr.send();
      });

      // Step 3 — PUT directly to S3 using the presigned URL.
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

      // No step 4 — finalUrl from step 1 is already the CDN URL we ship in the submission.
      setPhotoUrl(finalUrl);
      setPhotoLocalUri(null);
    } catch {
      setPhotoError('Photo upload failed. Tap to retry.');
      setPhotoLocalUri(null);
    } finally {
      setPhotoUploading(false);
    }
  }

  function removePhoto() {
    setPhotoUrl(null);
    setPhotoLocalUri(null);
    setPhotoError(null);
  }

  async function handleSubmit() {
    if (submitting) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body = formType === 'recipe'
        ? { type: 'recipe', payload: buildRecipePayload() }
        : { type: 'author_narrator', payload: buildAuthorPayload() };
      await apiPost('/submissions', body);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSubmitted(true);
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const status = parseHttpStatus(err);
      // 401 from deployed Lambda = { error: "Unauthorized" } — token is invalid.
      // Hard sign-out (force: true) wipes auth tokens + biometric pref, then
      // redirect to login. Form data is intentionally lost because the user
      // must re-authenticate before re-submitting.
      if (status === 401) {
        try { await signOut({ force: true }); } catch { /* non-fatal */ }
        router.replace('/(auth)/login' as never);
        return;
      }
      // 403 = entitlement message from the Lambda. Show the soft-block screen.
      if (status === 403) {
        setNotEntitled(true);
        return;
      }
      // 400 (validation_failed / invalid_json), 500 (internal), network errors:
      // generic inline message, form data preserved so the user can fix and retry.
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Render states ----------

  if (!formType) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }]}>
        <Text style={styles.errorText}>This page is missing a type.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.softBackButton}>
          <Text style={styles.softBackButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#B83255" />
      </View>
    );
  }

  if (profileError) {
    return (
      <View style={[styles.container, styles.centered, { paddingHorizontal: spacing.xl }]}>
        <Text style={styles.errorText}>{profileError}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.softBackButton}>
          <Text style={styles.softBackButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (notEntitled) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backChip}>
            <CaretLeft size={16} color="#0F2A48" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{formType === 'recipe' ? 'Share a recipe' : 'Share a spotlight'}</Text>
          <View style={styles.backChip} />
        </View>
        <View style={[styles.centered, { flex: 1, paddingHorizontal: spacing.xl }]}>
          <Text style={styles.gateTitle}>For members</Text>
          <Text style={styles.gateBody}>
            Submissions are open to active members. Your free trial includes this — start it from the home screen.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.8}
            onPress={() => router.replace('/(tabs)/home' as never)}
          >
            <Text style={styles.primaryButtonText}>Go to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={[styles.container, styles.centered, { paddingHorizontal: spacing.xl }]}>
        <Text style={styles.successTitle}>Thank you.</Text>
        <Text style={styles.successBody}>
          We read every submission. If yours is featured, we&apos;ll let you know.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- Main form ----------

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backChip}>
          <CaretLeft size={16} color="#0F2A48" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {formType === 'recipe' ? 'Share a recipe' : 'Share a spotlight'}
        </Text>
        <View style={styles.backChip} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxl + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            {formType === 'recipe'
              ? 'A recipe you love that pairs perfectly with a book, a season, or a mood. Anything you want to share — we read every one.'
              : 'Tell us about an author or narrator we should feature. The more specific the better.'}
          </Text>

          {formType === 'recipe' ? (
            <RecipeFields
              recipeName={recipeName} setRecipeName={setRecipeName}
              whyLove={whyLove} setWhyLove={setWhyLove}
              photoUrl={photoUrl}
              photoLocalUri={photoLocalUri}
              photoUploading={photoUploading}
              photoError={photoError}
              onPickPhoto={pickAndUploadPhoto}
              onRemovePhoto={removePhoto}
              source={source} setSource={(v) => { setSource(v); setOriginalMode(null); }}
              originalMode={originalMode} setOriginalMode={setOriginalMode}
              ingredients={ingredients} setIngredients={setIngredients}
              instructions={instructions} setInstructions={setInstructions}
              recipeLink={recipeLink} setRecipeLink={setRecipeLink}
              creatorName={creatorName} setCreatorName={setCreatorName}
              creatorWhere={creatorWhere} setCreatorWhere={setCreatorWhere}
              pairsWellWith={pairsWellWith} setPairsWellWith={setPairsWellWith}
              errors={errors}
            />
          ) : (
            <AuthorFields
              featureType={featureType} setFeatureType={setFeatureType}
              authorName={authorName} setAuthorName={setAuthorName}
              whyFeatured={whyFeatured} setWhyFeatured={setWhyFeatured}
              authorLink={authorLink} setAuthorLink={setAuthorLink}
              favoriteBook={favoriteBook} setFavoriteBook={setFavoriteBook}
              errors={errors}
            />
          )}

          <Text style={styles.contactNote}>
            If your submission is featured, we&apos;ll be in touch.
          </Text>

          {submitError && <Text style={styles.submitError}>{submitError}</Text>}

          <TouchableOpacity
            style={[styles.primaryButton, (submitting || photoUploading) && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || photoUploading}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Submit</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// =====================================================================
// Field building blocks
// =====================================================================

function Field({
  label, helper, error, count, max, children,
}: {
  label: string;
  helper?: string;
  error?: string;
  count?: number;
  max?: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      {children}
      <View style={styles.fieldFooter}>
        <Text style={styles.fieldErrorText}>{error ?? ''}</Text>
        {typeof count === 'number' && typeof max === 'number' ? (
          <Text style={[styles.counter, count > max && styles.counterOver]}>
            {count} / {max}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RadioGroup<T extends string>({
  value, options, onChange,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.radioGroup}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.radioPill, active && styles.radioPillActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <View style={[styles.radioDot, active && styles.radioDotActive]} />
            <Text style={[styles.radioLabel, active && styles.radioLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// =====================================================================
// Recipe fields
// =====================================================================

type RecipeFieldsProps = {
  recipeName: string; setRecipeName: (v: string) => void;
  whyLove: string; setWhyLove: (v: string) => void;
  photoUrl: string | null;
  photoLocalUri: string | null;
  photoUploading: boolean;
  photoError: string | null;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  source: 'original' | 'third_party' | null;
  setSource: (v: 'original' | 'third_party') => void;
  originalMode: 'write' | 'link' | null;
  setOriginalMode: (v: 'write' | 'link') => void;
  ingredients: string; setIngredients: (v: string) => void;
  instructions: string; setInstructions: (v: string) => void;
  recipeLink: string; setRecipeLink: (v: string) => void;
  creatorName: string; setCreatorName: (v: string) => void;
  creatorWhere: string; setCreatorWhere: (v: string) => void;
  pairsWellWith: string; setPairsWellWith: (v: string) => void;
  errors: Record<string, string>;
};

function RecipeFields(p: RecipeFieldsProps) {
  return (
    <>
      <Field
        label="Recipe name"
        error={p.errors.recipeName}
        count={p.recipeName.length}
        max={RECIPE_NAME_MAX}
      >
        <TextInput
          value={p.recipeName}
          onChangeText={p.setRecipeName}
          placeholder="Grandma's apple crumble"
          placeholderTextColor="#b5a99c"
          style={styles.input}
          maxLength={RECIPE_NAME_MAX + 20}
        />
      </Field>

      <Field
        label="Why you love it"
        error={p.errors.whyLove}
        count={p.whyLove.length}
        max={WHY_LOVE_MAX}
      >
        <TextInput
          value={p.whyLove}
          onChangeText={p.setWhyLove}
          placeholder="The smell alone takes me back to my grandmother's kitchen…"
          placeholderTextColor="#b5a99c"
          style={[styles.input, styles.inputMultiline]}
          multiline
          textAlignVertical="top"
          maxLength={WHY_LOVE_MAX + 40}
        />
      </Field>

      <Field
        label="Photo (optional)"
        helper="A reference photo helps us bring your recipe to life — even a quick snap is perfect."
      >
        {p.photoUrl ? (
          <View>
            <Image source={{ uri: p.photoUrl }} style={styles.photoThumbnail} />
            <TouchableOpacity onPress={p.onRemovePhoto} style={styles.removePhotoButton}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          </View>
        ) : p.photoUploading ? (
          <View style={styles.photoBox}>
            {p.photoLocalUri ? (
              <Image source={{ uri: p.photoLocalUri }} style={[styles.photoThumbnail, styles.photoThumbnailDim]} />
            ) : (
              <View style={[styles.photoThumbnail, styles.photoUploadingBg]} />
            )}
            <View style={styles.photoUploadingOverlay}>
              <ActivityIndicator color="#B83255" />
            </View>
          </View>
        ) : p.photoError ? (
          <TouchableOpacity
            onPress={p.onPickPhoto}
            style={[styles.photoThumbnail, styles.photoErrorBox]}
            activeOpacity={0.85}
          >
            <Text style={styles.photoErrorText}>{p.photoError}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={p.onPickPhoto}
            style={[styles.photoThumbnail, styles.addPhotoButton]}
            activeOpacity={0.85}
          >
            <Text style={styles.addPhotoIcon}>＋</Text>
            <Text style={styles.addPhotoLabel}>Add photo</Text>
          </TouchableOpacity>
        )}
      </Field>

      <Field label="This recipe is…" error={p.errors.source}>
        <RadioGroup
          value={p.source}
          onChange={p.setSource}
          options={[
            { value: 'original', label: 'Mine (original)' },
            { value: 'third_party', label: 'From someone else' },
          ]}
        />
      </Field>

      {p.source === 'original' && (
        <>
          <Field label="How would you like to share it?" error={p.errors.originalMode}>
            <RadioGroup
              value={p.originalMode}
              onChange={p.setOriginalMode}
              options={[
                { value: 'write', label: "I'll write it out" },
                { value: 'link', label: 'I have a link' },
              ]}
            />
          </Field>

          {p.originalMode === 'write' && (
            <>
              <Field label="Ingredients" error={p.errors.ingredients}>
                <TextInput
                  value={p.ingredients}
                  onChangeText={p.setIngredients}
                  placeholder="One ingredient per line…"
                  placeholderTextColor="#b5a99c"
                  style={[styles.input, styles.inputMultiline]}
                  multiline
                  textAlignVertical="top"
                />
              </Field>

              <Field label="Instructions" error={p.errors.instructions}>
                <TextInput
                  value={p.instructions}
                  onChangeText={p.setInstructions}
                  placeholder="Step by step. No need to be fancy."
                  placeholderTextColor="#b5a99c"
                  style={[styles.input, styles.inputMultilineTall]}
                  multiline
                  textAlignVertical="top"
                />
              </Field>
            </>
          )}

          {p.originalMode === 'link' && (
            <Field label="Link to the recipe" error={p.errors.recipeLink}>
              <TextInput
                value={p.recipeLink}
                onChangeText={p.setRecipeLink}
                placeholder="https://…"
                placeholderTextColor="#b5a99c"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Field>
          )}
        </>
      )}

      {p.source === 'third_party' && (
        <>
          <Field label="Original creator's name" error={p.errors.creatorName}>
            <TextInput
              value={p.creatorName}
              onChangeText={p.setCreatorName}
              placeholder="Who made it?"
              placeholderTextColor="#b5a99c"
              style={styles.input}
            />
          </Field>

          <Field
            label="Where to find them"
            helper="Their website, Instagram, blog, etc."
            error={p.errors.creatorWhere}
          >
            <TextInput
              value={p.creatorWhere}
              onChangeText={p.setCreatorWhere}
              placeholder="@theirhandle on Instagram, smittenkitchen.com, etc."
              placeholderTextColor="#b5a99c"
              style={styles.input}
              autoCapitalize="none"
            />
          </Field>

          <Field label="Link to the recipe" error={p.errors.recipeLink}>
            <TextInput
              value={p.recipeLink}
              onChangeText={p.setRecipeLink}
              placeholder="https://…"
              placeholderTextColor="#b5a99c"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
        </>
      )}

      <Field label="Pairs well with" helper="A book, genre, or mood">
        <TextInput
          value={p.pairsWellWith}
          onChangeText={p.setPairsWellWith}
          placeholder="A rainy autumn afternoon with a gothic novel…"
          placeholderTextColor="#b5a99c"
          style={styles.input}
        />
      </Field>
    </>
  );
}

// =====================================================================
// Author / narrator fields
// =====================================================================

type AuthorFieldsProps = {
  featureType: 'author' | 'narrator' | 'both' | null;
  setFeatureType: (v: 'author' | 'narrator' | 'both') => void;
  authorName: string; setAuthorName: (v: string) => void;
  whyFeatured: string; setWhyFeatured: (v: string) => void;
  authorLink: string; setAuthorLink: (v: string) => void;
  favoriteBook: string; setFavoriteBook: (v: string) => void;
  errors: Record<string, string>;
};

function AuthorFields(p: AuthorFieldsProps) {
  return (
    <>
      <Field label="Are they an…" error={p.errors.featureType}>
        <RadioGroup
          value={p.featureType}
          onChange={p.setFeatureType}
          options={[
            { value: 'author', label: 'Author' },
            { value: 'narrator', label: 'Narrator' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </Field>

      <Field label="Their name" error={p.errors.authorName}>
        <TextInput
          value={p.authorName}
          onChangeText={p.setAuthorName}
          placeholder="Their full name"
          placeholderTextColor="#b5a99c"
          style={styles.input}
        />
      </Field>

      <Field
        label="Why we should feature them"
        error={p.errors.whyFeatured}
        count={p.whyFeatured.length}
        max={WHY_FEATURED_MAX}
      >
        <TextInput
          value={p.whyFeatured}
          onChangeText={p.setWhyFeatured}
          placeholder="What makes their work worth knowing?"
          placeholderTextColor="#b5a99c"
          style={[styles.input, styles.inputMultiline]}
          multiline
          textAlignVertical="top"
          maxLength={WHY_FEATURED_MAX + 40}
        />
      </Field>

      <Field label="Link to their website or social media" error={p.errors.authorLink}>
        <TextInput
          value={p.authorLink}
          onChangeText={p.setAuthorLink}
          placeholder="https://…"
          placeholderTextColor="#b5a99c"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </Field>

      <Field label="Your favorite book by them">
        <TextInput
          value={p.favoriteBook}
          onChangeText={p.setFavoriteBook}
          placeholder="Optional"
          placeholderTextColor="#b5a99c"
          style={styles.input}
        />
      </Field>
    </>
  );
}

// =====================================================================
// Styles
// =====================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFAF6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(15,42,72,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18, fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48',
  },

  // Intro
  intro: {
    fontSize: 13, fontWeight: '300', fontStyle: 'italic',
    color: '#6A5969', lineHeight: 20,
    marginBottom: spacing.lg,
  },

  // Field
  field: { marginBottom: spacing.md },
  label: {
    fontSize: 13, color: '#0F2A48',
    fontFamily: 'Nunito_600SemiBold',
    letterSpacing: 0.2, marginBottom: 4,
  },
  helper: {
    fontSize: 12, fontStyle: 'italic',
    color: '#8a7c6e', marginBottom: 8,
  },
  fieldFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 4, minHeight: 16,
  },
  fieldErrorText: {
    flex: 1, fontSize: 12, fontStyle: 'italic', color: '#B83255',
  },
  counter: { fontSize: 11, color: '#9c8f7e', marginLeft: 8 },
  counterOver: { color: '#B83255' },

  // Input
  input: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0d8cc',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15, color: '#0F2A48',
    minHeight: 46,
  },
  inputMultiline: { minHeight: 100, paddingTop: 12 },
  inputMultilineTall: { minHeight: 160, paddingTop: 12 },

  // Radio
  radioGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  radioPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0d8cc',
    borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  radioPillActive: { backgroundColor: '#FDF5F7', borderColor: '#B83255' },
  radioDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: '#c4b6a0',
    backgroundColor: 'transparent',
  },
  radioDotActive: { borderColor: '#B83255', backgroundColor: '#B83255' },
  radioLabel: { fontSize: 13, color: '#3d352e' },
  radioLabelActive: { color: '#B83255', fontFamily: 'Nunito_600SemiBold' },

  // Contact note above submit
  contactNote: {
    fontSize: 12, fontStyle: 'italic',
    color: '#8a7c6e', textAlign: 'center',
    marginTop: spacing.md, marginBottom: spacing.md,
    lineHeight: 18,
  },

  // Submit
  submitError: {
    fontSize: 13, fontStyle: 'italic',
    color: '#B83255', textAlign: 'center',
    marginBottom: spacing.sm,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    backgroundColor: '#B83255',
    alignItems: 'center', justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.xs,
  },
  primaryButtonDisabled: { backgroundColor: '#C4A1AB' },
  primaryButtonText: {
    fontSize: 15, color: '#fff',
    fontFamily: 'Nunito_700Bold', letterSpacing: 0.3,
  },

  // Soft back (error states)
  softBackButton: {
    marginTop: spacing.md,
    borderWidth: 1, borderColor: '#ddd4c8',
    borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  softBackButtonText: { fontSize: 12, color: '#9c8f7e', letterSpacing: 0.4 },

  // Generic error text (centered states)
  errorText: { fontSize: 15, color: '#6A5969', textAlign: 'center' },

  // Not-entitled gate
  gateTitle: {
    fontSize: 26, fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48', marginBottom: spacing.sm,
  },
  gateBody: {
    fontSize: 14, color: '#6A5969',
    lineHeight: 22, textAlign: 'center',
    marginBottom: spacing.lg,
  },

  // Success
  successTitle: {
    fontSize: 32, fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48', marginBottom: spacing.sm,
  },
  successBody: {
    fontSize: 14, color: '#6A5969',
    lineHeight: 22, textAlign: 'center',
    marginBottom: spacing.lg,
  },

  // Photo upload — 160×120 (4:3, ~120 tall) thumbnail size shared across all four states
  // (add / uploading / success / error) so layout doesn't shift between transitions.
  photoBox: {
    width: 160,
    height: 120,
    position: 'relative',
  },
  photoThumbnail: {
    width: 160,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#E6EAF0',
  },
  photoThumbnailDim: { opacity: 0.35 },
  photoUploadingBg: { backgroundColor: '#f0ede4' },
  photoUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,42,72,0.18)',
    borderRadius: 12,
  },
  addPhotoButton: {
    borderWidth: 1,
    borderColor: '#e0d8cc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoIcon: {
    fontSize: 28,
    color: '#B83255',
    lineHeight: 32,
    marginBottom: 2,
  },
  addPhotoLabel: {
    fontSize: 12,
    color: '#B83255',
    fontFamily: 'Nunito_600SemiBold',
    letterSpacing: 0.3,
  },
  photoErrorBox: {
    borderWidth: 1,
    borderColor: '#F0DCE2',
    backgroundColor: '#FDF5F7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  photoErrorText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#B83255',
    textAlign: 'center',
    lineHeight: 16,
  },
  removePhotoButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  removePhotoText: {
    fontSize: 12,
    color: '#9c8f7e',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  },
});
