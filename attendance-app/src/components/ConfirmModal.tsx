import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET } from '../theme/responsive';
import { THEME } from '../theme/colors';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'success' | 'danger';
  showCancel?: boolean;
  showButtons?: boolean;
  autoCloseMs?: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  showCancel = true,
  showButtons = true,
  autoCloseMs,
  onConfirm,
  onCancel,
}: Props) {
  const isDanger = variant === 'danger';
  const isSuccess = variant === 'success';

  useEffect(() => {
    if (!visible || !autoCloseMs) return;
    const timer = setTimeout(() => {
      onCancel();
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [visible, autoCloseMs, onCancel]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()}>
          <ScrollView
            contentContainerStyle={styles.cardBody}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {isDanger && (
              <View style={styles.failBadge}>
                <Text style={styles.failBadgeText}>✕</Text>
              </View>
            )}
            {isSuccess && (
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>✓</Text>
              </View>
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </ScrollView>
          {showButtons && (
            <View style={styles.row}>
              {showCancel && (
                <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
                  <Text style={styles.cancelText}>{cancelLabel}</Text>
                </Pressable>
              )}
              <Pressable
                style={[
                  styles.ok,
                  isDanger && styles.okDanger,
                  !showCancel && styles.okFullWidth,
                ]}
                onPress={onConfirm}
                accessibilityRole="button"
              >
                <Text style={styles.okText} numberOfLines={1}>
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    backgroundColor: THEME.cardSolid,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  cardBody: { paddingBottom: 16 },
  failBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(244, 63, 94, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  failBadgeText: {
    color: THEME.rose,
    fontSize: 20,
    fontWeight: '900',
  },
  successBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successBadgeText: {
    color: THEME.emerald,
    fontSize: 22,
    fontWeight: '900',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: -0.2 },
  message: { color: THEME.textSecondary, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 12 },
  cancel: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelText: { color: THEME.textMuted, fontSize: 15, fontWeight: '700' },
  ok: {
    flex: 1.4,
    minHeight: TAP_TARGET,
    backgroundColor: THEME.emerald,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: THEME.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  okDanger: {
    backgroundColor: THEME.rose,
    shadowColor: THEME.rose,
  },
  okFullWidth: {
    flex: 1,
  },
  okText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

