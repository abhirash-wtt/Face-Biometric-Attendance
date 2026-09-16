import { PermissionsAndroid, Platform } from 'react-native';

export type Gps = { lat: number; lng: number; accuracy?: number };

/** Cap total GPS wait; early-exit when accuracy is good enough for geofence. */
const GPS_MAX_WAIT_MS = 5000;
const GPS_GOOD_ACCURACY_M = 50;
const GPS_EARLY_MIN_MS = 350;
const gpsOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 20000 };

function fromCoords(coords: { latitude: number; longitude: number; accuracy?: number }): Gps {
  return { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
}

function bestSample(samples: Gps[]): Gps | null {
  if (!samples.length) return null;
  return [...samples].sort((a, b) => (a.accuracy ?? 999) - (b.accuracy ?? 999))[0];
}

function insecureWebOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    !window.isSecureContext &&
    !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  );
}

function geolocationErrorMessage(code?: number, secureContext = false): string {
  if (secureContext) {
    return 'Location needs a secure connection. Open the kiosk over https:// instead of http://.';
  }
  if (code === 1) {
    return 'Location permission denied. Allow location for this app in settings, then retry.';
  }
  if (code === 2) {
    return 'Location unavailable. Enable GPS and try again near a window.';
  }
  if (code === 3) {
    return 'Location timed out. Move closer to a window and retry.';
  }
  return 'Location is required. Allow GPS and stand inside the office.';
}

type GeoPosition = {
  coords: { latitude: number; longitude: number; accuracy?: number };
};
type GeoError = { code?: number; message?: string };

type GeoApi = {
  getCurrentPosition: (
    success: (pos: GeoPosition) => void,
    error: (err: GeoError) => void,
    options: typeof gpsOptions,
  ) => void;
  watchPosition: (
    success: (pos: GeoPosition) => void,
    error: (err: GeoError) => void,
    options: typeof gpsOptions,
  ) => number;
  clearWatch: (id: number) => void;
};

function collectGps(geo: GeoApi): Promise<Gps> {
  return new Promise((resolve, reject) => {
    const samples: Gps[] = [];
    let lastError: GeoError | null = null;
    let settled = false;
    let watchId: number | null = null;
    const startedAt = Date.now();
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (maxTimer != null) clearTimeout(maxTimer);
      if (watchId != null) geo.clearWatch(watchId);
      const best = bestSample(samples);
      if (best) return resolve(best);
      reject(new Error(geolocationErrorMessage(lastError?.code)));
    };

    const onPos = (pos: GeoPosition) => {
      samples.push(fromCoords(pos.coords));
      const best = bestSample(samples);
      const elapsed = Date.now() - startedAt;
      if (
        best &&
        best.accuracy != null &&
        best.accuracy <= GPS_GOOD_ACCURACY_M &&
        elapsed >= GPS_EARLY_MIN_MS
      ) {
        finish();
      }
    };
    const onErr = (err: GeoError) => {
      lastError = err;
    };

    geo.getCurrentPosition(onPos, onErr, gpsOptions);
    watchId = geo.watchPosition(onPos, onErr, gpsOptions);
    maxTimer = setTimeout(finish, GPS_MAX_WAIT_MS);
  });
}

async function ensureNativeLocationPermission(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Geo = require('react-native-geolocation-service').default as {
      requestAuthorization: (mode: 'whenInUse' | 'always') => Promise<string> | string;
    };
    if (Platform.OS === 'ios') {
      const status = await Geo.requestAuthorization('whenInUse');
      if (status !== 'granted') {
        throw new Error(geolocationErrorMessage(1));
      }
      return;
    }
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location permission',
          message: 'Face Attendance needs your location to confirm you are at the office.',
          buttonPositive: 'Allow',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error(geolocationErrorMessage(1));
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Location permission')) throw err;
    throw new Error(
      'Location service is unavailable. Add react-native-geolocation-service and rebuild the app.',
    );
  }
}

export async function getCurrentGps(): Promise<Gps> {
  if (Platform.OS === 'web') {
    if (insecureWebOrigin()) {
      throw new Error(geolocationErrorMessage(undefined, true));
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('This browser does not support location.');
    }
    return collectGps(navigator.geolocation);
  }

  await ensureNativeLocationPermission();
  const Geo = require('react-native-geolocation-service').default as GeoApi;
  return collectGps(Geo);
}
