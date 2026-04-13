import { useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
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

export default function LegalDocumentScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ doc?: string }>();
  const webViewRef = useRef<WebView>(null);

  const doc   = SHORT_PATH[params.doc ?? ''] ?? params.doc ?? '';
  const label = DOC_LABELS[doc] ?? 'Legal';
  const url   = DOC_URLS[doc];

  const handleShouldStartLoadWithRequest = useCallback((request: any) => {
    const reqUrl: string = request.url;
    if (reqUrl === url) return true;
    if (reqUrl.startsWith('mailto:') || reqUrl.startsWith('http://') || reqUrl.startsWith('https://')) {
      Linking.openURL(reqUrl).catch(() => {});
      return false;
    }
    return false;
  }, [url]);

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

      {!url ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Document not found.</Text>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile/legal' as any)}>
            <Text style={styles.goBackText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#0F2A48" />
            </View>
          )}
          style={styles.webView}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F0EDE4' },
  header:         { backgroundColor: '#6B9AB8', padding: spacing.lg, paddingTop: spacing.md },
  backButton:     { marginBottom: spacing.lg },
  backArrow:      { fontSize: 20, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  titleText:      { fontSize: 28, fontStyle: 'italic', color: '#F0EDE4', lineHeight: 34 },
  titleDivider:   { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 10 },
  curve:          { height: 20, backgroundColor: '#F0EDE4', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  webView:        { flex: 1, backgroundColor: '#F0EDE4' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0EDE4' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  errorText:      { fontSize: 14, color: '#9c8f7e', textAlign: 'center' },
  goBackText:     { fontSize: 13, color: '#6B9AB8', textDecorationLine: 'underline', marginTop: 4 },
});
