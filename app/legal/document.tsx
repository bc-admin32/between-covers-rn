import { useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { CaretLeft } from 'phosphor-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { spacing } from '../../lib/theme';

const DOC_URLS: Record<string, string> = {
  'terms-of-use':          'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/terms-of-use.html',
  'privacy-policy':        'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/privacy-policy.html',
  'community-guidelines':  'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/community-guidelines.html',
  'reporting-enforcement': 'https://betweencovers-legal-documents.s3.us-east-1.amazonaws.com/reporting-enforcement.html',
};

// Accept both short and full key forms
const NORMALIZE: Record<string, string> = {
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

  const doc = NORMALIZE[params.doc ?? ''] ?? params.doc ?? '';
  const url = DOC_URLS[doc];

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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <CaretLeft size={20} color="#0F2A48" weight="bold" />
        </TouchableOpacity>
      </View>

      {!url ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Document not found.</Text>
          <TouchableOpacity onPress={() => router.back()}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,42,72,0.1)',
    backgroundColor: '#F0EDE4',
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(15,42,72,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  webView:        { flex: 1, backgroundColor: '#F0EDE4' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0EDE4' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  errorText:      { fontSize: 14, color: '#9c8f7e', textAlign: 'center' },
  goBackText:     { fontSize: 13, color: '#6B9AB8', textDecorationLine: 'underline' },
});
