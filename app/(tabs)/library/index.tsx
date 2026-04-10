import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiGet } from '../../../lib/api';
import { spacing, radius, colors } from '../../../lib/theme';

type LibraryItem = {
  workId: string;
  title: string;
  primaryAuthor: string;
  coverUrl: string;
  status: 'CURRENTLY_READING' | 'WANT_TO_READ' | 'FINISHED';
  currentPage?: number;
  totalPages?: number;
  finishedAt?: string;
};

type LibrarySnapshot = {
  reading: number;
  wishlist: number;
  finished: number;
};

type LibrarySnapshotResponse = {
  displayName: string;
  snapshot: LibrarySnapshot;
};

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LibraryItem['status'] | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [gridView, setGridView] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [snapshotRes, libraryRes] = await Promise.all([
          apiGet<LibrarySnapshotResponse>('/library/snapshot'),
          apiGet<{ items: LibraryItem[] }>('/library?sort=title&order=asc'),
        ]);
        setSnapshot(snapshotRes.snapshot);
        setUserName(snapshotRes.displayName || null);
        setItems(libraryRes.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    async function reload() {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('sort', 'title');
      params.set('order', sortAsc ? 'asc' : 'desc');
      try {
        const res = await apiGet<{ items: LibraryItem[] }>(`/library?${params.toString()}`);
        setItems(res.items || []);
      } catch {
        setItems([]);
      }
    }
    reload();
  }, [statusFilter, sortAsc]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {loaded ? (userName ? `${userName}'s Library` : 'My Library') : ''}
          </Text>
          <Text style={styles.subtitle}>Your personal collection</Text>
        </View>

        <View style={styles.divider} />

        {/* FILTER PILLS */}
        {snapshot && (
          <View style={styles.filterRow}>
            <FilterPill
              label="Reading"
              count={snapshot.reading}
              active={statusFilter === 'CURRENTLY_READING'}
              onPress={() => setStatusFilter(statusFilter === 'CURRENTLY_READING' ? null : 'CURRENTLY_READING')}
            />
            <FilterPill
              label="Wishlist"
              count={snapshot.wishlist}
              active={statusFilter === 'WANT_TO_READ'}
              onPress={() => setStatusFilter(statusFilter === 'WANT_TO_READ' ? null : 'WANT_TO_READ')}
            />
            <FilterPill
              label="Finished"
              count={snapshot.finished}
              active={statusFilter === 'FINISHED'}
              onPress={() => setStatusFilter(statusFilter === 'FINISHED' ? null : 'FINISHED')}
            />
          </View>
        )}

        {/* ACTION ROW */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.sortButton} onPress={() => setSortAsc(!sortAsc)}>
            <Ionicons name="swap-vertical" size={18} color="#0F2A48" />
            <Text style={styles.sortText}>{sortAsc ? 'A–Z' : 'Z–A'}</Text>
          </TouchableOpacity>

          <View style={styles.viewButtons}>
            <TouchableOpacity
              style={[styles.viewButton, gridView && styles.viewButtonActive]}
              onPress={() => setGridView(true)}
            >
              <Ionicons name="grid" size={18} color={gridView ? '#B83255' : '#0F2A48'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewButton, !gridView && styles.viewButtonActive]}
              onPress={() => setGridView(false)}
            >
              <Ionicons name="list" size={18} color={!gridView ? '#B83255' : '#0F2A48'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/(tabs)/library/discover' as any)}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTENT */}
        <View style={styles.content}>
          {!loaded && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )}

          {loaded && items.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={36} color="#A9C0D4" />
              <Text style={styles.emptyText}>
                {statusFilter ? 'No books in this category yet.' : 'Your library is empty.'}
              </Text>
              <TouchableOpacity
                style={styles.discoverButton}
                onPress={() => router.push('/(tabs)/library/discover' as any)}
              >
                <Text style={styles.discoverButtonText}>Discover Books</Text>
              </TouchableOpacity>
            </View>
          )}

          {loaded && items.length > 0 && gridView && (
            <View style={styles.grid}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.workId}
                  style={styles.gridItem}
                  onPress={() => router.push(`/(tabs)/library/details?workId=${item.workId}` as any)}
                >
                  <View style={styles.coverWrapper}>
                    {item.coverUrl ? (
                      <Image source={{ uri: item.coverUrl }} style={styles.coverImage} />
                    ) : (
                      <View style={[styles.coverImage, styles.noCover]}>
                        <Ionicons name="book" size={24} color="#A9C0D4" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>{item.primaryAuthor}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {loaded && items.length > 0 && !gridView && (
            <View style={styles.list}>
              {items.map((item, i) => (
                <TouchableOpacity
                  key={item.workId}
                  style={[
                    styles.listItem,
                    i === 0 && styles.listItemFirst,
                    i === items.length - 1 && styles.listItemLast,
                  ]}
                  onPress={() => router.push(`/(tabs)/library/details?workId=${item.workId}` as any)}
                >
                  <View style={styles.listCover}>
                    {item.coverUrl ? (
                      <Image source={{ uri: item.coverUrl }} style={styles.listCoverImage} />
                    ) : (
                      <View style={[styles.listCoverImage, styles.noCover]}>
                        <Ionicons name="book" size={16} color="#A9C0D4" />
                      </View>
                    )}
                  </View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.listAuthor} numberOfLines={1}>{item.primaryAuthor}</Text>
                  </View>
                  {item.status === 'CURRENTLY_READING' && item.currentPage && (
                    <Text style={styles.listMeta}>p. {item.currentPage}</Text>
                  )}
                  {item.status === 'FINISHED' && item.finishedAt && (
                    <Text style={styles.listMeta}>
                      {new Date(item.finishedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function FilterPill({ label, count, active, onPress }: {
  label: string; count: number; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterPill, active && styles.filterPillActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EDE4' },
  header: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg },
  title: { fontSize: 30, color: '#B83255', fontStyle: 'italic', fontWeight: '700' },
  subtitle: { fontSize: 11, color: 'rgba(106,89,105,0.7)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(15,42,72,0.08)', marginHorizontal: spacing.lg, marginVertical: spacing.sm },
  filterRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: spacing.sm },
  filterPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: '#D7E2E9' },
  filterPillActive: { backgroundColor: '#0F2A48' },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#0F2A48' },
  filterPillTextActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortText: { fontSize: 11, fontWeight: '700', color: '#0F2A48', textTransform: 'uppercase', letterSpacing: 0.5 },
  viewButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewButton: { padding: 6, borderRadius: radius.sm },
  viewButtonActive: { backgroundColor: 'rgba(184,50,85,0.1)' },
  addButton: { padding: 6, borderRadius: radius.sm, backgroundColor: '#0F2A48', marginLeft: 4 },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: 80, gap: spacing.md },
  emptyText: { fontSize: 14, color: '#6A5969', fontWeight: '300' },
  discoverButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: '#0F2A48' },
  discoverButtonText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '30%' },
  coverWrapper: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#D7E2E9', shadowColor: '#0F2A48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3, marginBottom: 4 },
  coverImage: { width: '100%', height: '100%' },
  noCover: { alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 10, fontWeight: '700', color: '#0F2A48', lineHeight: 14, marginBottom: 2 },
  bookAuthor: { fontSize: 9, fontWeight: '400', color: '#9c8f7e' },
  list: { gap: 1 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fff', paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 4 },
  listItemFirst: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  listItemLast: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  listCover: { width: 40, height: 56, borderRadius: 6, overflow: 'hidden', flexShrink: 0, backgroundColor: '#D7E2E9' },
  listCoverImage: { width: 40, height: 56 },
  listInfo: { flex: 1 },
  listTitle: { fontSize: 13, fontWeight: '600', color: '#0F2A48', lineHeight: 18 },
  listAuthor: { fontSize: 11, fontWeight: '300', color: '#9c8f7e', marginTop: 2 },
  listMeta: { fontSize: 10, fontWeight: '700', color: '#B83255', flexShrink: 0 },
});