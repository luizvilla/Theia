# SPDX-License-Identifier: LGPL-2.1
"""A fake board for tests and demonstrations: a ThingSet link that answers like
a mission firmware with the firmware scope, its values taken from a simulator
harness (anything with get, update, advance and now).

    link = SimulatedBoardLink(harness)
    target = fake_board_target(harness)        # a BoardTarget whose time is simulated

Records made with it say so (serial number "FAKE", commit "fake"). They must
never be filed in a mission's campaigns: use a copy of the mission.
"""
from __future__ import annotations

from .target import BoardTarget

SCOPE_CHANNELS = ("rV1Low_V", "rI1Low_A", "rVHigh_V", "rDuty", "wVoltageRef_V")
IDLE, ARMED, RECORDING, READY = 0, 1, 2, 3


class FakeBoard:
    serial_number = "FAKE"
    product = "fake board (simulator behind a ThingSet link)"


class SimulatedBoardLink:
    """The mission firmware's data objects and Scope group, over a simulator harness."""

    def __init__(self, harness, length=1024, pretrigger=205, period_s=1e-4, channels=SCOPE_CHANNELS,
                 offsets=None):
        self.harness = harness
        self.period = period_s
        self.offsets = dict(offsets or {})      # sensor errors to play with: {"rV1Low_V": -0.1}
        self.scope = {"wArm": 0, "rState": IDLE, "rLength": length, "rPretrigger": pretrigger,
                      "rPeriod_s": period_s, "rChannels": ",".join(channels), "wChunk": 0, "rData": [0.0] * 64}
        self.build = {"rCommit": "fake", "rDirty": False, "rSourceHash": "fake"}
        self.writes, self.closed = [], False
        self._samples = []                      # one list of channel values per period
        self._trigger_index = None
        self._capture = None

    # ThingSet link surface ------------------------------------------------------

    def get(self, path=""):
        group, _, name = path.partition("/")
        if group == "Scope":
            node = self.scope
        elif group == "Build":
            node = self.build
        else:
            node = dict(self.harness.get(group))
            for key, offset in self.offsets.items():
                if key in node:
                    node[key] += offset
        return node[name] if name else dict(node)

    def update(self, group, values):
        self.writes.append((group, dict(values)))
        if group == "Scope":
            if values.get("wArm") in (1, 2):
                self.scope["rState"], self._capture = ARMED, None
                self._trigger_index = len(self._samples) if values["wArm"] == 2 else None
                if self._trigger_index is not None:
                    self.scope["rState"] = RECORDING
            if "wChunk" in values:
                self.scope["wChunk"] = int(values["wChunk"])
                self._fill()
            return
        if group == "Converter" and self.scope["rState"] == ARMED:
            self._trigger_index, self.scope["rState"] = len(self._samples), RECORDING
        self.harness.update(group, values)

    def close(self):
        self.closed = True

    # Simulated time -------------------------------------------------------------

    def now(self):
        return self.harness.now()

    def advance(self, seconds):
        """Run the harness one sampling period at a time, recording what the scope would."""
        for _ in range(max(1, int(round(seconds / self.period)))):
            self.harness.advance(self.period)
            self._sample()

    def _sample(self):
        names = self.scope["rChannels"].split(",")
        values = {**self.get("Measurements"), **self.get("Converter")}
        self._samples.append([float(values.get(n, 0.0)) for n in names])
        length, pre = self.scope["rLength"], self.scope["rPretrigger"]
        if self.scope["rState"] == RECORDING and len(self._samples) - self._trigger_index >= length - pre:
            first = self._trigger_index - pre
            window = self._samples[max(0, first):self._trigger_index + length - pre]
            window = [window[0]] * (length - len(window)) + window     # a fresh scope repeats its first sample
            self._capture = [row[c] for c in range(len(names)) for row in window]
            self.scope["rState"] = READY
        if self.scope["rState"] not in (ARMED, RECORDING) and len(self._samples) > 2 * length:
            self._samples = self._samples[-length:]

    def _fill(self):
        first = self.scope["wChunk"] * 64
        data = self._capture or []
        self.scope["rData"] = [data[i] if i < len(data) else 0.0 for i in range(first, first + 64)]


def fake_board_target(harness, guard=None, **link_options) -> BoardTarget:
    """A BoardTarget over SimulatedBoardLink, whose wait() advances simulated time."""
    link = SimulatedBoardLink(harness, **link_options)
    return BoardTarget(FakeBoard(), link, guard, sleep=link.advance, clock=link.now)
