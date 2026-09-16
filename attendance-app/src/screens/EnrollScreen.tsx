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

  // A stable callback keeps CameraView from re-requesting the camera on every render.
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

  // Landscape phones are too short to stack the list and the camera, so they sit side by side.
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
          {/* Search sits on one line so the keyboard leaves room for the camera. */}
          <View style={styles.searchRow}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search code or name"
              placeholderTextColor="#6d7f96"
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
              return (
                <Pressable
                  onPress={() => {
                    setSelected(item);
                    setSamples(0);
                    setMessage(`Enrolling ${item.display_name} (${item.code})`);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected?.id === item.id }}
                  style={[styles.row, selected?.id === item.id && styles.rowOn]}
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
            style={[styles.cta, (busy || !selected) && styles.ctaBusy]}
          >
            <Text style={styles.ctaText}>{busy ? 'Saving…' : 'Capture sample'}</Text>
          </Pressable>
          <Pressable
            disabled={busy || !selected}
            onPress={() => setResetConfirm(true)}
            accessibilityRole="button"
            style={[styles.cta, styles.ctaSpaced, (busy || !selected) && styles.ctaBusy]}
          >
            <Text style={styles.ctaText}>Reset face samples</Text>
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
  root: { flex: 1, backgroundColor: '#07111f' },
  inner: { flex: 1, width: '100%', alignSelf: 'center' },
  innerRow: { flexDirection: 'row', gap: 12 },
  controls: { flex: 1, minWidth: 0 },
  title: { color: '#f4f7fb', fontSize: 24, fontWeight: '800', marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    color: '#f4f7fb',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1 },
  searchBtn: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: '#7ee0c5', fontWeight: '700', fontSize: 15 },
  list: { marginTop: 10 },
  listFlexible: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 10,
    minHeight: TAP_TARGET,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22344f',
  },
  rowOn: { backgroundColor: '#123348' },
  code: { color: '#7ee0c5', width: 72, fontWeight: '700' },
  name: { color: '#f4f7fb', flex: 1, minWidth: 0 },
  modeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TAP_TARGET,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  modeSelectBusy: { opacity: 0.6 },
  modeSelectText: { color: '#f4f7fb', fontSize: 16, fontWeight: '700' },
  modeChevron: { color: '#9fb0c8', fontSize: 14, fontWeight: '700' },
  modeMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modeMenuCard: {
    backgroundColor: '#152238',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    padding: 14,
  },
  modeMenuTitle: { color: '#f4f7fb', fontSize: 18, fontWeight: '800' },
  modeMenuSubtitle: { color: '#9fb0c8', marginTop: 4, marginBottom: 12 },
  modeMenuOption: {
    minHeight: TAP_TARGET,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    paddingHorizontal: 12,
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  modeMenuOptionOn: { backgroundColor: '#1f8a70', borderColor: '#1f8a70' },
  modeMenuOptionText: { color: '#c5d2e4', fontWeight: '700', fontSize: 16 },
  modeMenuOptionTextOn: { color: '#fff' },
  empty: { color: '#9fb0c8', paddingVertical: 12 },
  camera: { flex: 1, marginVertical: 10 },
  cameraColumn: { flex: 0.85, marginVertical: 0, minHeight: 0 },
  cta: {
    minHeight: TAP_TARGET,
    backgroundColor: '#2d6cdf',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.6 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ctaSpaced: { marginTop: 8 },
  status: { color: '#c5d2e4', marginTop: 10, textAlign: 'center' },
});
