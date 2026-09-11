import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.ok} onPress={onConfirm}>
              <Text style={styles.okText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#152238',
    borderRadius: 16,
    padding: 22,
  },
  title: { color: '#f4f7fb', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  message: { color: '#c5d2e4', fontSize: 16, lineHeight: 22, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancel: { paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { color: '#9fb0c8', fontSize: 16 },
  ok: {
    backgroundColor: '#1f8a70',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  okText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
