import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { apiPost } from '../../lib/api';
import { spacing, radius } from '../../lib/theme';

const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'spam', label: 'Spam' },
  { value: 'explicit_content', label: 'Explicit content' },
  { value: 'threats', label: 'Threats' },
  { value: 'other', label: 'Other' },
];

type PostMenuProps = {
  threadId: string;
  replyId: string;
  targetUserId: string;
  displayName: string;
  isOwn: boolean;
  onBlocked: (userId: string) => void;
  onToast: (msg: string) => void;
};

export default function PostMenu({
  threadId, replyId, targetUserId, displayName, isOwn, onBlocked, onToast,
}: PostMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isOwn) return null;

  const handleReport = async () => {
    if (!selectedReason || submitting) return;
    setSubmitting(true);
    try {
      await apiPost('/lounge/report-post', { threadId, replyId, reason: selectedReason });
      setReportOpen(false);
      setSelectedReason(null);
      onToast('Report submitted. Thank you.');
    } catch {
      onToast('Could not submit report. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async () => {
    setMenuOpen(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await apiPost('/lounge/block-user', { blockedUserId: targetUserId, action: 'block' });
      onBlocked(targetUserId);
      onToast(`${displayName} has been blocked.`);
    } catch {
      onToast('Could not block user. Try again.');
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => { Haptics.selectionAsync(); setMenuOpen(true); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.triggerText}>···</Text>
      </TouchableOpacity>

      {/* Contextual action menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); setReportOpen(true); }}
            >
              <Text style={styles.menuItemText}>🚩  Report post</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
              <Text style={[styles.menuItemText, { color: '#B83255' }]}>🚫  Block {displayName}</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuOpen(false)}>
              <Text style={[styles.menuItemText, { color: '#B09A7E' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Report reason bottom sheet */}
      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setReportOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Report Post</Text>
            <Text style={styles.sheetSub}>What's the issue with this post?</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.reasonRow, selectedReason === r.value && styles.reasonRowActive]}
                onPress={() => setSelectedReason(r.value)}
              >
                <View style={[styles.radio, selectedReason === r.value && styles.radioActive]}>
                  {selectedReason === r.value && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.reasonText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.submitBtn, (!selectedReason || submitting) && styles.submitBtnDisabled]}
              onPress={handleReport}
              disabled={!selectedReason || submitting}
            >
              <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit Report'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setReportOpen(false); setSelectedReason(null); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { paddingHorizontal: 6, paddingVertical: 2 },
  triggerText: { fontSize: 13, color: '#B09A7E', letterSpacing: 1.5 },
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  menu: {
    backgroundColor: '#FDFAF6', borderRadius: 14, width: 240, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  menuItem: { paddingHorizontal: spacing.lg, paddingVertical: 14 },
  menuItemText: { fontSize: 15, color: '#3A2C28', fontFamily: 'Nunito_600SemiBold' },
  menuSep: { height: 1, backgroundColor: '#EDE8DF' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FDFAF6', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, paddingBottom: 40,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD5C4',
    alignSelf: 'center', marginBottom: spacing.lg,
  },
  sheetTitle: { fontSize: 18, color: '#1A1A2E', fontFamily: 'Nunito_700Bold', marginBottom: 4 },
  sheetSub: { fontSize: 13, color: '#B09A7E', fontFamily: 'Nunito_400Regular', marginBottom: spacing.md },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, marginBottom: 2,
  },
  reasonRowActive: { backgroundColor: 'rgba(184,50,85,0.06)' },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5,
    borderColor: '#B83255', alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { backgroundColor: '#B83255', borderColor: '#B83255' },
  radioDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  reasonText: { fontSize: 14, color: '#3A2C28', fontFamily: 'Nunito_400Regular' },
  submitBtn: {
    backgroundColor: '#B83255', borderRadius: 999, paddingVertical: 12,
    alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm,
  },
  submitBtnDisabled: { backgroundColor: '#DDD5C4' },
  submitBtnText: { fontSize: 14, color: '#fff', fontFamily: 'Nunito_700Bold' },
  cancelText: {
    textAlign: 'center', fontSize: 13, color: '#B09A7E',
    fontFamily: 'Nunito_400Regular', paddingVertical: spacing.sm,
  },
});
