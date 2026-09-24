# Attendance mobile app (React Native Bare)

Screens match the development document:

- `src/screens/KioskScreen.tsx` — identify + clock IN/OUT + active liveness prompts
- `src/screens/EnrollScreen.tsx` — capture multiple face samples
- `src/screens/SettingsScreen.tsx` — API URL, device bind, login, offline sync

## Install the release APK on a phone

1. Copy `dist/Attendance-release.apk` to the phone (USB, Drive, etc.).
2. On the phone: allow install from unknown sources / “Install unknown apps” for your file manager.
3. Open the APK and install **Attendance** (`com.attendance.app`).
4. Grant **Camera** and **Location** when prompted.
5. Open **Settings** in the app and set **API URL** to your PC’s LAN address, e.g. `http://192.168.x.x:3000` (not `10.0.2.2` — that is emulator-only).
6. Ensure the phone and PC are on the same Wi‑Fi, and the API is running and reachable.

Rebuild later with:

```bash
npm run build:apk
```

(On Windows, if Gradle fails inside a path with spaces, build from a copy under e.g. `C:\rn-apk-build`.)

## Run on Android / iOS

Native Android project lives in `android/`.

```bash
npm install
npm run android          # debug on device/emulator
npm run build:apk        # release APK for phones
```

APK output: `android/app/build/outputs/apk/release/app-release.apk` (also copied to `dist/Attendance-release.apk` when using the clean build flow).

Permissions already set in `AndroidManifest.xml`:

- Android: `CAMERA`, `ACCESS_FINE_LOCATION`, cleartext HTTP for LAN API
- iOS `Info.plist`: `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`

Settings → API URL:

- Emulator: `http://10.0.2.2:3000`
- Physical phone (same Wi‑Fi as API PC): `http://<PC-LAN-IP>:3000`

Bind the kiosk with secret `bind-device-once` (or admin login), enroll 3+ samples, then use Kiosk.
