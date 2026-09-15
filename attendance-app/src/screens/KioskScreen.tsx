import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { CameraView } from '../components/CameraView';
import { ConfirmModal } from '../components/ConfirmModal';
import { api } from '../services/api';
import { getCurrentGps } from '../services/geo';
import { storage } from '../services/storage';
import {
  AppDispatch,
  RootState,
  rollLivenessPrompt,
  setBusy,
  setLastMessage,
  setPunchType,
} from '../state/attendanceSlice';

const promptCopy: Record<string, string> = {
  blink: 'Please blink twice',
  turn_left: 'Turn your head left, then face the camera',
  turn_right: 'Turn your head right, then face the camera',
  smile: 'Please smile',
};

export function KioskScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { punchType, lastMessage, busy, livenessPrompt } = useSelector(
    (s: RootState) => s.attendance,
  );
  const captureRef = React.useRef<() => Promise<string>>(async () => {
    throw new Error('Camera not ready');
  });
  const [pending, setPending] = useState<{
    employee_id: string;
    name: string;
    similarity: number;
    liveness: number;
    face_crop_url?: string;
    image_b64: string;
  } | null>(null);

  const onReady = useCallback((capture: () => Promise<string>) => {
    captureRef.current = capture;
  }, []);

  const captureAndIdentify = async () => {
    try {
      dispatch(setBusy(true));
      dispatch(setLastMessage('Checking liveness…'));
      const image_b64 = await captureRef.current();
      const settings = await storage.getSettings();
      const gps = await getCurrentGps();
      if (!gps) {
        dispatch(setLastMessage('Location is required. Allow GPS and stand inside the office.'));
        return;
      }
      const res = await api.identify({
        device_id: settings.deviceId,
        site_code: settings.siteCode,
        gps,
        image_b64,
        liveness: 0.95,
      });
      const minSim = res.thresholds?.similarity ?? 0.95;
      const minLive = res.thresholds?.liveness ?? 0.6;
      if (res.ok && res.similarity >= minSim && res.liveness >= minLive && res.employee_id) {
        setPending({
          employee_id: res.employee_id,
          name: res.name || res.employee_code || 'Employee',
          similarity: res.similarity,
          liveness: res.liveness,
          face_crop_url: res.face_crop_url,
          image_b64,
        });
        dispatch(setLastMessage(`Matched ${res.name}`));
      } else {
        dispatch(setLastMessage('Please try again'));
        dispatch(rollLivenessPrompt());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again';
      if (/network|fetch|failed/i.test(message)) {
        dispatch(setLastMessage('Offline — capture queued'));
        try {
          const image_b64 = await captureRef.current();
          const settings = await storage.getSettings();
          await storage.enqueue({
            id: String(Date.now()),
            path: '/attend/identify',
            body: { device_id: settings.deviceId, site_code: settings.siteCode, image_b64, liveness: 0.95 },
            createdAt: Date.now(),
          });
        } catch {
          dispatch(setLastMessage('Please try again'));
        }
      } else {
        dispatch(setLastMessage(message));
      }
    } finally {
      dispatch(setBusy(false));
    }
  };

  const confirmAttendance = async () => {
    if (!pending) return;
    const settings = await storage.getSettings();
    const gps = await getCurrentGps();
    const body = {
      employee_id: pending.employee_id,
      type: punchType,
      device_id: settings.deviceId,
      site_code: settings.siteCode,
      gps,
      similarity: pending.similarity,
      liveness_score: pending.liveness,
      face_crop_url: pending.face_crop_url,
    };
    try {
      await api.attendance(body);
      dispatch(setLastMessage(`Welcome ${pending.name}`));
      dispatch(rollLivenessPrompt());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again';
      if (/geofence|location is required|outside office/i.test(message)) {
        dispatch(setLastMessage(message));
      } else {
        await storage.enqueue({
          id: String(Date.now()),
          path: '/attendance',
          body,
          createdAt: Date.now(),
        });
        dispatch(
          setLastMessage(
            err instanceof Error ? `Saved offline: ${err.message}` : 'Saved offline',
          ),
        );
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>Face Attendance</Text>
      <Text style={styles.prompt}>{promptCopy[livenessPrompt] || livenessPrompt}</Text>
      <View style={styles.camera}>
        <CameraView onReady={onReady} />
      </View>
      <View style={styles.toggle}>
        {(['IN', 'OUT'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => dispatch(setPunchType(t))}
            style={[styles.toggleBtn, punchType === t && styles.toggleOn]}
          >
            <Text style={[styles.toggleText, punchType === t && styles.toggleTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable disabled={busy} onPress={captureAndIdentify} style={styles.cta}>
        <Text style={styles.ctaText}>{busy ? 'Working…' : `Clock ${punchType}`}</Text>
      </Pressable>
      {!!lastMessage && <Text style={styles.status}>{lastMessage}</Text>}
      <ConfirmModal
        visible={!!pending}
        title={pending ? `Welcome ${pending?.name}` : ''}
        message={
          pending
            ? `Similarity ${pending.similarity.toFixed(2)} · Liveness ${pending.liveness.toFixed(2)}\nConfirm clock ${punchType}?`
            : ''
        }
        confirmLabel={`Confirm ${punchType}`}
        onConfirm={confirmAttendance}
        onCancel={() => setPending(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111f', padding: 16 },
  brand: { color: '#f4f7fb', fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  prompt: { color: '#7ee0c5', textAlign: 'center', marginVertical: 10, fontSize: 16 },
  camera: { flex: 1, minHeight: 280, marginVertical: 8 },
  toggle: { flexDirection: 'row', gap: 10, marginTop: 12 },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a3d5c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  toggleOn: { backgroundColor: '#1f8a70', borderColor: '#1f8a70' },
  toggleText: { color: '#9fb0c8', fontWeight: '700', fontSize: 18 },
  toggleTextOn: { color: '#fff' },
  cta: {
    marginTop: 12,
    backgroundColor: '#2d6cdf',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  status: { color: '#c5d2e4', textAlign: 'center', marginTop: 12, fontSize: 16 },
});
