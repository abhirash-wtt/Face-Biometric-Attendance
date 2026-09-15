import { Platform } from 'react-native';

export type Gps = { lat: number; lng: number; accuracy?: number };

const gpsOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

function fromCoords(coords: { latitude: number; longitude: number; accuracy?: number }): Gps {
  return { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
}

function bestSample(samples: Gps[]): Gps | null {
  if (!samples.length) return null;
  return [...samples].sort((a, b) => (a.accuracy ?? 999) - (b.accuracy ?? 999))[0];
}

export async function getCurrentGps(): Promise<Gps | null> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      const samples: Gps[] = [];
      const watchId = navigator.geolocation.watchPosition(
        (pos) => samples.push(fromCoords(pos.coords)),
        () => {},
        gpsOptions,
      );
      navigator.geolocation.getCurrentPosition(
        (pos) => samples.push(fromCoords(pos.coords)),
        () => {},
        gpsOptions,
      );
      setTimeout(() => {
        navigator.geolocation.clearWatch(watchId);
        resolve(bestSample(samples));
      }, 2500);
    });
  }
  try {
    const Geo = require('react-native-geolocation-service');
    return await new Promise((resolve) => {
      const samples: Gps[] = [];
      const watchId = Geo.default.watchPosition(
        (pos: { coords: { latitude: number; longitude: number; accuracy?: number } }) =>
          samples.push(fromCoords(pos.coords)),
        () => {},
        gpsOptions,
      );
      Geo.default.getCurrentPosition(
        (pos: { coords: { latitude: number; longitude: number; accuracy?: number } }) =>
          samples.push(fromCoords(pos.coords)),
        () => {},
        gpsOptions,
      );
      setTimeout(() => {
        Geo.default.clearWatch(watchId);
        resolve(bestSample(samples));
      }, 2500);
    });
  } catch {
    return null;
  }
}
