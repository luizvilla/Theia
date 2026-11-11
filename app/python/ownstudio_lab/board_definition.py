# SPDX-License-Identifier: LGPL-2.1
"""A board definition: the board's devicetree overlay plus its board description.

ADR 0032. The devicetree overlay in Core (for the Twist,
``zephyr/boards/shields/twist/twist_v1_4_2.overlay``, with the Spin's
``spin_header.dtsi``) is the source of truth for the hardware: legs and their
pins, default frequency and dead time, sensors with their ADC channels, Spin
pins, gains and offsets, safety thresholds. It is read with Zephyr's own
devicetree library (``devicetree.dtlib``, Apache-2.0).

The board description (``boards/<board>/board.yaml``) holds only what the
devicetree does not: the power ports and which sensors measure them (their
ratings are the devicetree's thresholds, never repeated), the inside view's
drawing, the plant, the wiring templates.

An overlay is a fragment: it refers to labels of the Spin's base devicetree
(``&adc1``, ``&pwma``, pinctrl nodes) that need the Zephyr tree and the C
preprocessor to resolve. OwnStudio reads only what the overlay itself says,
so each label it refers to but does not define becomes an empty stub node;
dtlib then parses the overlay as written.

Usage: ``python -m ownstudio_lab.board_definition <board.yaml> <core folder>``
prints the definition as JSON (for the inspector).
"""
import json
import os
import re
import struct
import sys
import tempfile
from dataclasses import asdict, dataclass, field

import yaml
from devicetree import dtlib


@dataclass
class Leg:
    name: str
    pwm_pins: list            # Spin pins of the high and low switch
    capacitor_pin: int
    driver_pin: int
    current_pin: int
    adc: str
    dead_time_ns: list        # rising, falling
    modulation: str
    edge_trigger: str
    phase_shift_deg: int
    enabled: bool


@dataclass
class SensorChannel:
    adc: str                  # "ADC_1"
    channel: int
    spin_pin: int


@dataclass
class Sensor:
    name: str
    conversion: str           # LINEAR or THERMISTANCE
    adc: str | None
    order: int | None
    gain: float | None
    offset: float | None
    channels: list
    enabled: bool


@dataclass
class Threshold:
    sensor: str
    low: float
    high: float
    enabled: bool


@dataclass
class SpinPin:
    pin: int
    port: str                 # "PB11"


@dataclass
class BoardDefinition:
    name: str
    version: str
    overlay: str
    default_frequency_hz: int
    min_frequency_hz: int
    legs: list = field(default_factory=list)
    sensors: list = field(default_factory=list)
    thresholds: list = field(default_factory=list)
    spin_pins: list = field(default_factory=list)
    description: dict = field(default_factory=dict)

    def leg(self, name):
        return next(leg for leg in self.legs if leg.name == name)

    def sensor(self, name):
        return next(s for s in self.sensors if s.name == name)

    def threshold(self, sensor):
        return next(t for t in self.thresholds if t.sensor == sensor)

    def port_ratings(self, port):
        """A power port's ratings, from the thresholds of the sensors that measure it."""
        p = self.description["ports"][port]
        out = {}
        for quantity in ("voltage", "current"):
            sensor = p.get(f"{quantity}_sensor")
            if sensor:
                t = self.threshold(sensor)
                out[quantity] = {"sensor": sensor, "low": t.low, "high": t.high}
        return out

    def to_json(self):
        return asdict(self)


_LABEL_DEF = re.compile(r"(?<![\w&])([A-Za-z_]\w*)\s*:\s*[\w,@.-]+\s*\{")
_LABEL_REF = re.compile(r"&([A-Za-z_][\w]*)")


def _with_stubs(text):
    """The overlay as a standalone devicetree: includes dropped, missing labels stubbed."""
    body = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#include"))
    defined = set(_LABEL_DEF.findall(body))
    missing = sorted(set(_LABEL_REF.findall(body)) - defined)
    stubs = "".join(f"\t{label}: ownstudio-stub-{label.replace('_', '-')} {{}};\n" for label in missing)
    return f"/dts-v1/;\n/ {{\n{stubs}}};\n{body}\n"


def parse_devicetree(paths):
    """Parses one or more devicetree fragments (overlay, .dtsi) as one tree."""
    text = "\n".join(open(p, encoding="utf-8").read() for p in paths)
    with tempfile.NamedTemporaryFile("w", suffix=".dts", delete=False, encoding="utf-8") as f:
        f.write(_with_stubs(text))
        name = f.name
    try:
        return dtlib.DT(name)
    finally:
        os.unlink(name)


def _float(prop):
    """Core stores floats as their IEEE 754 bits in a 32-bit cell."""
    return round(struct.unpack(">f", struct.pack(">I", prop.to_num()))[0], 7)


def _opt(node, name, kind):
    prop = node.props.get(name)
    if prop is None:
        return None
    return {"num": prop.to_num, "nums": prop.to_nums, "str": prop.to_string, "float": lambda: _float(prop)}[kind]()


def _enabled(node):
    return _opt(node, "status", "str") in (None, "okay")


def _channels(sensor_node, dt):
    out = []
    for child in sensor_node.nodes.values():
        prop = child.props.get("io-channels")
        if prop is None:
            continue
        # A phandle-array of one entry: <&adcN channel>. dtlib gives the bytes: phandle, then cells.
        phandle, channel = struct.unpack(">II", prop.value[:8])
        target = dt.phandle2node[phandle]
        label = target.labels[0] if target.labels else target.name
        adc = "ADC_" + label.replace("adc", "")
        out.append(SensorChannel(adc=adc, channel=channel, spin_pin=_opt(child, "spin-pin", "num")))
    return out


def _spin_pins(dt):
    out = []
    for node in dt.node_iter():
        if _opt(node, "compatible", "str") != "spin-header":
            continue
        cells = struct.unpack(f">{len(node.props['gpio-map'].value) // 4}I", node.props["gpio-map"].value)
        for i in range(0, len(cells), 5):        # pin, flags, &gpioX, pin, flags
            pin, _, phandle, number, _ = cells[i:i + 5]
            gpio = dt.phandle2node[phandle]
            letter = (gpio.labels[0] if gpio.labels else gpio.name).replace("gpio", "").upper()
            out.append(SpinPin(pin=pin, port=f"P{letter}{number}"))
    return out


def read_board(description_path, core):
    """Reads ``board.yaml`` and the devicetree it names inside a Core clone."""
    with open(description_path, encoding="utf-8") as f:
        description = yaml.safe_load(f)
    overlay = os.path.join(core, description["devicetree"]["overlay"])
    fragments = [overlay] + [os.path.join(core, p) for p in description["devicetree"].get("include", [])]
    dt = parse_devicetree(fragments)

    pcb = next(n for n in dt.node_iter() if _opt(n, "compatible", "str") == "shield-pcb")
    shield = next(n for n in dt.node_iter() if _opt(n, "compatible", "str") == "power-leg")
    legs = [Leg(
        name=_opt(n, "leg-name", "str"),
        pwm_pins=_opt(n, "pwm-pin-num", "nums"),
        capacitor_pin=_opt(n, "capa-pin-num", "num"),
        driver_pin=_opt(n, "driver-pin-num", "num"),
        current_pin=_opt(n, "current-pin-num", "num"),
        adc=_opt(n, "default-adc", "str"),
        dead_time_ns=_opt(n, "default-dead-time", "nums"),
        modulation=_opt(n, "default-modulation", "str"),
        edge_trigger=_opt(n, "default-edge-trigger", "str"),
        phase_shift_deg=_opt(n, "default-phase-shift", "num"),
        enabled=_enabled(n),
    ) for n in shield.nodes.values()]
    sensors = [Sensor(
        name=_opt(n, "sensor-name", "str"),
        conversion=_opt(n, "sensor-conv-type", "str"),
        adc=_opt(n, "default-adc", "str"),
        order=_opt(n, "default-order", "num"),
        gain=_opt(n, "default-gain", "float"),
        offset=_opt(n, "default-offset", "float"),
        channels=_channels(n, dt),
        enabled=_enabled(n),
    ) for n in dt.node_iter() if _opt(n, "compatible", "str") == "shield-sensors"]
    thresholds = [Threshold(
        sensor=_opt(n, "sensor-name", "str"),
        low=_opt(n, "threshold-low", "float"),
        high=_opt(n, "threshold-high", "float"),
        enabled=_enabled(n),
    ) for n in dt.node_iter() if _opt(n, "compatible", "str") == "safety-thresholds"]

    return BoardDefinition(
        name=_opt(pcb, "shield-name", "str"),
        version=_opt(pcb, "shield-version", "str"),
        overlay=description["devicetree"]["overlay"],
        default_frequency_hz=_opt(shield, "default-frequency", "num"),
        min_frequency_hz=_opt(shield, "min-frequency", "num"),
        legs=legs, sensors=sensors, thresholds=thresholds, spin_pins=_spin_pins(dt),
        description=description,
    )


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    board = read_board(argv[1], argv[2])
    out = board.to_json()
    out["port_ratings"] = {p: board.port_ratings(p) for p in board.description.get("ports", {})}
    json.dump(out, sys.stdout, indent=1)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
