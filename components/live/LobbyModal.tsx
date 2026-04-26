import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// LobbyModal — placeholder for the multi-room IRIS_LIVE speakeasy.
// The full lobby UI (rotating Iris taglines, room tiles with descriptions,
// "Doors open in M:SS" countdown, "Call it a Night (Tab Please)" close)
// lands once the backend exposes rooms[] + roomStates on /live/active and
// /live/{eventId}, plus POST /live/{eventId}/rooms/{roomId}/join and
// POST /live/{eventId}/rooms/leave. Until then this stub just confirms the
// home-banner → lobby tap dispatch fires for multi-room events.

type LobbyModalProps = {
  eventId: string;
  visible: boolean;
  onClose: () => void;
};

export default function LobbyModal({ eventId, visible, onClose }: LobbyModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Multi-room coming soon</Text>
          <Text style={styles.body}>
            The Game Room is being set up. Iris will be ready for you in a bit.
          </Text>
          <Text style={styles.subtle}>Event: {eventId}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,42,72,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FDFAF6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 14,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D7E2E9' },
  title: {
    fontSize: 22,
    fontFamily: 'Cormorant_700Bold_Italic',
    color: '#0F2A48',
    textAlign: 'center',
    marginTop: 12,
  },
  body: {
    fontSize: 14,
    fontWeight: '300',
    color: '#3d352e',
    lineHeight: 22,
    textAlign: 'center',
  },
  subtle: { fontSize: 11, color: '#9c8f7e', fontStyle: 'italic' },
  closeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: '#B83255',
    marginTop: 8,
  },
  closeBtnText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});
