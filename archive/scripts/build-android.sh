#!/bin/bash
# Build the signed a0 Android APK around the existing React GUI.
#
#   bash scripts/build-android.sh          # full build -> signed APK
#
# Steps:
#   1. npm run build                      (existing frontend build, unchanged)
#   2. inject android/a0-bridge.js into dist/public (typed native bridge)
#   3. npx cap sync android
#   4. gradle assembleRelease             (signed with the preserved keystore)
#   5. apksigner verify + zipalign check
#
# The signing key is preserved at:
#   repo (gitignored): android/keystore/a0-release.keystore
#   backup:            /work/artifacts/a0-release.keystore
#   credentials:       /work/artifacts/a0-keystore-credentials.txt (chmod 600)
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-/work/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "[android] building frontend (no React rebuild — existing npm run build)"
npm run build >/tmp/a0-android-frontend-build.log 2>&1 || { tail -20 /tmp/a0-android-frontend-build.log; exit 1; }

echo "[android] injecting a0-bridge.js into built GUI"
cp android/a0-bridge.js dist/public/a0-bridge.js
if ! grep -q 'src="/a0-bridge.js"' dist/public/index.html; then
  python3 - <<'PY'
from pathlib import Path
p = Path("dist/public/index.html")
html = p.read_text(encoding="utf-8")
tag = '<script src="/a0-bridge.js"></script>'
if tag not in html:
    if "</head>" in html:
        html = html.replace("</head>", tag + "</head>", 1)
    else:
        html = tag + html
    p.write_text(html, encoding="utf-8")
PY
fi

echo "[android] cap sync"
npx cap sync android 2>&1 | tail -2

echo "[android] gradle assembleRelease"
cd android
./gradlew assembleRelease --no-daemon -q 2>&1 | tail -5 || { echo "gradle failed"; exit 1; }
cd ..

APK="android/app/build/outputs/apk/release/app-release.apk"
ZIPALIGN="$ANDROID_HOME/build-tools/35.0.0/zipalign"
APKSIGNER="$ANDROID_HOME/build-tools/35.0.0/apksigner"
"$ZIPALIGN" -c 4 "$APK" >/dev/null 2>&1 && echo "[android] zipalign: ok" || echo "[android] zipalign: check failed"
"$APKSIGNER" verify --print-certs "$APK" 2>/dev/null | grep -E "Signer #1 certificate DN|Verified using" | head -3 || true
echo "[android] APK: $APK"
sha256sum "$APK"
ls -la "$APK"
