// Maps an original CDN upload URL to its backend-generated optimized variant
// (resized + converted to WebP by a Lambda triggered on S3 upload to
// betweencovers-user-images — covers user-uploads-lounge/, profile-photos/,
// and recipe-submissions/, no per-prefix logic needed since it's a pure
// string transform). Non-CDN URLs (static/admin assets on other buckets)
// pass through unchanged, since the regex only matches the cdn.betweencovers.app
// host — safe to call on any URL, not just ones known to be optimized.
//
// Optimization runs async after upload (1-3s typical) — there's always a
// window where the optimized variant doesn't exist yet. Never use this
// without a fallback to the original on load failure; see
// components/OptimizedImage.tsx, which wraps this with exactly that.
export function toOptimizedUrl(originalUrl: string): string {
  return originalUrl.replace(
    /^(https:\/\/cdn\.betweencovers\.app\/)(.+)\.[^.]+$/,
    (_, host, path) => `${host}optimized/${path}.webp`,
  );
}
