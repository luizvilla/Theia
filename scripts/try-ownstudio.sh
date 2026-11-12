#!/usr/bin/env bash
# Try OwnStudio 2.0 (slice 1) from the Start page, with a fresh home and profile.
#
#   scripts/try-ownstudio.sh
#
# Everything goes to /data/ownstudio/try/<date-time>/: OwnStudio's home (your
# setups, the Core mirror), the app profile, and notes.md for your remarks.
# Nothing touches ~/OwnStudio or an earlier trial. Build the app first:
#   (cd app && npm run build)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run="/data/ownstudio/try/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$run/home/.cache" "$run/config" "$run/userdata"

examples="${OWNSTUDIO_EXAMPLES:-$HOME/code/examples}"
branch="$(git -C "$examples" branch --show-current 2>/dev/null || true)"
if [ "$branch" != "ownstudio/buck-extras" ]; then
    echo "The buck example needs OwnStudio's extras: in $examples, run" >&2
    echo "  git checkout ownstudio/buck-extras" >&2
    exit 1
fi

# Core comes from the local mirror of earlier sessions when there is one (offline, seconds);
# otherwise OwnStudio mirrors github.com/owntech-foundation/Core on the first new setup.
local_core=/data/ownstudio/build/nav-home/.cache/core.git
[ -d "$local_core/refs" ] && export OWNSTUDIO_CORE_UPSTREAM="${OWNSTUDIO_CORE_UPSTREAM:-$local_core}"

cat > "$run/notes.md" <<NOTES
# OwnStudio trial, $(date +%Y-%m-%d)

One line per remark: where (workbench, panel), what happened, what you expected.
Mark each: **bug** (broken), **friction** (works, but awkward), **missing**, **idea**, **good**.
The nine steps are SPEC §2's; docs/try-it.md says how to do each.

## 1. Source, Twist and load on the canvas
## 2. The inside of the Twist
## 3. Load an example
## 4. Build and flash
## 5. Switch on and capture a step
## 6. The simulator with the same parameters, and its circuit
## 7. Simulate, drawn over the measurement
## 8. Change a parameter in Design
## 9. Run again, change the code, go back in time
## The AI (if you try Claude Code or Codex)
## Overall: good enough? If not, what first?
NOTES

export OWNSTUDIO_HOME="$run/home"
export OWNSTUDIO_EXAMPLES="$examples"
export OWNSTUDIO_BOARDS="$here/boards"
# One Python for the board bridge, the simulator and PulsimGui (app/python/.venv).
export OWNSTUDIO_PYTHON="${OWNSTUDIO_PYTHON:-$here/app/python/.venv/bin/python}"
export OWNSTUDIO_PIO="${OWNSTUDIO_PIO:-$HOME/.platformio/penv/bin/pio}"
export OWNSTUDIO_MCUMGR="${OWNSTUDIO_MCUMGR:-/data/ownstudio/build/core-otf/owntech/third_party/mcumgr}"
# The simulator compiles control.cpp with OwnTech's control library; it does not look inside .pio.
export OWNSTUDIO_CONTROL_LIBRARY="${OWNSTUDIO_CONTROL_LIBRARY:-/data/ownstudio/build/cache/control_library-1ef8097}"
export THEIA_CONFIG_DIR="$run/config"

echo "OwnStudio trial in $run"
echo "  setups:     $run/home/setups"
echo "  your notes: $run/notes.md"
cd "$here/app/applications/electron"
[ -d plugins ] || npm run download:plugins >/dev/null
exec env -u ELECTRON_RUN_AS_NODE "$here/app/node_modules/electron/dist/electron" . --no-sandbox --plugins=local-dir:plugins \
    --user-data-dir="$run/userdata"
