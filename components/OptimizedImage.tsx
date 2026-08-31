import { useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { toOptimizedUrl } from '../lib/media';

/**
 * Drop-in for expo-image's <Image> for any URL that may have a
 * backend-optimized (resized + WebP) variant — i.e. anything under
 * betweencovers-user-images (Lounge reply media, profile photos, recipe
 * submissions). Requests the optimized URL first; falls back to the raw
 * original on load failure, since optimization runs async after upload and
 * the variant may not exist yet (typically 1-3s window).
 *
 * Takes `uri` instead of expo-image's `source` prop — every call site in
 * this app already passes a plain string URL (`source={{ uri: x }}`), so
 * this is a closer drop-in for how the codebase actually uses <Image> than
 * mirroring the full, more flexible `source` union would be. All other
 * expo-image props pass through unchanged.
 *
 * Do NOT use this for static/admin-authored images (book covers, Cozy
 * editorial content, bundled/branding assets) — those never have an
 * `optimized/` variant, so this would just add one guaranteed-failing
 * request before falling back. Use plain expo-image `<Image>` for those.
 */
type OptimizedImageProps = Omit<ImageProps, 'source' | 'onError'> & {
  uri: string;
  onError?: ImageProps['onError'];
};

export function OptimizedImage({ uri, onError, ...rest }: OptimizedImageProps) {
  // Tracks which uri we've already fallen back for — NOT a plain boolean —
  // so that if this component instance gets recycled for a different uri
  // (list re-render, key reuse), the fallback from a previous item's
  // failure doesn't incorrectly suppress the optimized attempt for the new
  // one. Comparing against the current uri makes this self-resetting with
  // no extra effect needed.
  const [fellBackFor, setFellBackFor] = useState<string | null>(null);
  const useOriginal = fellBackFor === uri;
  const resolvedUri = useOriginal ? uri : toOptimizedUrl(uri);

  return (
    <Image
      {...rest}
      source={{ uri: resolvedUri }}
      onError={(error) => {
        if (!useOriginal) setFellBackFor(uri);
        onError?.(error);
      }}
    />
  );
}
