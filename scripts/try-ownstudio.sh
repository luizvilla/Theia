#!/usr/bin/env bash
# Try OwnStudio on a fresh copy of a mission, with a fresh profile.
#
#   scripts/try-ownstudio.sh [mission-folder]
#
# Everything goes to /data/ownstudio/try/<date-time>/: the mission copy (your
# edits never touch the real mission repository), the app profile, the study
# log, and notes.md for your remarks. Build the app first (see app/JOURNAL.md).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_mission="${1:-$HOME/code/examples/TWIST/DC_DC/buck_voltage_mode/mission}"
run="/data/ownstudio/try/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$run/config" "$run/userdata"

# A copy of the mission, as its own git repository (OwnStudio reads its commit)
rsync -a --exclude records --exclude .git --exclude __pycache__ "$source_mission/" "$run/mission/"
git -C "$run/mission" init -q
git -C "$run/mission" add -A
git -C "$run/mission" -c user.name="OwnStudio trial" -c user.email=trial@invalid commit -qm "trial copy of $source_mission"

cat > "$run/notes.md" <<NOTES
# OwnStudio trial, $(date +%Y-%m-%d)

One line per remark: where (workbench, panel), what happened, what you expected.
Mark each: **bug** (broken), **friction** (works, but awkward), **missing**, **idea**, **good**.

## As a student (the Mission steps panel, steps 1 to 5)

## Home

## Design

## Code (and the AI, if a key is set)

## Lab, control center, procedures

## Overall: what should OwnStudio be better at, first?
NOTES

export OWNSTUDIO_PYTHON=/data/ownstudio/build/venv-mission/bin/python
export OWNSTUDIO_MCUMGR=/data/ownstudio/build/core-otf/owntech/third_party/mcumgr
export THEIA_CONFIG_DIR="$run/config"
# 2.0: board descriptions from this checkout; OwnTech's examples from a local clone when there is one
# (the Start page lists them); setups go to ~/OwnStudio/setups, Core is mirrored in ~/OwnStudio/.cache.
export OWNSTUDIO_BOARDS="$here/boards"
[ -d "$HOME/code/examples/TWIST" ] && export OWNSTUDIO_EXAMPLES="${OWNSTUDIO_EXAMPLES:-$HOME/code/examples}"
echo "OwnStudio trial in $run"
echo "  mission copy: $run/mission"
echo "  your notes:   $run/notes.md"
cd "$here/app/applications/electron"
[ -d plugins ] || npm run download:plugins >/dev/null
exec env -u ELECTRON_RUN_AS_NODE "$here/app/node_modules/electron/dist/electron" . --no-sandbox --plugins=local-dir:plugins \
    --user-data-dir="$run/userdata" "$run/mission"
