/**
 * TEMPORARY DEBUG INSTRUMENTATION — remove once the Amazon PurchasingListener
 * stack trace is captured.
 *
 * Full-screen overlay that renders the latest captured IAP error (context, name,
 * code, message, and COMPLETE stack) in selectable text on top of everything
 * (incl. the paywall), with Copy + Dismiss buttons. Intentionally unstyled beyond
 * legibility — this is a debug tool, not product UI.
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  subscribeIapError,
  getLatestIapError,
  clearIapError,
  type CapturedIapError,
} from '../lib/iapDebug';

/** Subscribes to the captured-error store and re-renders on change. */
function useLatestIapError(): CapturedIapError | null {
  const [err, setErr] = useState<CapturedIapError | null>(getLatestIapError());
  useEffect(() => subscribeIapError(setErr), []);
  return err;
}

export default function IapDebugBanner() {
  const err = useLatestIapError();
  if (!err) return null;

  const full =
    `context: ${err.context}\n` +
    `store: ${err.store}\n` +
    `name: ${err.name}\n` +
    `code: ${err.code}\n` +
    `message: ${err.message}\n\n` +
    `stack:\n${err.stack}`;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card} pointerEvents="auto">
        <Text style={styles.title} selectable>
          [IAP_DEBUG] {err.context}
        </Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.body} selectable>
            {full}
          </Text>
        </ScrollView>
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              Clipboard.setStringAsync(full).catch(() => {});
            }}
          >
            <Text style={styles.btnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => clearIapError()}>
            <Text style={styles.btnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    elevation: 999999,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  card: {
    maxHeight: '80%',
    backgroundColor: '#1a1a1a',
    borderColor: '#ff4d4f',
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
  },
  title: {
    color: '#ff4d4f',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  body: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
