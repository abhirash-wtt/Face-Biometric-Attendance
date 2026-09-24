import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { THEME } from '../theme/colors';

type Props = {
  onReady?: (capture: () => Promise<string>) => void;
  /** When false, the native camera session stays paused (e.g. another tab is visible). */
  isActive?: boolean;
};

function FaceGuide() {
  return (
    <View style={styles.guide} pointerEvents="none" accessibilityElementsHidden>
      <View style={styles.guideRing}>
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>
    </View>
  );
}

export function CameraView({ onReady, isActive = true }: Props) {
  if (Platform.OS === 'web') {
    return <WebCamera onReady={onReady} />;
  }
  return <NativeCamera onReady={onReady} isActive={isActive} />;
}

const CAM_CHANNEL = 'face-kiosk-camera';

function cameraBusy(err: unknown) {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  return name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError';
}

function cameraDenied(err: unknown) {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function prefersFrontCamera() {
  return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches;
}

function WebCamera({ onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const captureWeb = useCallback(async () => {
    const video = videoRef.current;
    if (!video) throw new Error('Camera not ready');
    const deadline = Date.now() + 800;
    while (Date.now() < deadline && !(video.videoWidth > 0 && video.readyState >= 2)) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const srcW = video.videoWidth || 480;
    const srcH = video.videoHeight || 480;
    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Capture failed');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75).replace(/^data:image\/\w+;base64,/, '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let heldByPeer = false;
    const clientId = Math.random().toString(36).slice(2);
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CAM_CHANNEL) : null;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const post = (msg: Record<string, unknown>) => {
      try {
        channel?.postMessage({ ...msg, clientId });
      } catch {
        /* closed */
      }
    };

    const reportFailure = (err: unknown) => {
      const message = cameraBusy(err)
        ? 'Another application is using the camera'
        : cameraDenied(err)
          ? 'Camera permission denied'
          : 'Unable to open the camera';
      onReadyRef.current?.(async () => {
        throw new Error(message);
      });
    };

    const requestPeerRelease = () =>
      new Promise<boolean>((resolve) => {
        if (!channel) {
          resolve(false);
          return;
        }
        let released = false;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          channel.removeEventListener('message', onMsg);
          resolve(released);
        };
        const timer = window.setTimeout(finish, 50);
        const onMsg = (event: MessageEvent) => {
          const msg = event.data || {};
          if (!msg || msg.clientId === clientId || msg.type !== 'released' || !msg.held) return;
          released = true;
          window.clearTimeout(timer);
          window.setTimeout(finish, 50);
        };
        channel.addEventListener('message', onMsg);
        post({ type: 'release' });
      });

    const attach = (stream: MediaStream) => {
      streamRef.current = stream;
      const node = videoRef.current;
      if (node) {
        node.srcObject = stream;
        const play = node.play();
        if (play && typeof play.catch === 'function') play.catch(() => {});
      }
      stream.getVideoTracks().forEach((track) => {
        if ('contentHint' in track) track.contentHint = 'motion';
        track.onended = () => {
          if (streamRef.current !== stream) return;
          busy = true;
          post({ type: 'idle' });
          stopStream();
          const now = Date.now();
          if (now - lastRetry < 1200) return;
          lastRetry = now;
          acquire().catch(() => {});
        };
      });
      busy = false;
      heldByPeer = false;
      post({ type: 'holding' });
      onReadyRef.current?.(captureWeb);
    };

    const openStream = async () => {
      const primary: MediaStreamConstraints = prefersFrontCamera()
        ? { audio: false, video: { facingMode: 'user' } }
        : { audio: false, video: true };
      const started = Date.now();
      try {
        return await navigator.mediaDevices.getUserMedia(primary);
      } catch (err) {
        if (cameraDenied(err) || !cameraBusy(err)) throw err;
        busy = true;
        const failedFast = Date.now() - started < 900;
        const peerReleased = await requestPeerRelease();
        if (cancelled) throw err;
        if (peerReleased || (failedFast && primary.video !== true)) {
          if (peerReleased) await new Promise((resolve) => setTimeout(resolve, 60));
          return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        throw err;
      }
    };

    let opening = false;
    let queued = false;
    let lastRetry = 0;
    const acquire = async () => {
      if (cancelled || streamRef.current) return;
      if (opening) {
        queued = true;
        return;
      }
      opening = true;
      try {
        const stream = await openStream();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        attach(stream);
      } catch (err) {
        if (cancelled) return;
        busy = cameraBusy(err) && !heldByPeer;
        reportFailure(err);
      } finally {
        opening = false;
        if (queued && !cancelled && !streamRef.current) {
          queued = false;
          acquire().catch(() => {});
        } else {
          queued = false;
        }
      }
    };

    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        const msg = event.data || {};
        if (!msg || msg.clientId === clientId) return;
        if (msg.type === 'holding') {
          if (!streamRef.current) heldByPeer = true;
          return;
        }
        if (msg.type === 'idle') {
          heldByPeer = false;
          if (busy && !streamRef.current) {
            acquire()
              .catch(() => {})
              .finally(() => {
                if (!cancelled && busy && !heldByPeer && !streamRef.current) schedulePoll();
              });
          }
          return;
        }
        if (msg.type !== 'release') return;
        const held = !!streamRef.current;
        if (held) {
          heldByPeer = true;
          busy = true;
          stopStream();
          reportFailure({ name: 'NotReadableError' });
        }
        post({ type: 'released', held });
      };
    }

    const onDeviceChange = () => {
      window.setTimeout(() => {
        if (cancelled || !busy || heldByPeer || streamRef.current) return;
        acquire().catch(() => {});
      }, 250);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    let pollTimer = 0;
    const schedulePoll = () => {
      if (pollTimer) return;
      pollTimer = window.setTimeout(() => {
        pollTimer = 0;
        if (cancelled || !busy || heldByPeer || streamRef.current) return;
        acquire()
          .catch(() => {})
          .finally(() => {
            if (!cancelled && busy && !heldByPeer && !streamRef.current) schedulePoll();
          });
      }, 1500);
    };
    const acquireAndWatch = () =>
      acquire()
        .catch(() => {})
        .finally(() => {
          if (!cancelled && busy && !heldByPeer && !streamRef.current) schedulePoll();
        });
    acquireAndWatch();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      const held = !!streamRef.current;
      stopStream();
      if (held) post({ type: 'idle' });
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      channel?.close();
    };
  }, [captureWeb]);

  return (
    <View style={styles.box}>
      {React.createElement('video', {
        ref: (el: unknown) => {
          videoRef.current = el as HTMLVideoElement | null;
        },
        autoPlay: true,
        playsInline: true,
        muted: true,
        style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
      })}
      <FaceGuide />
    </View>
  );
}

type CameraDeviceLike = { id: string; position: 'front' | 'back' | 'external' | string };
type PhotoFileLike = { path: string };
type CameraRefLike = {
  takePhoto: (opts?: object) => Promise<PhotoFileLike>;
};

type VisionCameraModule = {
  Camera: React.ComponentType<Record<string, unknown>> & {
    requestCameraPermission: () => Promise<'granted' | 'denied' | 'not-determined' | 'restricted'>;
    getCameraPermissionStatus: () => string;
    getAvailableCameraDevices: () => CameraDeviceLike[];
    addCameraDevicesChangedListener: (
      listener: (devices: CameraDeviceLike[]) => void,
    ) => { remove: () => void };
  };
  useCameraDevice: (position: 'front' | 'back') => CameraDeviceLike | undefined;
  useCameraPermission: () => {
    hasPermission: boolean;
    requestPermission: () => Promise<boolean>;
  };
};

let VisionCameraMod: VisionCameraModule | null = null;
try {
  VisionCameraMod = require('react-native-vision-camera');
} catch {
  VisionCameraMod = null;
}

function filePathForFs(path: string): string {
  return path.startsWith('file://') ? path.replace(/^file:\/\//, '') : path;
}

async function ensureAndroidCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const current = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (current) return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Camera permission',
      message: 'Face Attendance needs the camera to verify your identity.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function pickDevice(
  Camera: VisionCameraModule['Camera'],
  preferred?: CameraDeviceLike,
): CameraDeviceLike | undefined {
  if (preferred) return preferred;
  const devices = Camera.getAvailableCameraDevices?.() ?? [];
  return devices.find((d) => d.position === 'front') ?? devices.find((d) => d.position === 'back');
}

function NativeCamera({ onReady, isActive = true }: Props) {
  if (!VisionCameraMod) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.hint}>Camera module unavailable. Rebuild the native app.</Text>
      </View>
    );
  }
  return <VisionNativeCamera onReady={onReady} isActive={isActive} />;
}

/**
 * Minimal, reliable Android camera path:
 * 1) Ask OS permission (PermissionsAndroid + VisionCamera)
 * 2) Wait for a device (CameraX provider can take a moment)
 * 3) Mount <Camera> full-bleed with isActive tied to AppState + tab visibility
 * 4) Expose takePhoto only after onInitialized
 */
function VisionNativeCamera({ onReady, isActive = true }: Props) {
  const Camera = VisionCameraMod!.Camera;
  const hookDevice = VisionCameraMod!.useCameraDevice('front');
  const { hasPermission: vcHasPermission, requestPermission } =
    VisionCameraMod!.useCameraPermission();

  const cameraRef = useRef<CameraRefLike | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [device, setDevice] = useState<CameraDeviceLike | undefined>(undefined);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep session active only while this screen is visible and the app is foregrounded.
  const sessionActive = Boolean(isActive && appActive && permission === 'granted' && device);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const androidOk = await ensureAndroidCameraPermission();
      if (cancelled) return;
      if (!androidOk) {
        setPermission('denied');
        return;
      }
      // VisionCamera keeps its own status; request again if needed.
      let granted = vcHasPermission;
      if (!granted) {
        try {
          granted = await requestPermission();
        } catch {
          granted = Camera.getCameraPermissionStatus() === 'granted';
        }
      }
      if (!cancelled) setPermission(granted ? 'granted' : 'denied');
    })();
    return () => {
      cancelled = true;
    };
  }, [Camera, requestPermission, vcHasPermission]);

  useEffect(() => {
    if (permission !== 'granted') {
      setDevice(undefined);
      setInitialized(false);
      return;
    }

    let cancelled = false;
    const refresh = () => {
      const next = pickDevice(Camera, hookDevice);
      if (!cancelled && next) {
        setDevice((prev) => (prev?.id === next.id ? prev : next));
        setError(null);
      }
      return !!next;
    };

    refresh();
    const listener = Camera.addCameraDevicesChangedListener(() => {
      refresh();
    });
    // CameraX ProcessCameraProvider often finishes after first JS read — poll briefly.
    const timer = setInterval(() => {
      if (refresh()) clearInterval(timer);
    }, 250);
    const giveUp = setTimeout(() => {
      clearInterval(timer);
      if (!cancelled && !pickDevice(Camera, hookDevice)) {
        setError('No camera found. Check that no other app is using the camera, then reopen this tab.');
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(giveUp);
      listener.remove();
    };
  }, [Camera, hookDevice, permission]);

  useEffect(() => {
    setInitialized(false);
  }, [device?.id]);

  useEffect(() => {
    if (!initialized || !sessionActive) return;

    onReadyRef.current?.(async () => {
      const cam = cameraRef.current;
      if (!cam) {
        throw new Error('Camera is still starting. Wait for the live preview, then try again.');
      }
      try {
        const photo = await cam.takePhoto({ flash: 'off', enableShutterSound: false });
        const fs = require('react-native-fs') as {
          readFile: (path: string, encoding: string) => Promise<string>;
          exists: (path: string) => Promise<boolean>;
        };
        const path = filePathForFs(photo.path);
        if (!(await fs.exists(path))) {
          throw new Error('Captured photo was not saved. Please try again.');
        }
        return fs.readFile(path, 'base64');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to capture photo';
        if (/submit capture request|capture request|not ready|closed/i.test(msg)) {
          throw new Error(
            'Camera preview is not ready. Wait until you see yourself in the frame, then try again.',
          );
        }
        throw err instanceof Error ? err : new Error(msg);
      }
    });
  }, [initialized, sessionActive]);

  if (permission === 'denied') {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.hint}>
          Camera permission denied. Open Android Settings → Apps → Attendance → Permissions, enable
          Camera, then return here.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.hint}>{error}</Text>
      </View>
    );
  }

  if (permission !== 'granted' || !device) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.hint}>
          {permission === 'unknown' ? 'Requesting camera permission…' : 'Starting camera…'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Camera
        ref={cameraRef}
        style={styles.preview}
        device={device}
        isActive={sessionActive}
        preview
        photo
        resizeMode="cover"
        androidPreviewViewType="texture-view"
        onInitialized={() => {
          setInitialized(true);
          setError(null);
        }}
        onError={(err: { message?: string; code?: string }) => {
          setInitialized(false);
          setError(err?.message || err?.code || 'Camera failed to start.');
        }}
      />
      <FaceGuide />
      {!initialized ? (
        <View style={styles.booting} pointerEvents="none">
          <Text style={styles.bootText}>Warming up camera…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    width: '100%',
    minHeight: 180,
    backgroundColor: '#080D1A',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    position: 'relative',
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  hint: {
    color: THEME.textMuted,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  booting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    backgroundColor: 'rgba(7, 12, 24, 0.28)',
  },
  bootText: {
    color: THEME.cyanLight,
    fontSize: 13,
    fontWeight: '700',
  },
  guide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideRing: {
    width: '72%',
    maxWidth: 260,
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'rgba(6, 182, 212, 0.75)',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: THEME.cyan,
  },
  cornerTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
});
