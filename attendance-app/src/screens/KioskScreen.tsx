import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { CameraView } from '../components/CameraView';
import { ConfirmModal } from '../components/ConfirmModal';
import { api } from '../services/api';
import { getCurrentGps } from '../services/geo';
import { storage } from '../services/storage';
import { TAP_TARGET, useLayout } from '../theme/responsive';
import { THEME } from '../theme/colors';
import {
  AppDispatch,
  PunchType,
  RootState,
  rollLivenessPrompt,
  setBusy,
  setLastMessage,
} from '../state/attendanceSlice';

const promptCopy: Record<string, string> = {
  blink: 'Please blink twice',
  turn_left: 'Turn your head left, then face the camera',
  turn_right: 'Turn your head right, then face the camera',
  smile: 'Please smile',
};

function identifyFailMessage(reason?: string) {
  if (reason === 'identity_mismatch') return 'Face does not match this login';
  if (reason === 'no_templates') return 'No face enrolled for this login';
  if (reason === 'enrollment_incomplete') return 'Face enrollment is incomplete';
  if (reason === 're_enroll_required') return 'Biometric model updated. Please re-enroll face';
  if (reason === 'low_similarity') return 'Face not recognized';
  if (reason === 'low_liveness') return 'Liveness check failed';
  if (reason === 'employee_not_found') return 'This employee account is not active';
  return 'Please try again';
}

function buildFailureMessage(reason?: string): string {
  let reasonText = 'Face verification was unsuccessful.';
  if (reason === 'low_similarity') {
    reasonText = 'Face not recognized. Your face did not match any active employee profile.';
  } else if (reason === 'identity_mismatch') {
    reasonText = 'Face does not match the employee profile linked to this login.';
  } else if (reason === 'no_templates') {
    reasonText = 'No biometric face templates were found for this account. Please enroll your face first.';
  } else if (reason === 'enrollment_incomplete') {
    reasonText = 'Face enrollment is incomplete. Capture looking straight, left, and right in the Enroll tab before clock-in.';
  } else if (reason === 'low_liveness') {
    reasonText = 'Liveness check failed. Please look straight into the camera and follow the movement prompt.';
  } else if (reason === 're_enroll_required') {
    reasonText = 'Biometric model updated. Please re-enroll your face in the Enroll tab.';
  } else if (reason === 'employee_not_found') {
    reasonText = 'This employee account is not active. Please contact an administrator.';
  } else if (reason === 'missing_image') {
    reasonText = 'No face detected in camera. Please position your face inside the guide frame.';
  }

  return `${reasonText}\n\nPlease ensure good lighting, look straight into the camera without accessories, and try again.`;
}

export function KioskScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const layout = useLayout();
  const { lastMessage, busy, livenessPrompt } = useSelector((s: RootState) => s.attendance);
  const captureRef = React.useRef<() => Promise<string>>(async () => {
    throw new Error('Camera not ready');
  });
  const [success, setSuccess] = useState<{
    name: string;
    type: PunchType;
    similarity: number;
    liveness: number;
  } | null>(null);
  const [failure, setFailure] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const onReady = useCallback((capture: () => Promise<string>) => {
    captureRef.current = capture;
  }, []);

  const captureAndIdentify = async (type: PunchType) => {
    try {
      dispatch(setBusy(true));
      dispatch(setLastMessage('Checking liveness…'));
      // Capture and GPS run together so wall-clock time is max(capture, gps), not sum.
      const gpsPromise = getCurrentGps().catch(() => undefined);
      const image_b64 = await captureRef.current();
      const settings = await storage.getSettings();
      const gps = await gpsPromise;
      const res = await api.identify({
        device_id: settings.deviceId,
        site_code: settings.siteCode,
        gps: gps ?? null,
        image_b64,
        liveness: 0.95,
      });
      const minSim = res.thresholds?.similarity ?? 0.9;
      const minLive = res.thresholds?.liveness ?? 0.6;
      if (res.ok && res.similarity >= minSim && res.liveness >= minLive && res.employee_id) {
        setFailure(null);
        const empName = res.name || res.employee_code || 'Employee';
        const body = {
          employee_id: res.employee_id,
          type,
          device_id: settings.deviceId,
          site_code: settings.siteCode,
          gps,
          similarity: res.similarity,
          liveness_score: res.liveness,
          face_crop_url: res.face_crop_url,
          image_b64,
        };
        try {
          await api.attendance(body);
          dispatch(setLastMessage(`Welcome ${empName}`));
          dispatch(rollLivenessPrompt());
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Please try again';
          if (/duplicate/i.test(message)) {
            dispatch(setLastMessage('Duplicate entry detected.'));
            dispatch(rollLivenessPrompt());
            return;
          } else if (/geofence|location is required|outside office|not linked|does not match|Face verification required|only clock in|No face enrolled|enrollment is incomplete/i.test(message)) {
            dispatch(setLastMessage(message));
            setFailure({
              title: /geofence|location|outside/i.test(message) ? 'Location Verification Failed' : 'Attendance Failed',
              message,
            });
            return;
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
            return;
          }
        }

        setSuccess({
          name: empName,
          type,
          similarity: res.similarity,
          liveness: res.liveness,
        });
      } else {
        const failMsg = identifyFailMessage(res.reason);
        const detailedMsg = buildFailureMessage(res.reason);
        dispatch(setLastMessage(failMsg));
        dispatch(rollLivenessPrompt());
        setSuccess(null);
        setFailure({
          title: 'Face Verification Failed',
          message: detailedMsg,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again';
      const isNetworkOffline = /network request failed|failed to fetch|networkerror|econnrefused/i.test(message);
      if (isNetworkOffline) {
        dispatch(setLastMessage('Offline — capture queued'));
        try {
          const gpsPromise = getCurrentGps().catch(() => undefined);
          const image_b64 = await captureRef.current();
          const settings = await storage.getSettings();
          const gps = await gpsPromise;
          await storage.enqueue({
            id: String(Date.now()),
            path: '/attend/identify',
            body: {
              device_id: settings.deviceId,
              site_code: settings.siteCode,
              image_b64,
              liveness: 0.95,
              gps,
            },
            createdAt: Date.now(),
          });
        } catch {
          dispatch(setLastMessage('Please try again'));
        }
        setFailure({
          title: 'Connection Offline',
          message: 'Could not connect to the attendance service. Your capture has been queued offline and will be verified once connection is restored.',
        });
      } else {
        const isDuplicate = /duplicate/i.test(message);
        if (isDuplicate) {
          dispatch(setLastMessage('Duplicate entry detected.'));
          dispatch(rollLivenessPrompt());
        } else {
          dispatch(setLastMessage(message));
          setFailure({
            title: /geofence|location|outside/i.test(message)
              ? 'Location Verification Failed'
              : 'Face Verification Failed',
            message,
          });
        }
      }
    } finally {
      dispatch(setBusy(false));
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { padding: layout.gutter, maxWidth: layout.maxContentWidth },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.promptBadge}>
        <View style={styles.promptDot} />
        <Text style={styles.prompt}>{promptCopy[livenessPrompt] || livenessPrompt}</Text>
      </View>
      <View style={[styles.camera, { height: layout.cameraHeight }]}>
        <CameraView onReady={onReady} />
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          onPress={() => captureAndIdentify('IN')}
          accessibilityRole="button"
          style={[styles.cta, styles.ctaIn, busy && styles.ctaBusy]}
        >
          <Text style={styles.ctaIcon} accessibilityElementsHidden>
            📥
          </Text>
          <Text style={styles.ctaText}>{busy ? 'Working…' : 'Clock In'}</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => captureAndIdentify('OUT')}
          accessibilityRole="button"
          style={[styles.cta, styles.ctaOut, busy && styles.ctaBusy]}
        >
          <Text style={styles.ctaIcon} accessibilityElementsHidden>
            📤
          </Text>
          <Text style={styles.ctaText}>{busy ? 'Working…' : 'Clock Out'}</Text>
        </Pressable>
      </View>
      {!!lastMessage && <Text style={styles.status}>{lastMessage}</Text>}
      <ConfirmModal
        visible={!!success || !!failure}
        title={success ? `Welcome ${success.name}` : failure?.title || 'Face Verification Failed'}
        message={
          success
            ? `Clock ${success.type} recorded successfully!`
            : failure?.message || ''
        }
        confirmLabel={failure ? 'Try Again' : ''}
        variant={failure ? 'danger' : 'success'}
        showButtons={!success}
        showCancel={false}
        autoCloseMs={success ? 2500 : undefined}
        onConfirm={() => {
          setFailure(null);
        }}
        onCancel={() => {
          setSuccess(null);
          setFailure(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  promptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginVertical: 10,
    alignSelf: 'center',
  },
  promptDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.cyan,
  },
  prompt: { color: THEME.cyanLight, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  camera: { marginVertical: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  cta: {
    flex: 1,
    minHeight: TAP_TARGET + 6,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaIn: {
    backgroundColor: THEME.emerald,
    shadowColor: THEME.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaOut: {
    backgroundColor: THEME.indigo,
    shadowColor: THEME.indigo,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaBusy: { opacity: 0.55 },
  ctaIcon: { color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 20 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  status: {
    color: THEME.textSecondary,
    textAlign: 'center',
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
  },
});

