import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, useWindowDimensions, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RenderHtml, { CustomRendererProps, TBlock } from 'react-native-render-html';
import { spacing, radius } from '../../lib/theme';

const DOC_LABELS: Record<string, string> = {
  'terms-of-use':          'Terms of Service',
  'privacy-policy':        'Privacy Policy',
  'community-guidelines':  'Community Guidelines',
  'reporting-enforcement': 'Reporting & Enforcement',
};

const DOC_URLS: Record<string, string> = {
  'terms-of-use':          'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/terms-of-use.html',
  'privacy-policy':        'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/privacy-policy.html',
  'community-guidelines':  'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/community-guidelines.html',
  'reporting-enforcement': 'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/reporting-enforcement.html',
};

const HTML_STYLES = {
  body:   { color: '#3d352e', fontSize: 15, lineHeight: 24 },
  h1:     { fontSize: 22, fontWeight: '700' as const, color: '#0F2A48', marginTop: 24, marginBottom: 8 },
  h2:     { fontSize: 18, fontWeight: '700' as const, color: '#0F2A48', marginTop: 20, marginBottom: 6 },
  h3:     { fontSize: 15, fontWeight: '700' as const, color: '#0F2A48', marginTop: 16, marginBottom: 4 },
  p:      { marginBottom: 12 },
  a:      { color: '#6B9AB8', textDecorationLine: 'underline' as const },
  strong: { fontWeight: '700' as const, color: '#0F2A48' },
  b:      { fontWeight: '700' as const, color: '#0F2A48' },
  ul:     { marginBottom: 12 },
  ol:     { marginBottom: 12 },
  li:     { marginBottom: 4 },
};

// Suppress <img> tags — prevents react-native-render-html from calling
// Image.getSize(), which caused "Property 'Image' doesn't exist" on Hermes.
const IMG_RENDERER = () => null;
const CUSTOM_RENDERERS = { img: IMG_RENDERER };

/** Strip <html>/<head>/<body> wrappers so RNRH only sees content. */
function extractBody(raw: string): string {
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  // No <body> tag — might already be a fragment
  return raw;
}

export default function LegalDocScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { width } = useWindowDimensions();

  const [html,       setHtml]       = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const title = DOC_LABELS[doc ?? ''] ?? 'Legal Document';
  const url   = DOC_URLS[doc ?? ''];

  useEffect(() => {
    if (!url) {
      setError('Document not found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((raw) => setHtml(extractBody(raw)))
      .catch((e) => {
        console.error('[legal] fetch error:', e?.message ?? e);
        setError("Couldn't load this document. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [url, retryCount]);

  const handleLink = useCallback((href: string) => {
    if (!href || href.startsWith('#')) return;
    if (href.startsWith('mailto:')) {
      Linking.openURL(href).catch(() => {});
      return;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      Linking.openURL(href).catch(() => {});
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/acceptance' as any)}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F2A48" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setRetryCount((c) => c + 1)}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/acceptance' as any)}
          >
            <Text style={styles.goBackText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <RenderHtml
            contentWidth={width - spacing.lg * 2}
            source={{ html: html ?? '' }}
            tagsStyles={HTML_STYLES}
            renderers={CUSTOM_RENDERERS}
            enableExperimentalMarginCollapsing
            renderersProps={{
              a: {
                onPress(_e: any, href: string) { handleLink(href); },
              },
            }}
          />
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#A9C0D4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,42,72,0.12)',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15,42,72,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 18,
    color: '#0F2A48',
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2A48',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: 15,
    color: '#0F2A48',
    textAlign: 'center',
    opacity: 0.8,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: '#0F2A48',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  goBackText: {
    fontSize: 14,
    color: '#0F2A48',
    opacity: 0.7,
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
