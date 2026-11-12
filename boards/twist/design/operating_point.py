# SPDX-License-Identifier: LGPL-2.1
"""Where the design sheets read their numbers: the setup, never a copy.

A setup keeps these sheets in ownstudio/design/. They read:

- the canvas in ownstudio/setup.yaml: the source on HIGH (its voltage), the
  resistor on LOW1 (its resistance), and the Twist's own values (L and C) when
  the designer has changed them;
- the board's plant, ownstudio/plant/twist_buck.pulsim, for everything the
  canvas does not say: the electrolytic and its ESR, the switching frequency,
  the dead time and the control period of the C-Block.

The plant applies the same canvas values by component name (Vin, Rload, L, C),
so a sheet, the canvas and the simulation always talk about the same circuit.
"""
from __future__ import annotations

import json
import pathlib

import yaml

SETUP = pathlib.Path(__file__).resolve().parents[2]


def _connected(setup: dict, port: str) -> dict:
    """The canvas node wired to the board's ``port``, or an empty dict."""
    canvas = setup.get("canvas") or {}
    nodes = {n.get("id"): n for n in canvas.get("nodes", []) if isinstance(n, dict)}
    board = {i for i, n in nodes.items() if n.get("part") == setup.get("board")}
    for wire in canvas.get("wires", []):
        a, b = wire.get("from") or {}, wire.get("to") or {}
        if a.get("node") in board and a.get("port") == port:
            return nodes.get(b.get("node")) or {}
        if b.get("node") in board and b.get("port") == port:
            return nodes.get(a.get("node")) or {}
    return {}


def _plant_parts(setup_dir: pathlib.Path, setup: dict) -> dict:
    plant = setup.get("plant") or {}
    if isinstance(plant, str):
        plant = {"file": plant}
    path = setup_dir / str(plant.get("file", "ownstudio/plant/twist_buck.pulsim"))
    project = json.loads(path.read_text(encoding="utf-8"))
    circuit = project["circuits"][project["active_circuit"]]
    return {c["name"]: c.get("parameters", {}) for c in circuit["components"]}


def read(setup_dir: pathlib.Path | str = SETUP) -> dict:
    """The operating point of the setup, in SI units."""
    setup_dir = pathlib.Path(setup_dir)
    setup = yaml.safe_load((setup_dir / "ownstudio" / "setup.yaml").read_text(encoding="utf-8")) or {}
    parts = _plant_parts(setup_dir, setup)
    board = next((n for n in (setup.get("canvas") or {}).get("nodes", [])
                  if isinstance(n, dict) and n.get("part") == setup.get("board")), {})
    board_values = board.get("values") or {}
    source = (_connected(setup, "HIGH").get("values") or {})
    load = (_connected(setup, "LOW1").get("values") or {})
    return {
        "v_in_V": float(source.get("voltage", parts["Vin"]["waveform"]["value"])),
        "load_ohm": float(load.get("ohm", parts["Rload"]["resistance"])),
        "inductance_H": float(board_values.get("inductance_H", parts["L"]["inductance"])),
        "ceramic_capacitance_F": float(board_values.get("capacitance_F", parts["C"]["capacitance"])),
        "electrolytic_capacitance_F": float(parts["C_elec"]["capacitance"]),
        # R_esr in the plant is the electrolytic's ESR plus its connection switch.
        "electrolytic_esr_ohm": float(parts["R_esr"]["resistance"]),
        "switching_freq_Hz": float(parts["PWM"]["frequency"]),
        "dead_time_s": float(parts["PWM"].get("deadtime_s", 0.0)),
        "control_period_s": float(parts["control_step"]["sample_time"]),
        # The Twist's own values, as the board plant has them, for the sheets to mark.
        "board_inductance_H": float(parts["L"]["inductance"]),
        "board_capacitance_F": float(parts["C"]["capacitance"]),
        "source": {"canvas_source": bool(source), "canvas_load": bool(load),
                   "canvas_L": "inductance_H" in board_values, "canvas_C": "capacitance_F" in board_values},
    }
