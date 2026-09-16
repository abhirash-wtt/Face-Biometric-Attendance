import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView } from '../components/CameraView';
import { ConfirmModal } from '../components/ConfirmModal';
import { api } from '../services/api';
import { TAP_TARGET, useLayout } from '../theme/responsive';

type Employee = { id: string; code: string; display_name: string; status: string };

export function EnrollScreen() {
  const layout = useLayout();
  const [q, setQ] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [samples, setSamples] = useState(0);
  const [message, setMessage] = useState('Select an employee, then capture 3–10 face samples.');
  const [busy, setBusy] = useState(false);
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
            renderItem={({ item }) => (
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
              </Pressable>
            )}
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
  code: { color: '#7ee0c5', width: 76, fontWeight: '700' },
  name: { color: '#f4f7fb', flex: 1 },
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
