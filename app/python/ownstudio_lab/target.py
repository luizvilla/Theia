# SPDX-License-Identifier: LGPL-2.1
"""Targets for procedures: the same data objects on the board and in the simulator.

A procedure talks to a target, never to a serial port or a solver:

    target.get("Measurements")                  -> {"rV1Low_V": 11.98, ...}
    target.update("Converter", {"Mode": 1})
    target.wait(0.02)                           # real time on the board, simulated time in the simulator
    target.capture()                            # waveforms since the last capture (simulator; the board needs the firmware scope)
    target.environment("load_step", True)       # what the bench would do by hand (simulator only)

The board target speaks ThingSet. The simulator target loads the mission's
tests/sim_harness.py, whose Harness plays main.cpp's part (mode, reference,
measurements) around the unchanged control.cpp and the plant model.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import time


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

    def capture(self):
        raise TargetError("waveforms from the board need the firmware scope (step 4)")

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

    def get(self, group):
        return self.harness.get(group)

    def update(self, group, values):
        self.harness.update(group, values)

    def wait(self, seconds):
        self.harness.advance(seconds)

    def now(self):
        return self.harness.now()

    def capture(self):
        return self.harness.capture()

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
