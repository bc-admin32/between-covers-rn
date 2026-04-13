import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, useWindowDimensions, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RenderHtml from 'react-native-render-html';
import { spacing, radius } from '../../../../../lib/theme';

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

const SHORT_PATH: Record<string, string> = {
  'terms':                 'terms-of-use',
  'terms-of-use':          'terms-of-use',
  'privacy':               'privacy-policy',
  'privacy-policy':        'privacy-policy',
  'community':             'community-guidelines',
  'community-guidelines':  'community-guidelines',
  'reporting':             'reporting-enforcement',
  'reporting-enforcement': 'reporting-enforcement',
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

const IGNORED_TAGS = ['img', 'figure', 'picture'];

function extractBody(raw: string): string {
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  return raw;
}

export default function LegalDocumentScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ doc?: string }>();
  const { width } = useWindowDimensions();

  const doc   = SHORT_PATH[params.doc ?? ''] ?? params.doc ?? '';
  const label = DOC_LABELS[doc] ?? 'Legal';
  const url   = DOC_URLS[doc];

  const [html,       setHtml]       = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!url) { setError('Document not found.'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(url)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); })
      .then((raw) => setHtml(extractBody(raw)))
      .catch(() => setError("Couldn't load this document. Please try again."))
      .finally(() => setLoading(false));
  }, [url, retryCount]);

  const handleLink = useCallback((href: string) => {
    if (!href || href.startsWith('#')) return;
    if (href.startsWith('mailto:') || href.startsWith('http://') || href.startsWith('https://')) {
      Linking.openURL(href).catch(() => {});
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile/legal' as any)}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.titleText}>{label}</Text>
        <View style={styles.titleDivider} />
      </View>
      <View style={styles.curve} />

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
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile/legal' as any)}>
            <Text style={styles.goBackText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <RenderHtml
            contentWidth={width - spacing.lg * 2}
            source={{ html: html ?? '' }}
            tagsStyles={HTML_STYLES}
            ignoredDomTags={IGNORED_TAGS}
            enableExperimentalMarginCollapsing
            renderersProps={{
              a: {
                onPress(_e: any, href: string) { handleLink(href); },
              },
            }}
          />
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F0EDE4' },
  header:       { backgroundColor: '#6B9AB8', padding: spacing.lg, paddingTop: spacing.md },
  backButton:   { marginBottom: spacing.lg },
  backArrow:    { fontSize: 20, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  titleText:    { fontSize: 28, fontStyle: 'italic', color: '#F0EDE4', lineHeight: 34 },
  titleDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 10 },
  curve:        { height: 20, backgroundColor: '#F0EDE4', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  errorText:    { fontSize: 14, color: '#9c8f7e', textAlign: 'center' },
  retryButton:  { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: '#0F2A48' },
  retryText:    { fontSize: 14, fontWeight: '600', color: '#fff' },
  goBackText:   { fontSize: 13, color: '#6B9AB8', textDecorationLine: 'underline', marginTop: 4 },
});
