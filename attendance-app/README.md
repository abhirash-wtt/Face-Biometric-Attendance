# Attendance mobile app (React Native Bare)

Screens match the development document:

- `src/screens/KioskScreen.tsx` — identify + clock IN/OUT + active liveness prompts
- `src/screens/EnrollScreen.tsx` — capture multiple face samples
- `src/screens/SettingsScreen.tsx` — API URL, device bind, login, offline sync

## Run on Android / iOS

The `src/` tree is the application. Generate native projects once (from this folder’s parent, or copy `src` into a CLI app):

```bash
npx @react-native-community/cli@latest init AttendanceNative --version 0.76.6
# copy this src/, App.tsx, index.js, package.json dependencies into that project
npx react-native run-android
```

Add camera permission:

- Android `AndroidManifest.xml`: `CAMERA`, `ACCESS_FINE_LOCATION`
- iOS `Info.plist`: `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`

Settings → API URL:

- Emulator: `http://10.0.2.2:3000`
- Device: `http://<LAN-IP>:3000`

Bind the kiosk with secret `bind-device-once` (or admin login), enroll 3+ samples, then use Kiosk.
