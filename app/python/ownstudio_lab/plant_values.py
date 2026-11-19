# SPDX-License-Identifier: LGPL-2.1
"""The setup canvas is the one home of the plant's values (F2, Q172).

The board plant (``ownstudio/plant/*.pulsim``) has four named components whose
values belong to the canvas: ``Vin`` (the source wired to HIGH), ``Rload`` (the
resistor wired to LOW1), ``L`` and ``C`` (the board's values, set by Design).
This module writes them from ``setup.yaml`` into the plant file, as plain JSON
edits, so it is quick enough to run on every canvas save and never needs Qt or
Pulsim. A value the canvas does not hold yet (no source, no load) is left as it
is in the file; the simulator refuses to run without them (F3, Q173b).

    python -m ownstudio_lab.plant_values write <setup>   # JSON: what was written
    python -m ownstudio_lab.plant_values check <setup>   # JSON: what is missing to simulate
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

import yaml

# Component name -> (canvas role, value key on that canvas node, parameter path in the plant).
NAMED = {
    "Vin": ("source", "voltage", ("waveform", "value")),
    "Rload": ("load", "ohm", ("resistance",)),
    "L": ("board", "inductance_H", ("inductance",)),
    "C": ("board", "capacitance_F", ("capacitance",)),
}
MISSING_SOURCE = "Add a source on HIGH"
MISSING_LOAD = "a load on LOW1"


class PlantValuesError(RuntimeError):
    """The setup or its plant cannot be read; the message is for the user."""


def read_setup(mission: pathlib.Path) -> dict:
    path = mission / "ownstudio" / "setup.yaml"
    if not path.is_file():
        raise PlantValuesError("this folder is not a setup (ownstudio/setup.yaml is missing)")
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def plant_path(mission: pathlib.Path, setup: dict) -> pathlib.Path:
    config = setup.get("plant")
    file = config if isinstance(config, str) else (config or {}).get("file")
    if not file:
        raise PlantValuesError("this setup has no board plant; create it again from a board that supplies one")
    path = mission / str(file)
    if not path.is_file():
        raise PlantValuesError(f"the setup plant is missing: {path}")
    return path


def connected_node(setup: dict, board_port: str) -> dict | None:
    """The canvas node wired to one of the board's ports, if any."""
    canvas = setup.get("canvas") or {}
    nodes = {node.get("id"): node for node in canvas.get("nodes", []) if isinstance(node, dict)}
    board_ids = {node_id for node_id, node in nodes.items() if node.get("part") == setup.get("board")}
    for wire in canvas.get("wires", []):
        if not isinstance(wire, dict):
            continue
        left, right = wire.get("from") or {}, wire.get("to") or {}
        if left.get("node") in board_ids and left.get("port") == board_port:
            return nodes.get(right.get("node"))
        if right.get("node") in board_ids and right.get("port") == board_port:
            return nodes.get(left.get("node"))
    return None


def canvas_nodes(setup: dict) -> dict[str, dict | None]:
    """The canvas node behind each role: the source on HIGH, the load on LOW1, the board."""
    board = next((node for node in (setup.get("canvas") or {}).get("nodes", [])
                  if isinstance(node, dict) and node.get("part") == setup.get("board")), None)
    return {"source": connected_node(setup, "HIGH"), "load": connected_node(setup, "LOW1"), "board": board}


def canvas_values(setup: dict) -> dict[str, float]:
    """The named values the canvas holds now; absent ones are simply not in the result."""
    nodes = canvas_nodes(setup)
    values: dict[str, float] = {}
    for name, (role, key, _) in NAMED.items():
        raw = ((nodes[role] or {}).get("values") or {}).get(key)
        if raw is None:
            continue
        value = float(raw)
        if not math.isfinite(value) or value <= 0:
            raise PlantValuesError(f"the canvas's {name} value must be positive")
        values[name] = value
    return values


def missing_for_simulation(setup: dict) -> str | None:
    """One sentence saying what the canvas lacks before it can be simulated, or None."""
    nodes = canvas_nodes(setup)
    source, load = nodes["source"] is not None, nodes["load"] is not None
    if source and load:
        return None
    if not source and not load:
        return f"{MISSING_SOURCE} and {MISSING_LOAD} to simulate."
    return f"{MISSING_SOURCE} to simulate." if not source else f"Add {MISSING_LOAD} to simulate."


def _components(document: dict) -> dict[str, dict]:
    circuit = (document.get("circuits") or {}).get(document.get("active_circuit") or "main") or {}
    return {c.get("name"): c for c in circuit.get("components", []) if isinstance(c, dict)}


def _get(component: dict, path: tuple[str, ...]):
    node = component.get("parameters") or {}
    for key in path:
        node = node.get(key) if isinstance(node, dict) else None
    return node


def _set(component: dict, path: tuple[str, ...], value: float) -> None:
    node = component.setdefault("parameters", {})
    for key in path[:-1]:
        node = node.setdefault(key, {})
    node[path[-1]] = value


def write_plant(mission: pathlib.Path) -> dict:
    """Write the canvas's named values into the plant file; rewrite it only when one differs."""
    mission = pathlib.Path(mission).resolve()
    setup = read_setup(mission)
    path = plant_path(mission, setup)
    values = canvas_values(setup)
    document = json.loads(path.read_text(encoding="utf-8"))
    components = _components(document)
    missing = sorted(set(NAMED) - components.keys())
    if missing:
        raise PlantValuesError(f"the plant is missing named component(s): {', '.join(missing)}")
    written: dict[str, float] = {}
    for name, value in values.items():
        component, parameter = components[name], NAMED[name][2]
        current = _get(component, parameter)
        if current is None or float(current) != value:
            _set(component, parameter, value)
            written[name] = value
    if written:
        path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    return {"written": written, "values": values, "plant": str(path.relative_to(mission)),
            "missing": missing_for_simulation(setup)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["write", "check"])
    parser.add_argument("setup", type=pathlib.Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "write":
            result = write_plant(args.setup)
        else:
            result = {"missing": missing_for_simulation(read_setup(args.setup.resolve()))}
    except (PlantValuesError, OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
