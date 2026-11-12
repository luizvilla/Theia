# SPDX-License-Identifier: LGPL-2.1
"""The default capture shipped by a board description.

Examples do not need their own procedure: ``ownstudio/setup.yaml`` names the
board, and ``boards/<board>/board.yaml`` supplies the channels, reference step
and window. The procedure is deliberately a regular procedure module so the
same runner, power guard and record path are used as for authored procedures.
"""
from __future__ import annotations

import csv
import io
import os
import pathlib

import numpy as np
import yaml


PROCEDURE = {
    "title": "Capture: reference step",
    "targets": ["board"],
    "tests": [],
    "level": "L1",
    "power_on": {"group": "Converter", "name": "Mode", "value": 1},
}


class CaptureError(ValueError):
    pass


def _board_dirs() -> list[pathlib.Path]:
    configured = [pathlib.Path(p) for p in os.environ.get("OWNSTUDIO_BOARDS", "").split(os.pathsep) if p]
    source_tree = pathlib.Path(__file__).resolve().parents[3] / "boards"
    return configured + [source_tree]


def load_default_capture(mission: pathlib.Path) -> dict:
    """Read and minimally validate this setup's board capture description."""
    setup_path = mission / "ownstudio" / "setup.yaml"
    if not setup_path.is_file():
        raise CaptureError("the default capture is available in an OwnStudio setup")
    setup = yaml.safe_load(setup_path.read_text()) or {}
    board = setup.get("board")
    if not isinstance(board, str) or not board:
        raise CaptureError("ownstudio/setup.yaml does not name a board")
    description_path = next((d / board / "board.yaml" for d in _board_dirs() if (d / board / "board.yaml").is_file()), None)
    if description_path is None:
        raise CaptureError(f"no board description for {board}")
    description = yaml.safe_load(description_path.read_text()) or {}
    capture = description.get("default_capture")
    if not isinstance(capture, dict):
        raise CaptureError(f"the {board} board has no default_capture")
    required = ("channels", "reference", "power_on", "duration_s", "pretrigger_s", "sample_period_s")
    missing = [key for key in required if key not in capture]
    if missing:
        raise CaptureError(f"the {board} default capture is missing {', '.join(missing)}")
    capture = dict(capture)
    probes = (setup.get("canvas") or {}).get("probes") or []
    chosen = [{"label": probe.get("label", probe.get("object", "probe")), "object": probe.get("object"),
               "unit": probe.get("unit", "")}
              for probe in probes if probe.get("kind") == "capture" and probe.get("object")]
    if chosen:
        capture["channels"] = chosen
    return {"board": board, **capture}


def procedure_info(mission: pathlib.Path) -> dict | None:
    """ProcedureInfo for the bridge, or None when this is not a setup."""
    if not (mission / "ownstudio" / "setup.yaml").is_file():
        return None
    config = load_default_capture(mission)
    return {
        "path": str(pathlib.Path(__file__).resolve()),
        "title": config.get("title", PROCEDURE["title"]),
        "targets": ["board"],
        "tests": [],
        "level": "L1",
        "power_on": True,
        "doc": "Arm the firmware scope, step the voltage reference, file the capture and switch power off.",
        "capture": {
            "channels": config["channels"],
            "reference": config["reference"],
            "duration_s": config["duration_s"],
            "pretrigger_s": config["pretrigger_s"],
            "sample_period_s": config["sample_period_s"],
        },
    }


def _canvas_conditions(mission: pathlib.Path) -> dict:
    setup = yaml.safe_load((mission / "ownstudio" / "setup.yaml").read_text()) or {}
    nodes = (setup.get("canvas") or {}).get("nodes") or []
    conditions = {}
    for node in nodes:
        values = node.get("values") or {}
        if node.get("part") == "dc-source":
            conditions.update(v_high_V=values.get("voltage"), source_limit_A=values.get("limit"))
        elif node.get("part") == "resistor" and "load_ohm" not in conditions:
            conditions["load_ohm"] = values.get("ohm")
    return {key: value for key, value in conditions.items() if value is not None}


def waveform_csv(wave: dict, channels: list[dict]) -> str:
    """CSV with stable probe labels; unavailable requested channels are omitted."""
    chosen = [channel for channel in channels if channel.get("object") in wave]
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["t_s", *[f"{channel['label']}_{channel.get('unit', '')}".rstrip("_") for channel in chosen]])
    for index, t in enumerate(wave["t"]):
        writer.writerow([f"{float(t):.9g}", *[f"{float(wave[channel['object']][index]):.9g}" for channel in chosen]])
    return output.getvalue()


def _metrics(wave: dict, channel: str, before: float, after: float) -> list[dict]:
    values = np.asarray(wave[channel], dtype=float)
    time = np.asarray(wave["t"], dtype=float)
    final = float(values[-max(1, len(values) // 20):].mean())
    span = after - before
    lo, hi = before + 0.1 * span, before + 0.9 * span
    crossed_lo = np.flatnonzero(time >= 0.0)
    crossed_lo = crossed_lo[values[crossed_lo] >= lo] if span >= 0 else crossed_lo[values[crossed_lo] <= lo]
    crossed_hi = np.flatnonzero(time >= 0.0)
    crossed_hi = crossed_hi[values[crossed_hi] >= hi] if span >= 0 else crossed_hi[values[crossed_hi] <= hi]
    rise_ms = float((time[crossed_hi[0]] - time[crossed_lo[0]]) * 1e3) if len(crossed_lo) and len(crossed_hi) else None
    overshoot = max(0.0, float((values.max() - after) / abs(span) * 100)) if span else 0.0
    return [
        {"id": "CAPTURE.final", "title": "Final voltage", "criterion": "information only",
         "measured": final, "expected": after, "unit": "V", "verdict": "INFO"},
        {"id": "CAPTURE.rise", "title": "10–90 % rise time", "criterion": "information only",
         **({"measured": rise_ms, "unit": "ms"} if rise_ms is not None else {"reason": "thresholds not crossed"}),
         "verdict": "INFO"},
        {"id": "CAPTURE.overshoot", "title": "Overshoot", "criterion": "information only",
         "measured": overshoot, "unit": "%", "verdict": "INFO"},
    ]


def run(target, ctx):
    config = load_default_capture(ctx.mission)
    reference = config["reference"]
    power = config["power_on"]
    before, after = float(reference["from"]), float(reference["to"])
    ctx.log(f"Preparing {before:g} → {after:g} {reference.get('unit', '')} reference step…")
    target.update(reference["group"], {reference["name"]: before})
    target.update(power["group"], {power["name"]: power["value"]})
    target.wait(max(float(config["pretrigger_s"]), 0.02))
    target.arm()
    target.update(reference["group"], {reference["name"]: after})
    target.wait(max(0.0, float(config["duration_s"]) - float(config["pretrigger_s"])))
    wave = target.capture()
    available = next((c["object"] for c in config["channels"] if c.get("object") in wave), None)
    if available is None:
        raise CaptureError("the firmware scope returned none of the configured probe channels")
    files = {"waveform.csv": waveform_csv(wave, config["channels"])}
    conditions = {**_canvas_conditions(ctx.mission), "reference_from_V": before, "reference_to_V": after,
                  "sample_period_s": float(wave.get("period_s", config["sample_period_s"]))}
    ctx.record("capture-board", "CAPTURE", "L1", _metrics(wave, available, before, after),
               conditions=conditions, files=files)
    ctx.log(f"Filed {len(wave['t'])} samples; power is switching off.")
