import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { spacing, colors } from '../../../../../lib/theme';

const API_BASE = 'https://api.betweencovers.app';

const DOC_LABELS: Record<string, string> = {
  'terms-of-use': 'Terms of Service',
  'privacy-policy': 'Privacy Policy',
  'community-guidelines': 'Community Guidelines',
  'reporting-enforcement': 'Reporting & Enforcement',
};

type Section = {
  heading?: string;
  body: string;
};

export default function LegalDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();

  const [sections, setSections] = useState<Section[]>([]);
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const label = DOC_LABELS[doc ?? ''] ?? 'Legal';

  useEffect(() => {
    if (!doc || !DOC_LABELS[doc]) {
      setError('Document not found.');
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/legal?doc=${encodeURIComponent(doc)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.html) {
          setRawHtml(data.html);
          const parsed = parseHtmlToSections(data.html);
          setSections(parsed);
        } else {
          setError('Document unavailable right now.');
        }
      })
      .catch(() => setError("Couldn't load the document. Please try again."))
      .finally(() => setLoading(false));
  }, [doc]);

  function parseHtmlToSections(html: string): Section[] {
    const result: Section[] = [];
    const stripped = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
    const parts = stripped.split(headingRegex);

    if (parts.length <= 1) {
      result.push({ body: stripTags(stripped) });
      return result;
    }

    let i = 0;
    if (parts[0].trim()) {
      result.push({ body: stripTags(parts[0]) });
      i = 1;
    } else {
      i = 1;
    }

    while (i < parts.length) {
      const heading = stripTags(parts[i] ?? '');
      const body = stripTags(parts[i + 1] ?? '');
      if (heading || body) {
        result.push({ heading: heading || undefined, body });
      }
      i += 2;
    }

    return result;
  }

  function stripTags(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{label}</Text>
        <View style={styles.titleDivider} />
      </View>
      <View style={styles.curve} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.errorLink}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sections.map((section, index) => (
            <View key={index} style={styles.section}>
              {section.heading && (
                <Text style={styles.sectionHeading}>{section.heading}</Text>
              )}
              {section.body ? (
                <Text style={styles.sectionBody}>{section.body}</Text>
              ) : null}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  header: { backgroundColor: '#6B9AB8', padding: spacing.lg, paddingTop: spacing.md },
  backButton: { marginBottom: spacing.lg },
  backArrow: { fontSize: 20, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  title: { fontSize: 28, fontStyle: 'italic', color: '#F0EDE4', lineHeight: 34 },
  titleDivider: { width: 40, height: 1, backgroundColor: 'rgba(184,50,85,0.6)', marginTop: 10 },
  curve: { height: 20, backgroundColor: '#F0EDE4', borderTopLeftRadius: 999, borderTopRightRadius: 999, marginTop: -20 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionHeading: { fontSize: 20, fontWeight: '500', fontStyle: 'italic', color: '#0F2A48', marginBottom: spacing.sm, lineHeight: 26 },
  sectionBody: { fontSize: 14, color: '#3d352e', lineHeight: 24 },
  errorState: { paddingTop: 64, alignItems: 'center', gap: spacing.md },
  errorText: { fontSize: 14, color: '#9c8f7e', textAlign: 'center' },
  errorLink: { fontSize: 13, color: '#6B9AB8', textDecorationLine: 'underline' },
});