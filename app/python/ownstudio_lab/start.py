# SPDX-License-Identifier: LGPL-2.1
"""What the Start page shows (SPEC §5, storyboard frame 1): boards, recent setups, examples.

Usage: python -m ownstudio_lab.start --home DIR --boards DIR [--examples DIR]
prints JSON. Boards come from the board descriptions (``boards/*/board.yaml``)
plus the OwnTech boards not described yet; recent setups are the folders under
``<home>/setups`` holding ``ownstudio/setup.yaml``, newest first.
"""
import argparse
import json
import os
import sys
from dataclasses import asdict

import yaml

from . import examples as ex
from .setups import SETUP_FILE

# OwnTech boards OwnStudio knows of before they have a board description.
KNOWN_BOARDS = [
    {"board": "spin", "label": "Spin", "summary": "the controller alone", "defined": False},
    {"board": "ownverter", "label": "Ownverter", "summary": "3-phase", "defined": False},
]
SUMMARY = {"twist": "2 legs · buck, boost, inverter"}


def boards(boards_dir):
    out = []
    for name in sorted(os.listdir(boards_dir)) if os.path.isdir(boards_dir) else []:
        path = os.path.join(boards_dir, name, "board.yaml")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                d = yaml.safe_load(f)
            out.append({"board": d["board"], "label": d.get("label", name), "summary": SUMMARY.get(d["board"], ""),
                        "controller": d.get("controller"), "defined": True})
    have = {b["board"] for b in out}
    return out + [b for b in KNOWN_BOARDS if b["board"] not in have]


def recent_setups(home, limit=8):
    root = os.path.join(home, "setups")
    out = []
    for name in os.listdir(root) if os.path.isdir(root) else []:
        path = os.path.join(root, name)
        setup_file = os.path.join(path, SETUP_FILE)
        if not os.path.exists(setup_file):
            continue
        with open(setup_file, encoding="utf-8") as f:
            d = yaml.safe_load(f) or {}
        out.append({"name": d.get("name", name), "board": d.get("board", ""), "path": path,
                    "modified": os.path.getmtime(os.path.join(path, ".git")) if os.path.exists(os.path.join(path, ".git")) else os.path.getmtime(setup_file)})
    return sorted(out, key=lambda s: -s["modified"])[:limit]


def start_info(home, boards_dir, examples_dir=None):
    return {
        "boards": boards(boards_dir),
        "recent": recent_setups(home),
        "examples": [asdict(e) for e in ex.index(examples_dir)] if examples_dir and os.path.isdir(examples_dir) else [],
        "examplesFound": bool(examples_dir and os.path.isdir(examples_dir)),
    }


def main(argv):
    p = argparse.ArgumentParser(prog="ownstudio_lab.start")
    p.add_argument("--home", required=True)
    p.add_argument("--boards", required=True)
    p.add_argument("--examples")
    a = p.parse_args(argv[1:])
    json.dump(start_info(a.home, a.boards, a.examples), sys.stdout, indent=1)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
