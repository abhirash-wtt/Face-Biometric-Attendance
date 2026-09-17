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

function WebCamera({ onReady }: Props) {
  const videoRef = useRef<unknown>(null);
  const streamRef = useRef<{ getTracks: () => Array<{ stop: () => void }> } | null>(null);

  const captureWeb = useCallback(async () => {
    const video = videoRef.current as {
      videoWidth: number;
      videoHeight: number;
    } | null;
    if (!video) throw new Error('Camera not ready');
    const srcW = video.videoWidth || 480;
    const srcH = video.videoHeight || 480;
    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Capture failed');
    ctx.drawImage(video as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75).replace(/^data:image\/\w+;base64,/, '');
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) return;
        streamRef.current = stream;
        const node = videoRef.current as { srcObject: unknown; play: () => Promise<void> } | null;
        if (node) {
          node.srcObject = stream;
          await node.play();
        }
        onReady?.(captureWeb);
      } catch {
        onReady?.(async () => {
          throw new Error('Camera permission denied');
        });
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onReady, captureWeb]);

  return (
    <View style={styles.box}>
      {React.createElement('video', {
        ref: (el: unknown) => {
          videoRef.current = el;
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

