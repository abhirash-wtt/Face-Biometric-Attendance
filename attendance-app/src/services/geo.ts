import { Platform } from 'react-native';

export type Gps = { lat: number; lng: number };

export async function getCurrentGps(): Promise<Gps | null> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 4000, maximumAge: 15000 },
      );
    });
  }
  try {
    const Geo = require('react-native-geolocation-service');
    return await new Promise((resolve) => {
      Geo.default.getCurrentPosition(
        (pos: { coords: { latitude: number; longitude: number } }) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 4000, maximumAge: 15000 },
      );
    });
  } catch {
    return null;
  }
}
