#!/usr/bin/env bash
# Copies notification sounds from assets into the iOS native bundle used by Xcode builds.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_WAV="$ROOT/assets/sounds/livechat.wav"
DST_WAV="$ROOT/ios/Odyssea/livechat.wav"

if [[ ! -f "$SRC_WAV" ]]; then
  echo "Missing $SRC_WAV — run from odyssea-expo after adding livechat.wav to assets/sounds."
  exit 1
fi

if [[ ! -d "$ROOT/ios/Odyssea" ]]; then
  echo "Missing ios/Odyssea — run npx expo prebuild first."
  exit 1
fi

cp "$SRC_WAV" "$DST_WAV"
echo "Synced livechat.wav -> ios/Odyssea/livechat.wav ($(wc -c < "$DST_WAV") bytes)"
