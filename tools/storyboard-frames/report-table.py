#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-2.1-only
"""Print the slice report's side-by-side table: storyboard frame, app screenshot, differences.

    python3 tools/storyboard-frames/report-table.py >> docs/step-5-slice-1-report.md
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGES = ROOT / "docs/images/step-5"
shots = {r["frame"]: r for r in json.loads((IMAGES / "shots.json").read_text())}
boards = sorted((IMAGES / "storyboard").glob("frame-*.png"))


def key(path):
    num = path.stem.split("-")[1]
    return (float(num.rstrip("b")) + (0.5 if num.endswith("b") else 0))


for board in sorted(boards, key=key):
    num = board.stem.split("-")[1].lstrip("0") or "0"
    shot = shots.get(num)
    app = IMAGES / f"frame-{board.stem.split('-', 1)[1]}.png"
    if shot:
        app = IMAGES / shot["file"]
    title = shot["title"] if shot else board.stem.split("-", 2)[2].replace("-", " ")
    print(f"\n### Frame {num}: {title}\n")
    print("| Storyboard | OwnStudio |\n| --- | --- |")
    right = f"![app](images/step-5/{app.name})" if app.is_file() else "(no screenshot)"
    print(f"| ![storyboard](images/step-5/storyboard/{board.name}) | {right} |\n")
    for line in (shot or {}).get("differences", []):
        print(f"- {line}")
    if not shot and app.is_file():
        print("- Captured by its own gate (see the Work log), not by shots.mjs.")
