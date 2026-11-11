#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-only
# Usage: tools/storyboard-shots/run.sh <port> <folder|-> <script.mjs> [args...]
# Starts this checkout's OwnStudio with a debug port and a throwaway profile
# (user data, Theia config and OwnStudio home under /data/ownstudio/build),
# runs the script against it, then stops exactly the processes of that run
# (binary + port). "-" opens no folder (the Start page).
# OWNSTUDIO_PYTHON, OWNSTUDIO_EXAMPLES, OWNSTUDIO_CORE_UPSTREAM pass through;
# OWNSTUDIO_HOME defaults to the throwaway home.
set -u
port="$1"; folder="$2"; script="$3"; shift 3
root="$(cd "$(dirname "$0")/../.." && pwd)"
app="$root/app/applications/electron"
bin="$root/app/node_modules/electron/dist/electron"
scratch="${OWNSTUDIO_SCRATCH:-/data/ownstudio/build}/shots-$port"
rm -rf "$scratch"; mkdir -p "$scratch/config" "$scratch/home"
[ "$folder" = "-" ] && folder=""
export OWNSTUDIO_PYTHON="${OWNSTUDIO_PYTHON:-/data/ownstudio/build/venv-mission/bin/python}"
export OWNSTUDIO_HOME="${OWNSTUDIO_HOME:-$scratch/home}"
export OWNSTUDIO_BOARDS="${OWNSTUDIO_BOARDS:-$root/boards}"
# Frame 7 needs deterministic progress without requiring a board. Callers can
# override either tool when testing a real build or a real Twist.
export OWNSTUDIO_PIO="${OWNSTUDIO_PIO:-$root/tools/storyboard-shots/fake-pio.mjs}"
export OWNSTUDIO_BUILD_PYTHON="${OWNSTUDIO_BUILD_PYTHON:-$root/tools/storyboard-shots/fake-flash.mjs}"
(cd "$app" && THEIA_CONFIG_DIR="$scratch/config" env -u ELECTRON_RUN_AS_NODE "$bin" . --remote-debugging-port="$port" \
    --no-sandbox --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling \
    --user-data-dir="$scratch/userdata" --plugins=local-dir:plugins ${folder:+"$folder"} > "$scratch/app.log" 2>&1 &)
for _ in $(seq 1 90); do curl -s "http://127.0.0.1:$port/json" 2>/dev/null | grep -q '"page"' && break; sleep 1; done
node "$(cd "$(dirname "$script")" && pwd)/$(basename "$script")" "$port" "$@"; status=$?
# Theia relaunches its main process; repeat until no process of this run is left.
for _ in 1 2 3 4 5; do
    pids=$(pgrep -f "^$bin .*--remote-debugging-port=$port")
    [ -z "$pids" ] && break
    kill $pids; sleep 2
done
exit $status
