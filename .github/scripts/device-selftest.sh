#!/usr/bin/env bash
#
# Run the app's database self-test on a booted emulator and fail the job
# unless it passes on the native driver.
#
# The app prints one HASEEB_SELFTEST_RESULT line to the WebView console, which
# Capacitor forwards to logcat. We install the debug APK, launch it with
# ?selftest=1, and read the verdict back out.
set -euo pipefail

# Capacitor's activity has no intent filter for an arbitrary URL, so the
# self-test is switched on at build time rather than through a launch URL.
# The bundle is otherwise identical to the shipped one — same drivers, same
# schema, same seed.
VITE_HASEEB_SELFTEST=1 npm run build
npx cap sync android

cd android
./gradlew --no-daemon assembleDebug
cd ..

APK=android/app/build/outputs/apk/debug/app-debug.apk
echo "Installing $APK"
adb install -r -t "$APK"

adb logcat -c

# Capacitor serves the bundle from https://localhost, so the query string is
# passed through the launch URL the WebView opens.
adb shell am start -n com.haseeb.app/.MainActivity > /dev/null

echo "Waiting for the self-test to report…"
RESULT=""
for _ in $(seq 1 60); do
  if RESULT=$(adb logcat -d | grep -o 'HASEEB_SELFTEST_RESULT .*' | tail -1) && [ -n "$RESULT" ]; then
    break
  fi
  sleep 3
done

echo "--- self-test checks ---"
adb logcat -d | grep -o 'HASEEB_SELFTEST_CHECK .*' || true
echo "------------------------"

if [ -z "$RESULT" ]; then
  echo "::error::The self-test never reported. Recent app log:"
  adb logcat -d | tail -120
  exit 1
fi

echo "$RESULT"

case "$RESULT" in
  *PASS*engine=capacitor*)
    echo "::notice::Native SQLite driver verified on device."
    ;;
  *PASS*engine=sqljs*)
    echo "::error::The app fell back to the WebAssembly driver on a device — the native driver did not load."
    exit 1
    ;;
  *)
    echo "::error::Database self-test failed on device."
    adb logcat -d | tail -120
    exit 1
    ;;
esac
