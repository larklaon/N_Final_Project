#!/bin/bash
set -euo pipefail
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
task_adb="$ANDROID_HOME/platform-tools/adb"
task_serial="${1:-emulator-5554}"
task_avd="$($task_adb -s "$task_serial" emu avd name | head -1 | tr -d '\r')"
if [[ "$task_avd" != "teum-api36" || "${TEUM_RESET_FIXTURES:-0}" != "1" ]]; then
  echo 'This smoke test resets synthetic learning data only on teum-api36. Set TEUM_RESET_FIXTURES=1 explicitly.' >&2
  exit 1
fi
mkdir -p artifacts
"$task_adb" -s "$task_serial" shell am force-stop com.teumknowledge.app
"$task_adb" -s "$task_serial" shell run-as com.teumknowledge.app rm -f files/SQLite/teum.db files/SQLite/teum.db-wal files/SQLite/teum.db-shm
"$task_adb" -s "$task_serial" reverse tcp:8081 tcp:8081
"$task_adb" -s "$task_serial" shell am instrument -w -e class com.teumknowledge.app.MainFlowTest com.teumknowledge.app.test/androidx.test.runner.AndroidJUnitRunner | tee artifacts/ui-smoke.log
grep -q 'OK (1 test)' artifacts/ui-smoke.log
