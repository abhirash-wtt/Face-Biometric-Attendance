import React, { useCallback, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../theme/colors';

type Props = {
  onReady?: (capture: () => Promise<string>) => void;
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

export function CameraView({ onReady }: Props) {
  if (Platform.OS === 'web') {
    return <WebCamera onReady={onReady} />;
  }
  return <NativeCamera onReady={onReady} />;
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

  React.useEffect(() => {
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
      try { channel?.postMessage({ ...msg, clientId }); } catch { /* closed */ }
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

    const requestPeerRelease = () => new Promise<boolean>((resolve) => {
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
            acquire().catch(() => {}).finally(() => {
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
    const acquireAndWatch = () => acquire().catch(() => {}).finally(() => {
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

function NativeCamera({ onReady }: Props) {
  const cameraRef = useRef<{ takePhoto: (opts: object) => Promise<{ path: string }> } | null>(
    null,
  );
  let Camera: React.ComponentType<Record<string, unknown>> | null = null;
  let device: unknown;
  try {
    const vision = require('react-native-vision-camera');
    Camera = vision.Camera;
    device = vision.useCameraDevice ? vision.useCameraDevice('front') : undefined;
  } catch {
    Camera = null;
  }

  React.useEffect(() => {
    onReady?.(async () => {
      if (!cameraRef.current) throw new Error('Camera not ready');
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: 'speed' });
      const fs = require('react-native-fs');
      return fs.readFile(photo.path, 'base64');
    });
  }, [onReady]);

  if (!Camera || !device) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.hint}>Point the kiosk camera at the employee</Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
      <FaceGuide />
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
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  hint: { color: THEME.textMuted, textAlign: 'center', paddingHorizontal: 16, fontSize: 15, fontWeight: '600' },
  guide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideRing: {
    width: '70%',
    maxWidth: 270,
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'rgba(6, 182, 212, 0.75)',
    backgroundColor: 'transparent',
    boxShadow: '0 0 0 9999px rgba(7, 12, 24, 0.55)',
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

