import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  AppState,
  Alert,
  type AppStateStatus,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPatch } from '../../lib/api';
import { track } from '../../lib/analytics';
import { spacing } from '../../lib/theme';
import { setFinishedBookPromptEnabled } from '../../lib/finishedBookPromptPreference';
import {
  SPICE_LEVELS,
  TRIGGERS,
  TROPES,
  RATINGS,
  type SpiceKey,
  type TriggerKey,
  type TropeKey,
  type RatingKey,
} from '../../lib/tagTaxonomy';

type SectionId = 'rating' | 'spice' | 'triggers' | 'tropes';

type InitialValues = {
  rating: RatingKey | null;
  userSpiceLevel: SpiceKey | null;
  userTriggers: TriggerKey[];
  userTropes: TropeKey[];
};

type SavedChanges = Partial<InitialValues>;

interface TagBookModalProps {
  visible: boolean;
  onClose: () => void;
  workId: string;
  bookTitle: string;
  initialValues: InitialValues;
  onSaved?: (changes: SavedChanges) => void;
}

export default function TagBookModal({
  visible,
  onClose,
  workId,
  bookTitle,
  initialValues,
  onSaved,
}: TagBookModalProps) {
  const insets = useSafeAreaInsets();

  const [rating, setRating] = useState<RatingKey | null>(initialValues.rating);
  const [spice, setSpice] = useState<SpiceKey | null>(initialValues.userSpiceLevel);
  const [triggers, setTriggers] = useState<TriggerKey[]>(initialValues.userTriggers);
  const [tropes, setTropes] = useState<TropeKey[]>(initialValues.userTropes);

  // Dirty flags — flip true on user interaction, reset to false after commit.
  const [ratingDirty, setRatingDirty] = useState(false);
  const [spiceDirty, setSpiceDirty] = useState(false);
  const [triggersDirty, setTriggersDirty] = useState(false);
  const [tropesDirty, setTropesDirty] = useState(false);

  const [closing, setClosing] = useState(false);

  // Hold latest values in refs so the AppState listener (registered once)
  // always commits the current state, not a stale closure snapshot.
  const latest = useRef({
    rating, spice, triggers, tropes,
    ratingDirty, spiceDirty, triggersDirty, tropesDirty,
  });
  latest.current = {
    rating, spice, triggers, tropes,
    ratingDirty, spiceDirty, triggersDirty, tropesDirty,
  };

  // Track which sections have already committed via scroll-past in this
  // visibility session, so scrolling back up and down doesn't re-fire.
  const scrollCommitted = useRef<Set<SectionId>>(new Set());
  // y-offset + height of each section, recorded onLayout.
  const sectionRects = useRef<Record<SectionId, { y: number; h: number } | undefined>>({
    rating: undefined, spice: undefined, triggers: undefined, tropes: undefined,
  });
  const viewportH = useRef(0);

  // Reset everything when the modal re-opens.
  useEffect(() => {
    if (!visible) return;
    setRating(initialValues.rating);
    setSpice(initialValues.userSpiceLevel);
    setTriggers(initialValues.userTriggers);
    setTropes(initialValues.userTropes);
    setRatingDirty(false);
    setSpiceDirty(false);
    setTriggersDirty(false);
    setTropesDirty(false);
    setClosing(false);
    scrollCommitted.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Shared commit primitive. Reads latest state from refs to stay current.
  const commitDirty = useCallback(
    async (sections: { rating?: boolean; spice?: boolean; triggers?: boolean; tropes?: boolean }) => {
      const cur = latest.current;
      const payload: SavedChanges = {};
      if (sections.rating)   payload.rating         = cur.rating;
      if (sections.spice)    payload.userSpiceLevel = cur.spice;
      if (sections.triggers) payload.userTriggers   = cur.triggers;
      if (sections.tropes)   payload.userTropes     = cur.tropes;

      if (Object.keys(payload).length === 0) return;

      try {
        await apiPatch(`/library/${workId}`, payload);
        if (sections.rating) {
          setRatingDirty(false);
          track('book_tag_committed', { workId, section: 'rating', value: cur.rating });
        }
        if (sections.spice) {
          setSpiceDirty(false);
          track('book_tag_committed', { workId, section: 'spice', value: cur.spice });
        }
        if (sections.triggers) {
          setTriggersDirty(false);
          track('book_tag_committed', { workId, section: 'triggers', value: cur.triggers });
        }
        if (sections.tropes) {
          setTropesDirty(false);
          track('book_tag_committed', { workId, section: 'tropes', value: cur.tropes });
        }
        onSaved?.(payload);
      } catch (err) {
        console.error('Tag commit failed:', err);
        // Leave dirty flags set so the next trigger (Done / next scroll-past
        // boundary / next background) retries. No user-facing toast in v1.0.0.
      }
    },
    [workId, onSaved],
  );

  // Background-flush listener: while the modal is visible, commit anything
  // dirty when the app goes to background/inactive.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'background' && next !== 'inactive') return;
      const cur = latest.current;
      commitDirty({
        rating:   cur.ratingDirty,
        spice:    cur.spiceDirty,
        triggers: cur.triggersDirty,
        tropes:   cur.tropesDirty,
      });
    });
    return () => sub.remove();
  }, [visible, commitDirty]);

  // ─── Selection handlers ─────────────────────────────────────────────────────

  const toggleRating = (k: RatingKey) => {
    setRating((cur) => (cur === k ? null : k));
    setRatingDirty(true);
  };
  const toggleSpice = (k: SpiceKey) => {
    setSpice((cur) => (cur === k ? null : k));
    setSpiceDirty(true);
  };
  const toggleTrigger = (k: TriggerKey) => {
    setTriggers((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
    setTriggersDirty(true);
  };
  const toggleTrope = (k: TropeKey) => {
    setTropes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
    setTropesDirty(true);
  };

  // ─── Scroll-past commit detection ───────────────────────────────────────────

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const visibleBottom = offsetY + viewportH.current;
      const order: SectionId[] = ['rating', 'spice', 'triggers', 'tropes'];
      const cur = latest.current;
      const dirtyMap: Record<SectionId, boolean> = {
        rating: cur.ratingDirty,
        spice: cur.spiceDirty,
        triggers: cur.triggersDirty,
        tropes: cur.tropesDirty,
      };
      for (const id of order) {
        const rect = sectionRects.current[id];
        if (!rect) continue;
        const sectionBottom = rect.y + rect.h;
        if (sectionBottom <= visibleBottom && dirtyMap[id] && !scrollCommitted.current.has(id)) {
          scrollCommitted.current.add(id);
          commitDirty({ [id]: true } as any);
        }
      }
    },
    [commitDirty],
  );

  // ─── Done / X close path ────────────────────────────────────────────────────

  const handleClose = async () => {
    if (closing) return;
    const cur = latest.current;
    const hadChanges = cur.ratingDirty || cur.spiceDirty || cur.triggersDirty || cur.tropesDirty;
    if (hadChanges) {
      setClosing(true);
      await commitDirty({
        rating: cur.ratingDirty,
        spice: cur.spiceDirty,
        triggers: cur.triggersDirty,
        tropes: cur.tropesDirty,
      });
      setClosing(false);
    }
    track('tag_modal_closed', { workId, hadChanges });
    onClose();
  };

  // Same dismiss as handleClose (commits anything the user actually
  // interacted with, records nothing untouched) — separately named/labeled
  // so it reads as an explicit "not now" rather than relying on the X icon.
  const handleSkip = () => {
    track('tag_modal_skipped', { workId });
    handleClose();
  };

  // Confirms before persisting — this stops the modal from auto-opening on
  // every future "Finished" book, not just this one, so it's a bigger
  // commitment than Skip and shouldn't be a stray-tap away from it.
  const handleTurnOffAutoPrompt = () => {
    Alert.alert(
      "Don't ask again?",
      "You can always rate or tag a book later from its detail page.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off',
          style: 'destructive',
          onPress: async () => {
            await setFinishedBookPromptEnabled(false);
            track('tag_modal_auto_prompt_disabled', { workId });
            handleClose();
          },
        },
      ],
    );
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderChip = (
    key: string,
    label: string,
    active: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Tag this book</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>{bookTitle}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
              <X size={22} color="#0F2A48" weight="bold" />
            </TouchableOpacity>
          </View>

          <View style={styles.dismissRow}>
            <TouchableOpacity onPress={handleSkip} hitSlop={8}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleTurnOffAutoPrompt} hitSlop={8}>
              <Text style={styles.turnOffText}>Don't show this again</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            onScroll={handleScroll}
            scrollEventThrottle={64}
            onLayout={(e) => { viewportH.current = e.nativeEvent.layout.height; }}
            showsVerticalScrollIndicator={false}
          >

            {/* SECTION A — RATING */}
            <View
              onLayout={(e) => {
                sectionRects.current.rating = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}
            >
              <Text style={styles.sectionLabel}>How was it?</Text>
              <View style={styles.chipRow}>
                {RATINGS.map((r) =>
                  renderChip(r.key, `${r.emoji} ${r.label}`, rating === r.key, () => toggleRating(r.key)),
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* SECTION B — SPICE */}
            <View
              onLayout={(e) => {
                sectionRects.current.spice = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}
            >
              <Text style={styles.sectionLabel}>How spicy?</Text>
              <View style={styles.chipRow}>
                {SPICE_LEVELS.map((s) =>
                  renderChip(s.key, `${s.emoji} ${s.label}`, spice === s.key, () => toggleSpice(s.key)),
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* SECTION C — TRIGGERS */}
            <View
              onLayout={(e) => {
                sectionRects.current.triggers = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}
            >
              <Text style={styles.sectionLabel}>Anything to know about?</Text>
              <Text style={styles.helperText}>Help warn other readers</Text>
              <View style={styles.chipRow}>
                {TRIGGERS.map((t) =>
                  renderChip(t.key, `${t.emoji} ${t.label}`, triggers.includes(t.key), () => toggleTrigger(t.key)),
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* SECTION D — TROPES */}
            <View
              onLayout={(e) => {
                sectionRects.current.tropes = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}
            >
              <Text style={styles.sectionLabel}>What tropes did you spot?</Text>
              <Text style={styles.helperText}>Optional — tag what stood out</Text>
              <View style={styles.chipRow}>
                {TROPES.map((t) =>
                  renderChip(t.key, `${t.emoji} ${t.label}`, tropes.includes(t.key), () => toggleTrope(t.key)),
                )}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={handleClose}
              disabled={closing}
              activeOpacity={0.85}
            >
              {closing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.doneBtnText}>Done</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CHIP_BG = 'rgba(15,42,72,0.05)';
const CHIP_BG_ACTIVE = '#B83255';
const TEXT_PRIMARY = '#0F2A48';
const MUTED = '#A9C0D4';

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#F0EDE4',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '92%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  headerSubtitle: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#9c8f7e',
    marginTop: 2,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(15,42,72,0.07)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  dismissRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    textDecorationLine: 'underline',
  },
  // Deliberately smaller/muted than Skip — a bigger commitment (stops future
  // auto-prompts entirely, not just this one book), so it shouldn't be
  // visually equal-weight with the low-stakes Skip action next to it.
  turnOffText: {
    fontSize: 12,
    color: '#9c8f7e',
    textDecorationLine: 'underline',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: spacing.sm,
  },
  helperText: {
    fontSize: 12,
    color: '#9c8f7e',
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CHIP_BG,
  },
  chipActive: { backgroundColor: CHIP_BG_ACTIVE },
  chipText: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY, letterSpacing: 0.3 },
  chipTextActive: { color: '#fff' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(15,42,72,0.08)',
    marginVertical: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,42,72,0.06)',
    backgroundColor: '#F0EDE4',
  },
  doneBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: CHIP_BG_ACTIVE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
