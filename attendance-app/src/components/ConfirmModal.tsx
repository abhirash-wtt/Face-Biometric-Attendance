import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET } from '../theme/responsive';

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
          <ScrollView
            contentContainerStyle={styles.cardBody}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </ScrollView>
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.ok} onPress={onConfirm} accessibilityRole="button">
              <Text style={styles.okText} numberOfLines={1}>
                {confirmLabel}
              </Text>
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
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    // Long messages scroll inside the card instead of pushing the buttons off screen.
    maxHeight: '86%',
    backgroundColor: '#152238',
    borderRadius: 16,
    padding: 20,
  },
  cardBody: { paddingBottom: 16 },
  title: { color: '#f4f7fb', fontSize: 21, fontWeight: '700', marginBottom: 8 },
  message: { color: '#c5d2e4', fontSize: 16, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 10 },
  cancel: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelText: { color: '#9fb0c8', fontSize: 16, fontWeight: '700' },
  ok: {
    flex: 1.4,
    minHeight: TAP_TARGET,
    backgroundColor: '#1f8a70',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  okText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
