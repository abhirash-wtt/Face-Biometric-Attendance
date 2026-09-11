import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView } from '../components/CameraView';
import { ConfirmModal } from '../components/ConfirmModal';
import { api } from '../services/api';

type Employee = { id: string; code: string; display_name: string; status: string };

export function EnrollScreen() {
  const [q, setQ] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [samples, setSamples] = useState(0);
  const [message, setMessage] = useState('Select an employee, then capture 3–5 face samples.');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const captureRef = React.useRef<() => Promise<string>>(async () => {
    throw new Error('Camera not ready');
  });

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

  const captureSample = async () => {
    if (!selected) {
      setMessage('Select an employee first');
      return;
    }
    try {
      setBusy(true);
      const image_b64 = await captureRef.current();
      await api.enroll(selected.id, image_b64, 0.95);
      const next = samples + 1;
      setSamples(next);
      setMessage(`Saved sample ${next} for ${selected.display_name}`);
      if (next >= 3) setConfirm(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Enroll failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Enroll faces</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search code or name"
        placeholderTextColor="#6d7f96"
        style={styles.input}
        onSubmitEditing={load}
      />
      <Pressable onPress={load} style={styles.smallBtn}>
        <Text style={styles.smallBtnText}>Search</Text>
      </Pressable>
      <FlatList
        style={styles.list}
        data={employees}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setSelected(item);
              setSamples(0);
              setMessage(`Enrolling ${item.display_name} (${item.code})`);
            }}
            style={[styles.row, selected?.id === item.id && styles.rowOn]}
          >
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.name}>{item.display_name}</Text>
          </Pressable>
        )}
      />
      <View style={styles.camera}>
        <CameraView onReady={(fn) => (captureRef.current = fn)} />
      </View>
      <Pressable disabled={busy} onPress={captureSample} style={styles.cta}>
        <Text style={styles.ctaText}>{busy ? 'Saving…' : 'Capture sample'}</Text>
      </Pressable>
      <Text style={styles.status}>{message}</Text>
      <ConfirmModal
        visible={confirm}
        title="Enrollment samples saved"
        message={`${selected?.display_name || ''} now has ${samples} templates. Capture more if lighting varies.`}
        confirmLabel="Done"
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111f', padding: 16 },
  title: { color: '#f4f7fb', fontSize: 24, fontWeight: '800', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 10,
    color: '#f4f7fb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallBtn: { alignSelf: 'flex-start', marginTop: 8, marginBottom: 8 },
  smallBtnText: { color: '#7ee0c5', fontWeight: '700' },
  list: { maxHeight: 140 },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#22344f',
  },
  rowOn: { backgroundColor: '#123348' },
  code: { color: '#7ee0c5', width: 80, fontWeight: '700' },
  name: { color: '#f4f7fb' },
  camera: { flex: 1, minHeight: 180, marginVertical: 10 },
  cta: {
    backgroundColor: '#2d6cdf',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  status: { color: '#c5d2e4', marginTop: 10, textAlign: 'center' },
});
