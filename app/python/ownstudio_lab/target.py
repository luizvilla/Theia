# SPDX-License-Identifier: LGPL-2.1
"""Targets for procedures: the same data objects on the board and in the simulator.

A procedure talks to a target, never to a serial port or a solver:

    target.get("Measurements")                  -> {"rV1Low_V": 11.98, ...}
    target.update("Converter", {"Mode": 1})
    target.wait(0.02)                           # real time on the board, simulated time in the simulator
    target.arm()                                # the next update() is the trigger, t = 0 of the next capture
    target.capture()                            # waveforms: {"t", "t_trigger", <data object name>: values, ...}
    target.environment("load_step", True)       # what the bench would do by hand (simulator only)

On the board, capture() reads the firmware scope (the mission's Scope data
objects): a fixed window around the trigger, its channels named after the data
objects they record. In the simulator it returns every waveform since the
last capture; the mission's harness names them.

The board target speaks ThingSet. The simulator target loads the mission's
tests/sim_harness.py, whose Harness plays main.cpp's part (mode, reference,
measurements) around the unchanged control.cpp and the plant model.
"""
from __future__ import annotations

import importlib.util
import math
import pathlib
import sys
import time

SCOPE_CHUNK = 64            # values in Scope/rData
SCOPE_READY = 3             # Scope/rState once the capture is complete
SCOPE_FILL_S = 0.03         # after arming, time to fill the part before the trigger (20 % of 102 ms)


class TargetError(Exception):
    pass


class Target:
    kind = "?"

    def get(self, group: str) -> dict:
        raise NotImplementedError

    def update(self, group: str, values: dict) -> None:
        raise NotImplementedError

    def wait(self, seconds: float) -> None:
        raise NotImplementedError

    def now(self) -> float:
        raise NotImplementedError

    def arm(self) -> None:
        raise TargetError(f"the {self.kind} target cannot capture waveforms")

    def capture(self) -> dict:
        raise TargetError(f"the {self.kind} target cannot capture waveforms")

    def environment(self, name: str, value) -> None:
        raise TargetError(f"'{name}' is set by hand on the {self.kind} target")

    def identity(self) -> dict | None:
        """What the record stamps: board serial and build identity, or the simulator's model."""
        return None

    def close(self) -> None:
        pass


class BoardTarget(Target):
    """A board over ThingSet. guard(group, values) may raise to refuse a write."""
    kind = "board"

    def __init__(self, board, link, guard=None, sleep=time.sleep, clock=time.monotonic):
        self.board, self.link, self.guard, self.sleep, self.clock = board, link, guard, sleep, clock

    def get(self, group):
        return self.link.get(group)

    def update(self, group, values):
        if self.guard:
            self.guard(group, values)
        self.link.update(group, values)

    def wait(self, seconds):
        self.sleep(seconds)

    def now(self):
        return self.clock()

    def arm(self):
        try:
            self.link.get("Scope/rState")
        except Exception as err:  # noqa: BLE001 - any answer but a value means no scope
            raise TargetError(f"this firmware has no scope (Scope data objects): {err}") from err
        self.link.update("Scope", {"wArm": 1})
        self.sleep(SCOPE_FILL_S)

    def capture(self, timeout=2.0):
        """The firmware scope's last capture: t in seconds from the trigger, one array per channel."""
        import numpy as np
        deadline = self.clock() + timeout
        while self.link.get("Scope/rState") != SCOPE_READY:
            if self.clock() > deadline:
                raise TargetError("the scope did not complete a capture: arm() it, then write to Converter")
            self.sleep(0.02)
        scope = self.link.get("Scope")
        names = scope["rChannels"].split(",")
        length = scope["rLength"]
        values = []
        for chunk in range(math.ceil(length * len(names) / SCOPE_CHUNK)):
            self.link.update("Scope", {"wChunk": chunk})
            values += self.link.get("Scope/rData")
        wave = {"t": (np.arange(length) - scope["rPretrigger"]) * scope["rPeriod_s"], "t_trigger": 0.0,
                "source": "firmware scope", "period_s": scope["rPeriod_s"]}
        for i, name in enumerate(names):
            wave[name] = np.asarray(values[i * length:(i + 1) * length], dtype=float)
        return wave

    def identity(self):
        build = self.link.get("Build")
        return {"serial_number": self.board.serial_number, "commit": build.get("rCommit"),
                "dirty": build.get("rDirty"), "source_hash": build.get("rSourceHash")}

    def close(self):
        self.link.close()


class SimTarget(Target):
    """The mission's simulator harness behind the target interface."""
    kind = "simulator"

    def __init__(self, harness):
        self.harness = harness
        self._armed, self._t_trigger = False, None

    def get(self, group):
        return self.harness.get(group)

    def update(self, group, values):
        if self._armed and group == "Converter":
            self._armed, self._t_trigger = False, self.harness.now()
        self.harness.update(group, values)

    def wait(self, seconds):
        self.harness.advance(seconds)

    def now(self):
        return self.harness.now()

    def arm(self):
        self._armed, self._t_trigger = True, None

    def capture(self):
        wave = dict(self.harness.capture())
        wave.setdefault("t_trigger", self._t_trigger)
        wave.setdefault("source", "simulator")
        self._t_trigger = None
        return wave

    def environment(self, name, value):
        self.harness.environment(name, value)

    def identity(self):
        return self.harness.identity()


def load_harness(mission: pathlib.Path, **options):
    """Harness(mission, **options) from the mission's tests/sim_harness.py."""
    path = mission / "tests" / "sim_harness.py"
    if not path.is_file():
        raise TargetError("this mission has no simulator harness (tests/sim_harness.py)")
    spec = importlib.util.spec_from_file_location("sim_harness", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["sim_harness"] = module
    spec.loader.exec_module(module)
    return module.Harness(mission, **options)


def open_target(kind: str, mission: pathlib.Path, board_serial: str | None = None, guard=None, **options) -> Target:
    if kind == "simulator":
        return SimTarget(load_harness(mission, **options))
    if kind == "board":
        from .boards import find_boards
        from .thingset import find_thingset_port
        boards = [b for b in find_boards() if not b.in_bootloader and (not board_serial or b.serial_number == board_serial)]
        if len(boards) != 1:
            raise TargetError("connect exactly one board, or name it by its serial number")
        device, link = find_thingset_port(boards[0])
        if link is None:
            raise TargetError(f"board {boards[0].serial_number} has no port answering ThingSet")
        return BoardTarget(boards[0], link, guard)
    raise TargetError(f"unknown target {kind!r}: simulator or board")
