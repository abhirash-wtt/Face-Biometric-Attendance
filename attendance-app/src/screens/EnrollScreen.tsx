import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView } from '../components/CameraView';
import { ConfirmModal } from '../components/ConfirmModal';
import { api, Employee, WorkingMode } from '../services/api';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';

const WORKING_MODE_OPTIONS: Array<{ value: WorkingMode; label: string }> = [
  { value: 'onsite', label: 'On-site' },
  { value: 'remote', label: 'Remote' },
];

export function EnrollScreen() {
  const layout = useLayout();
  const [q, setQ] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [samples, setSamples] = useState(0);
  const [message, setMessage] = useState('Select an employee, then capture 3–10 face samples.');
  const [busy, setBusy] = useState(false);
  const [modeBusyId, setModeBusyId] = useState<string | null>(null);
  const [modeMenuFor, setModeMenuFor] = useState<Employee | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const maxSamples = 10;
  const captureRef = React.useRef<() => Promise<string>>(async () => {
    throw new Error('Camera not ready');
  });

  const onCameraReady = useCallback((capture: () => Promise<string>) => {
    captureRef.current = capture;
  }, []);

  const load = async () => {
    try {
      setEmployees(await api.employees(q || undefined));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load employees');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setWorkingMode = async (item: Employee, working_mode: WorkingMode) => {
    const current = item.working_mode || 'onsite';
    if (current === working_mode || modeBusyId === item.id) {
      setModeMenuFor(null);
      return;
    }
    try {
      setModeBusyId(item.id);
      setModeMenuFor(null);
      const updated = await api.updateEmployee(item.id, { working_mode });
      setEmployees((prev) => prev.map((e) => (e.id === item.id ? { ...e, ...updated } : e)));
      setSelected((prev) => (prev?.id === item.id ? { ...prev, ...updated } : prev));
      setMessage(
        `${updated.display_name}: Working Mode set to ${
          working_mode === 'remote' ? 'Remote' : 'On-site'
        }`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update working mode');
    } finally {
      setModeBusyId(null);
    }
  };

  const resetSamples = async () => {
    if (!selected) {
      setMessage('Select an employee first');
      return;
    }
    try {
      setBusy(true);
      const res = await api.resetEnroll(selected.id);
      setSamples(0);
      setMessage(
        res.templates_removed
          ? `Reset ${res.templates_removed} sample(s) for ${selected.display_name}. Capture new face samples.`
          : `No samples to reset for ${selected.display_name}. Capture new face samples.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
      setResetConfirm(false);
    }
  };

  const captureSample = async () => {
    if (!selected) {
      setMessage('Select an employee first');
      return;
    }
    if (samples >= maxSamples) {
      setMessage(`Maximum of ${maxSamples} face samples reached for this user`);
      return;
    }
    try {
      setBusy(true);
      const image_b64 = await captureRef.current();
      const res = await api.enroll(selected.id, image_b64, 0.95);
      const next = res.total_templates;
      setSamples(next);
      setMessage(`Saved sample ${next} of ${res.max_templates} for ${selected.display_name}`);
      if (next >= 3) setConfirm(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Enroll failed');
    } finally {
      setBusy(false);
    }
  };

  const twoColumn = layout.landscape && layout.short;

  const camera = (
    <View
      style={[
        styles.camera,
        twoColumn
          ? styles.cameraColumn
          : { minHeight: layout.short ? 140 : 180, maxHeight: layout.cameraHeight },
      ]}
    >
      <CameraView onReady={onCameraReady} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.inner,
          { padding: layout.gutter, maxWidth: layout.maxContentWidth },
          twoColumn && styles.innerRow,
        ]}
      >
        {twoColumn && camera}
        <View style={styles.controls}>
          <Text style={styles.title}>Enroll faces</Text>
          <View style={styles.searchRow}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search code or name"
              placeholderTextColor={THEME.textSubtle}
              style={[styles.input, styles.searchInput]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={load}
            />
            <Pressable onPress={load} accessibilityRole="button" style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
          </View>
          <FlatList
            style={[styles.list, twoColumn ? styles.listFlexible : { maxHeight: layout.short ? 116 : 168 }]}
            data={employees}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
            renderItem={({ item }) => {
              const mode = item.working_mode || 'onsite';
              const modeLabel = mode === 'remote' ? 'Remote' : 'On-site';
              const modeDisabled = modeBusyId === item.id;
              const isSelected = selected?.id === item.id;
              return (
                <Pressable
                  onPress={() => {
                    setSelected(item);
                    setSamples(0);
                    setMessage(`Enrolling ${item.display_name} (${item.code})`);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={[styles.row, isSelected && styles.rowOn]}
                >
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                  <Pressable
                    disabled={modeDisabled}
                    onPress={() => setModeMenuFor(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Working Mode, ${modeLabel}`}
                    style={[styles.modeSelect, modeDisabled && styles.modeSelectBusy]}
                  >
                    <Text style={styles.modeSelectText}>{modeLabel}</Text>
                    <Text style={styles.modeChevron}>▾</Text>
                  </Pressable>
                </Pressable>
              );
            }}
          />
          {!twoColumn && camera}
          <Pressable
            disabled={busy || !selected}
            onPress={captureSample}
            accessibilityRole="button"
            style={[styles.cta, styles.ctaPrimary, (busy || !selected) && styles.ctaBusy]}
          >
            <Text style={styles.ctaText}>{busy ? 'Saving…' : 'Capture sample'}</Text>
          </Pressable>
          <Pressable
            disabled={busy || !selected}
            onPress={() => setResetConfirm(true)}
            accessibilityRole="button"
            style={[styles.cta, styles.ctaReset, styles.ctaSpaced, (busy || !selected) && styles.ctaBusy]}
          >
            <Text style={[styles.ctaText, styles.ctaResetText]}>Reset face samples</Text>
          </Pressable>
          <Text style={styles.status} numberOfLines={2}>
            {message}
          </Text>
        </View>
      </View>
      <Modal
        visible={!!modeMenuFor}
        transparent
        animationType="fade"
        onRequestClose={() => setModeMenuFor(null)}
      >
        <Pressable style={styles.modeMenuBackdrop} onPress={() => setModeMenuFor(null)}>
          <View style={styles.modeMenuCard}>
            <Text style={styles.modeMenuTitle}>Working Mode</Text>
            {modeMenuFor ? (
              <Text style={styles.modeMenuSubtitle} numberOfLines={1}>
                {modeMenuFor.display_name}
              </Text>
            ) : null}
            {WORKING_MODE_OPTIONS.map((opt) => {
              const on = (modeMenuFor?.working_mode || 'onsite') === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => modeMenuFor && setWorkingMode(modeMenuFor, opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.modeMenuOption, on && styles.modeMenuOptionOn]}
                >
                  <Text style={[styles.modeMenuOptionText, on && styles.modeMenuOptionTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
      <ConfirmModal
        visible={confirm}
        title="Enrollment samples saved"
        message={`${selected?.display_name || ''} now has ${samples} templates. Capture more if lighting varies.`}
        confirmLabel="Done"
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
      <ConfirmModal
        visible={resetConfirm}
        title="Reset face samples?"
        message={`This will delete all enrolled face samples for ${selected?.display_name || 'this user'}. They will need to capture new samples before clock-in works again.`}
        confirmLabel="Reset"
        onConfirm={resetSamples}
        onCancel={() => setResetConfirm(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  inner: { flex: 1, width: '100%', alignSelf: 'center' },
  innerRow: { flexDirection: 'row', gap: 12 },
  controls: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 12, letterSpacing: -0.2 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  searchInput: { flex: 1 },
  searchBtn: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: THEME.cyan, fontWeight: '800', fontSize: 14 },
  list: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  listFlexible: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 10,
    minHeight: TAP_TARGET,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowOn: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: THEME.cyan,
  },
  code: {
    color: THEME.cyan,
    width: 72,
    fontWeight: '800',
    fontSize: 13,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    textAlign: 'center',
  },
  name: { color: '#fff', flex: 1, minWidth: 0, fontWeight: '600', fontSize: 15 },
  modeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
  modeSelectBusy: { opacity: 0.6 },
  modeSelectText: { color: THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  modeChevron: { color: THEME.textMuted, fontSize: 12, fontWeight: '700' },
  modeMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 22, 0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modeMenuCard: {
    backgroundColor: THEME.cardSolid,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
  },
  modeMenuTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modeMenuSubtitle: { color: THEME.textMuted, marginTop: 4, marginBottom: 12, fontSize: 14 },
  modeMenuOption: {
    minHeight: TAP_TARGET - 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  modeMenuOptionOn: { backgroundColor: THEME.emerald, borderColor: THEME.emerald },
  modeMenuOptionText: { color: THEME.textSecondary, fontWeight: '700', fontSize: 15 },
  modeMenuOptionTextOn: { color: '#fff' },
  empty: { color: THEME.textMuted, paddingVertical: 14, textAlign: 'center' },
  camera: { flex: 1, marginVertical: 10 },
  cameraColumn: { flex: 0.85, marginVertical: 0, minHeight: 0 },
  cta: {
    minHeight: TAP_TARGET + 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimary: {
    backgroundColor: THEME.cyan,
    shadowColor: THEME.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaReset: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  ctaResetText: { color: THEME.rose },
  ctaBusy: { opacity: 0.55 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ctaSpaced: { marginTop: 8 },
  status: { color: THEME.textSecondary, marginTop: 10, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});

