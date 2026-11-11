# SPDX-License-Identifier: LGPL-2.1
"""The index of OwnTech's examples, filtered by board (ADR 0025, Q118, Q128).

The examples repository has no index file: an example is a folder holding a
``main.cpp``, under ``<BOARD>/<group>/...``. Its board is read from its
``app.ini`` (``board_shield = twist``) and otherwise inferred from the top
folder (TWIST, SPIN, OWNVERTER), until a ``board`` field is added upstream.
Its title is the first heading of its README.
"""
import configparser
import os
import re
from dataclasses import dataclass

TOP_FOLDERS = {"TWIST": "twist", "SPIN": "spin", "OWNVERTER": "ownverter"}


@dataclass
class Example:
    board: str
    group: str
    name: str
    title: str
    path: str           # relative to the examples repository
    extras: bool        # carries OwnStudio extras (an ownstudio/ or mission/ folder)


def _board_of(folder, top):
    ini = os.path.join(folder, "app.ini")
    if os.path.exists(ini):
        parser = configparser.ConfigParser(strict=False, interpolation=None)
        try:
            parser.read(ini, encoding="utf-8")
            shield = parser.get("env", "board_shield", fallback="").strip()
            if shield:
                return shield.lower()
        except configparser.Error:
            pass
    return TOP_FOLDERS.get(top)


def _title_of(folder, name):
    readme = os.path.join(folder, "README.md")
    if os.path.exists(readme):
        with open(readme, encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"#\s+(.+)", line)
                if m:
                    return m.group(1).strip()
    return name.replace("_", " ")


def index(root, board=None):
    """Every example under ``root``, sorted by group then title; only ``board``'s when given."""
    out = []
    for top in sorted(os.listdir(root)):
        if top not in TOP_FOLDERS:
            continue
        for dirpath, dirnames, filenames in os.walk(os.path.join(root, top)):
            dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in ("mission", "ownstudio", "Image"))
            if "main.cpp" not in filenames:
                continue
            rel = os.path.relpath(dirpath, root)
            parts = rel.split(os.sep)
            example = Example(
                board=_board_of(dirpath, top) or "",
                group=parts[1] if len(parts) > 2 else "",
                name=parts[-1],
                title=_title_of(dirpath, parts[-1]),
                path=rel.replace(os.sep, "/"),
                extras=any(os.path.isdir(os.path.join(dirpath, d)) for d in ("ownstudio", "mission")),
            )
            if board is None or example.board == board:
                out.append(example)
    return sorted(out, key=lambda e: (e.group.lower(), e.title.lower()))
