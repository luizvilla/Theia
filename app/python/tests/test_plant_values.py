# SPDX-License-Identifier: LGPL-2.1
"""F2 (Q172) and F3 (Q173b): the canvas writes the plant's named values; no source, no simulation."""
import json
import pathlib
import shutil
import tempfile
import unittest

import yaml

from ownstudio_lab.plant_values import missing_for_simulation, write_plant

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = {"id": "source", "part": "dc-source", "values": {"voltage": 30.0, "limit": 1.0}}
LOAD = {"id": "load", "part": "resistor", "values": {"ohm": 33.0}}
WIRES = [
    {"from": {"node": "source", "port": "out"}, "to": {"node": "board", "port": "HIGH"}},
    {"from": {"node": "board", "port": "LOW1"}, "to": {"node": "load", "port": "in"}},
]


class PlantValues(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.setup = pathlib.Path(self.tmp.name)
        (self.setup / "ownstudio" / "plant").mkdir(parents=True)
        self.plant = self.setup / "ownstudio" / "plant" / "twist_buck.pulsim"
        shutil.copy2(ROOT / "boards/twist/plant/twist_buck.pulsim", self.plant)

    def tearDown(self):
        self.tmp.cleanup()

    def canvas(self, nodes, wires=()):
        setup = {"name": "t", "board": "twist", "plant": {"file": "ownstudio/plant/twist_buck.pulsim"},
                 "canvas": {"nodes": nodes, "wires": list(wires)}}
        (self.setup / "ownstudio" / "setup.yaml").write_text(yaml.safe_dump(setup, sort_keys=False))
        return setup

    def plant_values(self):
        document = json.loads(self.plant.read_text())
        parts = {c["name"]: c["parameters"] for c in document["circuits"]["main"]["components"]}
        return {"Vin": parts["Vin"]["waveform"]["value"], "Rload": parts["Rload"]["resistance"],
                "L": parts["L"]["inductance"], "C": parts["C"]["capacitance"]}

    def test_the_plant_file_follows_every_canvas_value(self):
        board = {"id": "board", "part": "twist", "values": {"inductance_H": 22.7e-6, "capacitance_F": 18.7e-6}}
        self.canvas([SOURCE, board, LOAD], WIRES)
        result = write_plant(self.setup)
        self.assertEqual(self.plant_values(), {"Vin": 30.0, "Rload": 33.0, "L": 22.7e-6, "C": 18.7e-6})
        self.assertEqual(set(result["written"]), {"Vin", "Rload", "L", "C"})
        self.assertIsNone(result["missing"])

        # A Design change (L) reaches the file; nothing else is rewritten.
        board["values"]["inductance_H"] = 52e-6
        self.canvas([SOURCE, board, LOAD], WIRES)
        self.assertEqual(write_plant(self.setup)["written"], {"L": 52e-6})
        self.assertEqual(self.plant_values()["L"], 52e-6)

    def test_an_unchanged_canvas_leaves_the_file_untouched(self):
        self.canvas([SOURCE, {"id": "board", "part": "twist"}, LOAD], WIRES)
        write_plant(self.setup)
        before = self.plant.stat().st_mtime_ns, self.plant.read_bytes()
        self.assertEqual(write_plant(self.setup)["written"], {})
        self.assertEqual((self.plant.stat().st_mtime_ns, self.plant.read_bytes()), before)

    def test_without_a_source_vin_is_left_alone_and_simulation_is_refused(self):
        template = self.plant_values()
        board = {"id": "board", "part": "twist", "values": {"inductance_H": 22.7e-6}}
        setup = self.canvas([board])
        result = write_plant(self.setup)
        self.assertEqual(result["written"], {"L": 22.7e-6})
        self.assertEqual(self.plant_values()["Vin"], template["Vin"])
        self.assertEqual(result["missing"], "Add a source on HIGH and a load on LOW1 to simulate.")
        self.assertEqual(missing_for_simulation(setup), result["missing"])

    def test_the_refusal_names_only_what_is_missing(self):
        board = {"id": "board", "part": "twist"}
        self.assertEqual(missing_for_simulation(self.canvas([SOURCE, board], WIRES[:1])), "Add a load on LOW1 to simulate.")
        self.assertEqual(missing_for_simulation(self.canvas([board, LOAD], WIRES[1:])), "Add a source on HIGH to simulate.")
        # Placed but not wired counts as missing: the simulator follows the wires.
        self.assertEqual(missing_for_simulation(self.canvas([SOURCE, board, LOAD])),
                         "Add a source on HIGH and a load on LOW1 to simulate.")


if __name__ == "__main__":
    unittest.main()
