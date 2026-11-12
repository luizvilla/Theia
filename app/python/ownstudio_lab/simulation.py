# SPDX-License-Identifier: LGPL-2.1
"""Pulsim target for a setup: saved plant, native control C-Block and hardware adapter.

The board supplies the editable ``.pulsim`` circuit and the thin C-Block ABI
wrapper.  A setup owns copies of both.  This runner loads the circuit through
PulsimGui's Qt-free project model, applies the values wired on the setup canvas,
compiles ``src/control.cpp`` into the native block, and models the PWM peripheral
around it.  Procedures see the same data objects as they do on a board.
"""
from __future__ import annotations

import ctypes
import hashlib
import inspect
import math
import os
import pathlib
import re
import subprocess
import tempfile

import numpy as np
import yaml

CONTROL_PERIOD_S = 100e-6
DEFAULT_REFERENCE_V = 12.0
PULSIM_RELEASE = "2.0.0"


class SimulationError(RuntimeError):
    pass


def _runtime():
    try:
        import pulsim as p
        from pulsimgui.models.component import ComponentType
        from pulsimgui.models.project import Project
        from pulsimgui.utils.net_utils import build_node_alias_map, build_node_map
    except ModuleNotFoundError as err:
        raise SimulationError(
            "the simulator needs pulsim==2.0.0 and pulsimgui==1.1.1 in OwnStudio's Python environment"
        ) from err
    if p.__version__.split("+")[0] != PULSIM_RELEASE or not hasattr(p, "add_c_block"):
        raise SimulationError(f"the Twist plant needs pulsim=={PULSIM_RELEASE}, found {p.__version__}")
    return p, Project, ComponentType, build_node_map, build_node_alias_map


def _setup(mission: pathlib.Path) -> dict:
    path = mission / "ownstudio" / "setup.yaml"
    if not path.is_file():
        raise SimulationError("this folder is not a setup (ownstudio/setup.yaml is missing)")
    return yaml.safe_load(path.read_text()) or {}


def _plant_config(mission: pathlib.Path, setup: dict) -> tuple[dict, pathlib.Path]:
    config = setup.get("plant")
    if isinstance(config, str):
        config = {"file": config}
    if not isinstance(config, dict) or not config.get("file"):
        raise SimulationError("this setup has no board plant; create it again from a board that supplies one")
    path = mission / str(config["file"])
    if not path.is_file():
        raise SimulationError(f"the setup plant is missing: {path}")
    return config, path


def _components(project) -> dict:
    return {part.name: part for part in project.get_active_circuit().components.values()}


def _connected_node(setup: dict, board_port: str) -> dict | None:
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


def project_values(project) -> dict[str, float]:
    """Read the four canvas-facing values from their named plant components."""
    parts = _components(project)
    required = {"Vin", "Rload", "L", "C"}
    missing = sorted(required - parts.keys())
    if missing:
        raise SimulationError(f"the plant is missing named component(s): {', '.join(missing)}")
    values = {
        "Vin": float(parts["Vin"].parameters["waveform"]["value"]),
        "Rload": float(parts["Rload"].parameters["resistance"]),
        "L": float(parts["L"].parameters["inductance"]),
        "C": float(parts["C"].parameters["capacitance"]),
    }
    for name, value in values.items():
        if not math.isfinite(value) or value <= 0:
            raise SimulationError(f"the plant's {name} value must be positive")
    return values


def apply_setup_values(project, setup: dict) -> dict[str, float]:
    """Apply the setup's named Vin/Rload/L/C values to a loaded project."""
    parts = _components(project)
    defaults = project_values(project)

    source, load = _connected_node(setup, "HIGH"), _connected_node(setup, "LOW1")
    source_values = (source or {}).get("values") or {}
    load_values = (load or {}).get("values") or {}
    board = next((node for node in (setup.get("canvas") or {}).get("nodes", [])
                  if isinstance(node, dict) and node.get("part") == setup.get("board")), {})
    board_values = board.get("values") or {}
    overrides = setup.get("simulation") or {}

    values = {
        "Vin": float(source_values.get("voltage", defaults["Vin"])),
        "Rload": float(load_values.get("ohm", defaults["Rload"])),
        "L": float(board_values.get("inductance_H", board_values.get("inductance",
                   defaults["L"]))),
        "C": float(board_values.get("capacitance_F", board_values.get("capacitance",
                   defaults["C"]))),
    }
    for name in tuple(values):
        if name in overrides:
            values[name] = float(overrides[name])
        if not math.isfinite(values[name]) or values[name] <= 0:
            raise SimulationError(f"the setup's {name} value must be positive")
    parts["Vin"].parameters["waveform"]["value"] = values["Vin"]
    parts["Rload"].parameters["resistance"] = values["Rload"]
    parts["L"].parameters["inductance"] = values["L"]
    parts["C"].parameters["capacitance"] = values["C"]
    return values


def load_project(mission: pathlib.Path):
    """Load the setup's saved project and apply canvas values by component name."""
    _, Project, _, _, _ = _runtime()
    setup = _setup(mission)
    config, path = _plant_config(mission, setup)
    project = Project.load(path)
    values = apply_setup_values(project, setup)
    return project, config, path, values


def sync_plant_values(mission: pathlib.Path) -> dict:
    """Copy saved Vin/Rload/L/C values from the plant back to setup.yaml.

    The external editor owns the ``.pulsim`` save.  OwnStudio owns the canvas,
    so this deliberately updates only the four stable named-value contracts and
    leaves positions, wires, limits, probes and every other canvas field alone.
    """
    mission = pathlib.Path(mission).resolve()
    _, Project, _, _, _ = _runtime()
    setup = _setup(mission)
    _, path = _plant_config(mission, setup)
    values = project_values(Project.load(path))

    canvas = setup.get("canvas")
    if not isinstance(canvas, dict):
        raise SimulationError("the setup canvas is missing")
    nodes = canvas.get("nodes")
    if not isinstance(nodes, list):
        raise SimulationError("the setup canvas has no nodes")
    source = _connected_node(setup, "HIGH")
    load = _connected_node(setup, "LOW1")
    board = next((node for node in nodes if isinstance(node, dict)
                  and node.get("part") == setup.get("board")), None)
    if source is None or load is None or board is None:
        raise SimulationError("connect a source to HIGH and a resistor to LOW1 before syncing the plant")

    changed: dict[str, float] = {}

    def put(node: dict, key: str, name: str) -> None:
        current = node.get("values")
        if not isinstance(current, dict):
            current = {}
            node["values"] = current
        value = values[name]
        if current.get(key) != value:
            current[key] = value
            changed[name] = value

    put(source, "voltage", "Vin")
    put(load, "ohm", "Rload")
    put(board, "inductance_H", "L")
    put(board, "capacitance_F", "C")
    if changed:
        (mission / "ownstudio" / "setup.yaml").write_text(
            yaml.safe_dump(setup, sort_keys=False), encoding="utf-8")
    return {"changed": changed, "values": values, "canvas": canvas,
            "plant": str(path.relative_to(mission))}


def _find_dependency(mission: pathlib.Path, header: str) -> pathlib.Path | None:
    candidates = []
    for variable in ("OWNSTUDIO_CONTROL_LIBRARY", "CONTROL_LIBRARY_DIR"):
        if os.environ.get(variable):
            root = pathlib.Path(os.environ[variable])
            candidates += [root / "src" / header, root / header]
    candidates += list(mission.glob(f"owntech/lib/*/control_library/src/{header}"))
    candidates += list(mission.glob(f"**/{header}"))
    candidates = sorted({path.resolve() for path in candidates if path.is_file() and ".pio" not in path.parts},
                        key=lambda path: ("/USB/" not in str(path), len(path.parts), str(path)))
    return candidates[0] if candidates else None


def build_control_block(mission: pathlib.Path, config: dict, out: pathlib.Path) -> pathlib.Path:
    """Compile the copied ABI wrapper and the setup's hardware-free control source."""
    wrapper = mission / str(config.get("wrapper", "ownstudio/plant/control_block.cpp"))
    control = mission / str(config.get("control_source", "src/control.cpp"))
    if not wrapper.is_file():
        raise SimulationError(f"the plant's C-Block wrapper is missing: {wrapper}")
    if not control.is_file():
        raise SimulationError(
            "simulation needs the hardware-free control source src/control.cpp (load an OwnStudio-ready example)"
        )

    include_dirs = {control.parent.resolve(), wrapper.parent.resolve()}
    for relative in config.get("host_include_dirs", []):
        include = mission / str(relative)
        if not include.is_dir():
            raise SimulationError(f"the plant's host include directory is missing: {include}")
        include_dirs.add(include.resolve())
    sources = [wrapper.resolve(), control.resolve()]
    text = control.read_text()
    for header in re.findall(r'^\s*#\s*include\s*"([^"]+)"', text, re.MULTILINE):
        local = control.parent / header
        found = local if local.is_file() else _find_dependency(mission, header)
        if found is None:
            raise SimulationError(f"cannot find host dependency {header!r} included by {control}")
        include_dirs.add(found.parent.resolve())
        sibling = found.with_suffix(".cpp")
        if sibling.is_file() and sibling.resolve() not in sources:
            sources.append(sibling.resolve())

    out.mkdir(parents=True, exist_ok=True)
    target = out / ("control_block.dll" if os.name == "nt" else "libcontrol_block.so")
    compiler = os.environ.get("CXX", "g++")
    cmd = [compiler, "-std=c++20", "-O2", "-shared", "-fPIC",
           *[f"-I{path}" for path in sorted(include_dirs)], *map(str, sources), "-o", str(target)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode:
        raise SimulationError(f"the control C-Block did not compile:\n{result.stderr.strip() or result.stdout.strip()}")

    dll = ctypes.CDLL(str(target))
    for name, expected in (("ownstudio_cblock_contract", 1), ("ownstudio_cblock_inputs", 7),
                           ("ownstudio_cblock_outputs", 1)):
        try:
            function = getattr(dll, name)
        except AttributeError as err:
            raise SimulationError(f"the compiled C-Block does not export {name}") from err
        function.restype = ctypes.c_uint
        if function() != expected:
            raise SimulationError(f"the compiled C-Block has the wrong {name} value")
    return target


class TwistModel:
    """Strict translation of the board's saved GUI circuit to Pulsim."""

    def __init__(self, project, p, ComponentType, build_node_map, build_node_alias_map):
        circuit = project.get_active_circuit()
        node_map = build_node_map(circuit)
        aliases = build_node_alias_map(circuit, node_map)
        self.builder = p.CircuitBuilder()
        self.parts = _components(project)
        self.nodes: dict[str, list[str]] = {}
        allowed_markers = {ComponentType.GROUND, ComponentType.C_BLOCK, ComponentType.PWM_GENERATOR,
                           ComponentType.VOLTAGE_PROBE, ComponentType.CURRENT_PROBE,
                           ComponentType.ELECTRICAL_SCOPE}
        for part in circuit.components.values():
            raw = [node_map[(str(part.id), index)] for index in range(len(part.pins))]
            nodes = ["0" if node == "0" else aliases.get(node, f"N{node}") for node in raw]
            self.nodes[part.name] = nodes
            q, kind, name = part.parameters, part.type, part.name
            if kind == ComponentType.VOLTAGE_SOURCE:
                wave = q.get("waveform") or {}
                if wave.get("type") != "dc":
                    raise SimulationError(f"the Twist runner only supports a DC source: {name}")
                self.builder.add_voltage_source(name, *nodes[:2], float(wave["value"]))
            elif kind == ComponentType.RESISTOR:
                self.builder.add_resistor(name, *nodes[:2], float(q["resistance"]))
            elif kind == ComponentType.CAPACITOR:
                self.builder.add_capacitor(name, *nodes[:2], float(q["capacitance"]))
            elif kind == ComponentType.INDUCTOR:
                self.builder.add_inductor(name, *nodes[:2], float(q["inductance"]))
            elif kind == ComponentType.SWITCH:
                self.builder.add_switch(name, *nodes[:2], 1.0 / float(q["ron"]), 1.0 / float(q["roff"]))
            elif kind == ComponentType.DIODE:
                self.builder.add_diode(name, *nodes[:2], 1.0 / float(q["ron"]), 1.0 / float(q["roff"]),
                                       float(q["v_forward"]))
            elif kind not in allowed_markers:
                raise SimulationError(f"unsupported plant component {kind.name}: {name}")

        expected = {"Vin", "S_hs", "S_ls", "D_hs", "D_ls", "L", "C", "R_esr", "C_elec",
                    "Rload", "Rstep", "S_step", "control_step", "PWM"}
        missing = sorted(expected - self.parts.keys())
        if missing:
            raise SimulationError(f"the Twist plant is missing: {', '.join(missing)}")
        block = self.parts["control_step"].parameters
        if (int(block.get("n_inputs", 0)), int(block.get("n_outputs", 0))) != (7, 1):
            raise SimulationError("control_step must have seven measurement/reference inputs and one duty output")


class Harness:
    """A setup's native C-Block and Twist circuit behind the Target interface."""

    def __init__(self, mission, v_in: float | None = None, load_ohm: float | None = None,
                 step_load_ohm: float | None = None, build_dir: str | None = None, store_every: int = 4,
                 project=None):
        self.mission = pathlib.Path(mission).resolve()
        p, Project, ComponentType, build_node_map, build_node_alias_map = _runtime()
        self.p = p
        if project is None:
            project, config, self.plant_path, values = load_project(self.mission)
        else:
            setup = _setup(self.mission)
            config, self.plant_path = _plant_config(self.mission, setup)
            values = project_values(project)
        parts = _components(project)
        if v_in is not None:
            parts["Vin"].parameters["waveform"]["value"] = values["Vin"] = float(v_in)
        if load_ohm is not None:
            parts["Rload"].parameters["resistance"] = values["Rload"] = float(load_ohm)
        if step_load_ohm is not None:
            parts["Rstep"].parameters["resistance"] = float(step_load_ohm)
        model = TwistModel(project, p, ComponentType, build_node_map, build_node_alias_map)
        self.model, self.b = model, model.builder
        pwm = parts["PWM"].parameters
        self.q = {
            "port_high_V": values["Vin"], "inductance_H": values["L"],
            "ceramic_capacitance_F": values["C"], "load_ohm": values["Rload"],
            "switching_freq_Hz": float(pwm["frequency"]), "dead_time_s": float(pwm["deadtime_s"]),
            "step_s": float(project.simulation_settings.dt),
        }
        self.load_ohm = values["Rload"]
        self.step_load_ohm = float(parts["Rstep"].parameters["resistance"])

        self.block_dir = pathlib.Path(build_dir) if build_dir else pathlib.Path(tempfile.mkdtemp(prefix="ownstudio-block-"))
        self.block_path = build_control_block(self.mission, config, self.block_dir)
        low = model.nodes["L"][1]
        high = model.nodes["Vin"][0]
        self.b.add_voltage_source("Reference", "reference", "0", 0.0)
        self.block = p.add_c_block(
            self.b,
            inputs=[("v", "reference"), ("v", low), ("i", "L"), ("v", low), ("i", "L"),
                    ("v", high), ("i", "L")],
            # Duty is consumed by the PWM adapter, so the formal C-Block
            # output is a zero-topology signal source rather than an
            # electrical voltage source that would enlarge every solve.
            outputs=[("i", "0", "0")], dt=CONTROL_PERIOD_S, lib=str(self.block_path),
            name="control_step", sim_dt=self.q["step_s"])

        names = list(self.b.state_var_names())
        self._index = {name: index for index, name in enumerate(names)}
        self.i_v_low = self._index[f"V({low})"]
        self.i_v_high = self._index[f"V({high})"]
        self.i_i_l = self._index["I(L)"]
        self.reference_row = self._index["Is(Reference)"]
        self._extra = [0.0] * len(names)
        # The duty output is a GUI/control signal, not an electrical source in
        # this hardware adapter. Reuse the block's injector for the reference
        # command and return one cached vector per electrical step.
        self.block.b_extra_fn = self._block_extra
        block_observer = self.block.step_observer

        def observed_block(t, x):
            previous = self.block.n_fires
            block_observer(t, x)
            if self.block.n_fires != previous:
                self.ticks.append((float(t), self.command))

        self.block.step_observer = observed_block
        self.hs, self.ls = self.b.switch_index_of("S_hs"), self.b.switch_index_of("S_ls")
        self.step_sw = self.b.switch_index_of("S_step")
        self.mask = p.SwitchStateMask(self.b.graph.num_switches)
        self.period = 1.0 / self.q["switching_freq_Hz"]
        self.dead = self.q["dead_time_s"]
        self.exact_edges = "edge_fn" in inspect.signature(p.simulate).parameters
        self.store_every = int(store_every)

        self.mode, self.reference, self.load_step = 0, DEFAULT_REFERENCE_V, False
        self.applied, self.pwm_k = 0.0, -1
        self.t, self.snapshot = 0.0, None
        self.x = np.zeros(len(names))
        self.x[self.i_v_high] = self.q["port_high_V"]
        self.trace_t: list[np.ndarray] = []
        self.trace_v: list[np.ndarray] = []
        self.trace_i: list[np.ndarray] = []
        self.ticks: list[tuple[float, float]] = []
        self.edge_times: list[float] = []

    @property
    def command(self) -> float:
        return float(np.clip(self.block.outputs[0], 0.0, 1.0))

    def get(self, group):
        v_low, i_l, v_high = float(self.x[self.i_v_low]), float(self.x[self.i_i_l]), float(self.x[self.i_v_high])
        if group == "Measurements":
            return {"rV1Low_V": v_low, "rV2Low_V": v_low, "rVHigh_V": v_high,
                    "rI1Low_A": i_l, "rI2Low_A": i_l,
                    "rIHigh_A": i_l * self.applied if self.mode == 1 else 0.0,
                    "rTemp1_degC": 25.0, "rTemp2_degC": 25.0, "rDuty": self.command}
        if group == "Converter":
            return {"Mode": self.mode, "wVoltageRef_V": self.reference}
        raise KeyError(f"the simulator has no data object group {group!r}")

    def update(self, group, values):
        if group != "Converter":
            raise KeyError(f"the simulator cannot write group {group!r}")
        for name, value in values.items():
            if name == "Mode":
                self.mode = 1 if int(value) == 1 else 0
            elif name == "wVoltageRef_V":
                self.reference = float(value)
            else:
                raise KeyError(f"Converter/{name} is not writable")

    def environment(self, name, value):
        if name != "load_step":
            raise KeyError(f"the simulator has no environment setting {name!r}: load_step only")
        self.load_step = bool(value)

    def identity(self):
        source = self.mission / "src" / "control.cpp"
        return {"model": str(self.plant_path.relative_to(self.mission)), "model_sha256": hashlib.sha256(self.plant_path.read_bytes()).hexdigest(),
                "pulsim": self.p.__version__, "native_cblock": True, "exact_pwm_edges": self.exact_edges,
                "control_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "v_in_V": self.q["port_high_V"]}

    def now(self):
        return self.t

    def _switch_fn(self, t):
        k = int(math.floor(t / self.period + 1e-6))
        if k != self.pwm_k:
            self.pwm_k, self.applied = k, self.command
        phase = max(0.0, t - k * self.period)
        on = self.mode == 1
        self.mask.set(self.hs, on and self.dead <= phase < self.applied * self.period)
        self.mask.set(self.ls, on and self.applied * self.period + self.dead <= phase < self.period)
        self.mask.set(self.step_sw, self.load_step)
        return self.mask

    def _edge_fn(self, t0, t1):
        if self.mode != 1:
            return math.inf
        k = int(math.floor(t0 / self.period + 1e-6))
        for kk in (k, k + 1, k + 2):
            duty = self.applied if kk == self.pwm_k else self.command
            start = kk * self.period
            for edge in (start, start + self.dead, start + duty * self.period,
                         start + duty * self.period + self.dead):
                if t0 < edge < t1:
                    self.edge_times.append(edge)
                    return edge
            if start > t1:
                break
        return math.inf

    def _block_extra(self, _t):
        return self._extra

    def advance(self, seconds):
        if seconds <= 0:
            return
        end = self.t + float(seconds)
        self._extra[self.reference_row] = -self.reference
        kwargs = {"resume_from": self.snapshot} if self.snapshot is not None else {"initial_state": self.x}
        if self.exact_edges:
            kwargs["edge_fn"] = self._edge_fn
        result = self.p.simulate(
            self.b, t_start=self.t, t_end=end, dt=self.q["step_s"], engine="pwl",
            switch_fn=self._switch_fn, store_every=self.store_every, **kwargs)
        self.snapshot = result.final_snapshot
        states = np.asarray(result.states)
        self.trace_t.append(np.asarray(result.times))
        self.trace_v.append(states[:, self.i_v_low])
        self.trace_i.append(states[:, self.i_i_l])
        self.x = states[-1]
        self.t = end

    def capture(self):
        out = {"t": np.concatenate(self.trace_t) if self.trace_t else np.array([]),
               "rV1Low_V": np.concatenate(self.trace_v) if self.trace_v else np.array([]),
               "rI1Low_A": np.concatenate(self.trace_i) if self.trace_i else np.array([]),
               "duty": np.asarray(self.ticks)}
        self.trace_t, self.trace_v, self.trace_i, self.ticks = [], [], [], []
        return out

    def close(self):
        if self.block.teardown:
            self.block.teardown()
            self.block.teardown = None
