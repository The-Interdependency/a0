#!/bin/bash
# Install / update the signed a0 APK on a connected phone.
#
#   bash scripts/install-android.sh              # adb install -r + launch
#
# Requires: platform-tools adb on PATH, one authorized device.
set -euo pipefail
cd "$(dirname "$0")/.."

APK="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  echo "[android] APK missing — run: bash scripts/build-android.sh" >&2
  exit 1
fi

echo "[android] devices:"
adb devices

echo "[android] installing $APK"
adb install -r "$APK"

echo "[android] launching org.interdependentway.a0"
adb shell monkey -p org.interdependentway.a0 -c android.intent.category.LAUNCHER 1 >/dev/null
echo "[android] installed and launched"
