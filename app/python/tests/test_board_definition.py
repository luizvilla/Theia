# SPDX-License-Identifier: LGPL-2.1
"""Plan U4: the Twist 1.4.2's board definition, read from Core's devicetree overlay."""
import json
import os
import pathlib
import tempfile
import unittest

import yaml

from ownstudio_lab import board_definition as bd

HERE = pathlib.Path(__file__).parent
BOARD = HERE.parents[2] / "boards" / "twist" / "board.yaml"
FIXTURE_CORE = HERE / "data" / "core"
LIVE_CORE = os.environ.get("OWNSTUDIO_CORE")


class TwistFromTheOverlay(unittest.TestCase):
    core = FIXTURE_CORE

    @classmethod
    def setUpClass(cls):
        cls.board = bd.read_board(BOARD, cls.core)

    def test_identity_and_frequencies(self):
        self.assertEqual((self.board.name, self.board.version), ("TWIST", "v1.4.2"))
        self.assertEqual(self.board.default_frequency_hz, 200_000)
        self.assertEqual(self.board.min_frequency_hz, 50_000)

    def test_legs(self):
        self.assertEqual([leg.name for leg in self.board.legs], ["LEG1", "LEG2"])
        leg1 = self.board.leg("LEG1")
        self.assertEqual(leg1.pwm_devices, ["pwma", "pwma"])
        self.assertEqual(leg1.pwm_pins, [12, 14])
        self.assertEqual((leg1.driver_pin, leg1.current_pin, leg1.capacitor_pin), (19, 30, 7))
        self.assertEqual(leg1.dead_time_ns, [100, 100])
        self.assertEqual((leg1.modulation, leg1.edge_trigger, leg1.adc), ("UpDwn", "EdgeTrigger_up", "ADC_1"))
        self.assertTrue(leg1.enabled)
        self.assertEqual(self.board.leg("LEG2").pwm_devices, ["pwmc", "pwmc"])
        self.assertEqual(self.board.leg("LEG2").pwm_pins, [2, 4])

    def test_sensors(self):
        names = [s.name for s in self.board.sensors]
        self.assertEqual(names, ["V1_LOW", "V2_LOW", "V_HIGH", "I1_LOW", "I2_LOW", "I_HIGH",
                                 "TEMP_SENSOR_1", "TEMP_SENSOR_2", "ANALOG_COMM"])
        v1 = self.board.sensor("V1_LOW")
        self.assertAlmostEqual(v1.gain, 0.045, places=6)          # 0x3d3851ec
        self.assertAlmostEqual(v1.offset, -92.203, places=3)      # 0xc2b867f0
        self.assertEqual([(c.adc, c.channel, c.spin_pin) for c in v1.channels], [("ADC_1", 1, 29), ("ADC_2", 1, 29)])
        i1 = self.board.sensor("I1_LOW")
        self.assertEqual(i1.channels[0].spin_pin, 30)
        self.assertEqual(self.board.sensor("TEMP_SENSOR_1").conversion, "THERMISTANCE")
        self.assertIsNone(self.board.sensor("TEMP_SENSOR_1").gain)

    def test_thresholds(self):
        vh = self.board.threshold("V_HIGH")
        self.assertEqual((vh.low, vh.high, vh.enabled), (10.0, 100.0, True))
        self.assertEqual((self.board.threshold("I1_LOW").low, self.board.threshold("I1_LOW").high), (-7.0, 7.0))
        self.assertFalse(self.board.threshold("TEMP_SENSOR_1").enabled)

    def test_spin_pin_map(self):
        pins = {p.pin: p.port for p in self.board.spin_pins}
        self.assertEqual(len(pins), 46)
        self.assertEqual(pins[1], "PB11")
        # V1_LOW is read on Spin pin 29, channel 1 of ADC1 and ADC2: that is PA0 (ADC12_IN1) on the STM32G474.
        self.assertEqual(pins[29], "PA0")
        self.assertEqual(pins[59], "PG10")

    def test_port_ratings_come_from_the_thresholds(self):
        self.assertEqual(self.board.port_ratings("HIGH")["voltage"], {"sensor": "V_HIGH", "low": 10.0, "high": 100.0})
        self.assertEqual(self.board.port_ratings("LOW1")["current"]["high"], 7.0)

    def test_the_description_repeats_no_devicetree_fact(self):
        data = yaml.safe_load(BOARD.read_text())
        data.pop("devicetree")      # where the facts are, not facts
        text = repr(data).lower()
        for fact in ("200000", "frequency", "dead", "gain", "offset", "threshold", "spin_pin", "100.0", "70.0"):
            self.assertNotIn(fact, text, fact)


@unittest.skipUnless(LIVE_CORE, "set OWNSTUDIO_CORE to a Core clone to read its overlay")
class TwistFromALiveCore(TwistFromTheOverlay):
    core = LIVE_CORE


class OverlayFragments(unittest.TestCase):
    def test_labels_the_overlay_defines_are_not_stubbed_and_includes_are_dropped(self):
        text = '#include <dt-bindings/foo.h>\n/ { mine: node { x = <&mine &theirs>; }; };\n&theirs { status = "okay"; };\n'
        out = bd._with_stubs(text)
        self.assertIn("theirs: ownstudio-stub-theirs {};", out)
        self.assertNotIn("mine: ownstudio-stub", out)
        self.assertNotIn("#include", out)
        with tempfile.NamedTemporaryFile("w", suffix=".overlay", delete=False) as f:
            f.write(text)
        try:
            dt = bd.parse_devicetree([f.name])
            self.assertEqual(dt.get_node("/node").props["x"].type.name, "PHANDLES")
        finally:
            os.unlink(f.name)

    def test_board_yaml_is_valid_yaml_with_three_ports(self):
        d = yaml.safe_load(BOARD.read_text())
        self.assertEqual(list(d["ports"]), ["HIGH", "LOW1", "LOW2"])
        self.assertEqual(list(d["inside"]["blocks"]), ["power", "measurement", "feeder", "driver", "controller"])

    def test_the_board_ships_one_named_pulsim_plant_and_its_cblock_wrapper(self):
        board = yaml.safe_load(BOARD.read_text())
        root = BOARD.parent
        plant = json.loads((root / board["plant"]["file"]).read_text())
        self.assertTrue((root / board["plant"]["wrapper"]).is_file())
        self.assertTrue(all((root / folder).is_dir() for folder in board["plant"]["host_include_dirs"]))
        parts = {part["name"]: part for part in plant["circuits"]["main"]["components"]}
        self.assertEqual(parts["Vin"]["parameters"]["waveform"]["value"], 40.0)
        self.assertEqual(parts["L"]["parameters"]["inductance"], 33e-6)
        self.assertEqual(parts["C"]["parameters"]["capacitance"], 14.1e-6)
        self.assertEqual(parts["Rload"]["parameters"]["resistance"], 6.0)
        self.assertEqual(parts["PWM"]["parameters"]["frequency"], 200_000.0)
        self.assertEqual(parts["control_step"]["parameters"]["sample_time"], 100e-6)
        self.assertEqual((parts["control_step"]["parameters"]["n_inputs"],
                          parts["control_step"]["parameters"]["n_outputs"]), (7, 1))


if __name__ == "__main__":
    unittest.main()
