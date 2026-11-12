# SPDX-License-Identifier: LGPL-2.1
"""U13: a board-copied Pulsim project runs the setup's native control C-Block."""
import importlib.util
import os
import pathlib
import shutil
import tempfile
import textwrap
import unittest
from unittest import mock

import yaml

from ownstudio_lab.simulation import Harness, load_project
from ownstudio_lab.target import load_harness


RUNTIME = importlib.util.find_spec("pulsim") and importlib.util.find_spec("pulsimgui")


@unittest.skipUnless(RUNTIME, "pulsim and pulsimgui are installed by the OwnStudio bundle")
class NativePlant(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.setup = pathlib.Path(self.tmp.name)
        plant = self.setup / "ownstudio" / "plant"
        source = self.setup / "src"
        plant.mkdir(parents=True)
        source.mkdir()
        root = pathlib.Path(__file__).resolve().parents[3]
        shutil.copy2(root / "boards/twist/plant/twist_buck.pulsim", plant)
        shutil.copy2(root / "boards/twist/plant/control_block.cpp", plant)
        shutil.copytree(root / "boards/twist/plant/shim", plant / "shim")
        setup = {
            "name": "native simulation", "board": "twist",
            "plant": {"file": "ownstudio/plant/twist_buck.pulsim",
                      "wrapper": "ownstudio/plant/control_block.cpp", "control_source": "src/control.cpp",
                      "host_include_dirs": ["ownstudio/plant/shim"]},
            "canvas": {
                "nodes": [
                    {"id": "source", "part": "dc-source", "values": {"voltage": 36.0}},
                    {"id": "board", "part": "twist", "values": {"inductance_H": 44e-6}},
                    {"id": "load", "part": "resistor", "values": {"ohm": 12.0}},
                ],
                "wires": [
                    {"from": {"node": "source", "port": "out"}, "to": {"node": "board", "port": "HIGH"}},
                    {"from": {"node": "board", "port": "LOW1"}, "to": {"node": "load", "port": "in"}},
                ],
            },
        }
        (self.setup / "ownstudio" / "setup.yaml").write_text(yaml.safe_dump(setup, sort_keys=False))
        (source / "control.h").write_text(textwrap.dedent("""
            #pragma once
            struct Measurements { float v1_low, i1_low, v2_low, i2_low, v_high, i_high; };
            void control_init(float period_s);
            float control_step(float reference, const Measurements &m);
            """))
        (source / "control.cpp").write_text(textwrap.dedent("""
            #include "control.h"
            void control_init(float) {}
            float control_step(float reference, const Measurements &) { return reference / 36.0F + 0.00123F; }
            """))

    def tearDown(self):
        self.tmp.cleanup()

    def test_canvas_values_are_applied_by_component_name(self):
        project, _, _, values = load_project(self.setup)
        parts = {part.name: part for part in project.get_active_circuit().components.values()}
        self.assertEqual(values, {"Vin": 36.0, "Rload": 12.0, "L": 44e-6, "C": 14.1e-6})
        self.assertEqual(parts["Vin"].parameters["waveform"]["value"], 36.0)
        self.assertEqual(parts["Rload"].parameters["resistance"], 12.0)

    def test_native_block_drives_the_plant_and_exact_edges_are_not_quantized(self):
        harness = Harness(self.setup, store_every=40)
        try:
            harness.update("Converter", {"wVoltageRef_V": 12.0, "Mode": 1})
            harness.advance(0.001)
            wave = harness.capture()
            self.assertGreater(harness.block.n_fires, 5)
            self.assertGreater(wave["rV1Low_V"][-1], 0.0)
            self.assertTrue(harness.identity()["native_cblock"])
            if harness.exact_edges:
                dt = harness.q["step_s"]
                off_grid = [edge for edge in harness.edge_times if abs(edge / dt - round(edge / dt)) > 1e-5]
                self.assertTrue(off_grid, "the C-Block duty edge was rounded to the fixed-step grid")
        finally:
            harness.close()

    @unittest.skipUnless(os.environ.get("OWNSTUDIO_STEP4_MISSION"),
                         "set OWNSTUDIO_STEP4_MISSION to compare against the accepted step-4 harness")
    def test_step_response_matches_the_step4_harness(self):
        baseline = pathlib.Path(os.environ["OWNSTUDIO_STEP4_MISSION"])
        shutil.copy2(baseline / "firmware" / "control.cpp", self.setup / "src")
        shutil.copy2(baseline / "firmware" / "control.h", self.setup / "src")
        control_library = os.environ.get("OWNSTUDIO_CONTROL_LIBRARY")
        if not control_library:
            self.skipTest("set OWNSTUDIO_CONTROL_LIBRARY to the pinned control_library checkout")
        with mock.patch.dict(os.environ, {"OWNSTUDIO_CONTROL_LIBRARY": control_library}):
            old = load_harness(baseline, v_in=40.0, load_ohm=12.0, step_load_ohm=24.0, store_every=4)
            new = Harness(self.setup, v_in=40.0, load_ohm=12.0, step_load_ohm=24.0, store_every=4)
            try:
                for harness in (old, new):
                    harness.update("Converter", {"wVoltageRef_V": 12.0, "Mode": 1})
                    harness.advance(0.060)
                    harness.environment("load_step", True)
                    harness.advance(0.040)
                    harness.update("Converter", {"Mode": 0})
                old_wave, new_wave = old.capture(), new.capture()
                procedure_path = baseline / "tests" / "procedures" / "step_response.py"
                spec = importlib.util.spec_from_file_location("step4_response", procedure_path)
                procedure = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(procedure)
                old_cases = procedure.evaluate(old.q, old_wave["t"], old_wave["rV1Low_V"])
                new_cases = procedure.evaluate(new.q, new_wave["t"], new_wave["rV1Low_V"])
                tolerances = {"BUCK-STEP-01a": 0.05, "BUCK-STEP-01b": 0.10,
                              "BUCK-STEP-01c": 0.25, "BUCK-STEP-01d": 15.0}
                for accepted, actual in zip(old_cases, new_cases):
                    self.assertEqual(accepted["id"], actual["id"])
                    print(f"\n  {actual['id']}: step 4 {accepted['measured']:.6g}, "
                          f"C-Block {actual['measured']:.6g} {actual['unit']}", end="")
                    self.assertAlmostEqual(actual["measured"], accepted["measured"],
                                           delta=tolerances[actual["id"]], msg=actual["id"])
                self.assertTrue(new.exact_edges)
            finally:
                new.close()


if __name__ == "__main__":
    unittest.main()
