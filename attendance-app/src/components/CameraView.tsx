import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

type Props = {
  onReady?: (capture: () => Promise<string>) => void;
};

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
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Capture failed');
    ctx.drawImage(video as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/\w+;base64,/, '');
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
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
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      })}
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
      <View style={styles.box}>
        <Text style={styles.hint}>Point the kiosk camera at the employee</Text>
      </View>
    );
  }

  return (
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive
      photo
    />
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: '#0b1220',
    overflow: 'hidden',
    borderRadius: 16,
  },
  hint: { color: '#9fb0c8', textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
});
