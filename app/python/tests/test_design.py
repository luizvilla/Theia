# SPDX-License-Identifier: LGPL-2.1
"""Plan U16: the Twist's design sheets, installed in every setup and run from it."""
import json
import math
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

import yaml

from ownstudio_lab import setups as su
from test_setups import fake_core

BOARDS = pathlib.Path(__file__).resolve().parents[3] / "boards"
DESIGN = BOARDS / "twist" / "design"
CONTROL_CPP = """#include "control.h"
static const float kp = 0.000215F;
static const float Ti = 7.5175e-5F;
static const float Td = 0.0F;
float control_step(float r, const Measurements &m) { return 0.0F; }
"""


def wired_setup(root, ohm=27.5, volts=30.0, board_values=None):
    """A setup folder as the sheets see it: canvas, board plant, control.cpp and the sheets."""
    setup = pathlib.Path(root) / "setup"
    (setup / "ownstudio").mkdir(parents=True)
    (setup / "src").mkdir()
    shutil.copytree(BOARDS / "twist" / "plant", setup / "ownstudio" / "plant")
    shutil.copytree(DESIGN, setup / "ownstudio" / "design", ignore=shutil.ignore_patterns("__pycache__"))
    (setup / "src" / "control.cpp").write_text(CONTROL_CPP)
    board = {"id": "board", "part": "twist"}
    if board_values:
        board["values"] = board_values
    data = {"name": "t", "board": "twist", "plant": {"file": "ownstudio/plant/twist_buck.pulsim"},
            "design": {"directory": "ownstudio/design"},
            "canvas": {"nodes": [board, {"id": "source", "part": "dc-source", "values": {"voltage": volts}},
                                 {"id": "load", "part": "resistor", "values": {"ohm": ohm}}],
                       "wires": [{"from": {"node": "source", "port": "out"}, "to": {"node": "board", "port": "HIGH"}},
                                 {"from": {"node": "board", "port": "LOW1"}, "to": {"node": "load", "port": "in"}}]}}
    (setup / "ownstudio" / "setup.yaml").write_text(yaml.safe_dump(data, sort_keys=False))
    return setup


def sheet(setup, name, *args, check=True):
    out = subprocess.run([sys.executable, str(setup / "ownstudio" / "design" / f"{name}.py"), "--json", *map(str, args)],
                         cwd=setup, capture_output=True, text=True)
    if check:
        if out.returncode:
            raise AssertionError(out.stderr)
        return json.loads(out.stdout)
    return out


class OutputFilter(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.setup = wired_setup(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def result(self, data, rid):
        return next(r for r in data["results"] if r["id"] == rid)

    def test_reads_the_canvas_and_the_plant(self):
        data = sheet(self.setup, "output_filter")
        self.assertEqual(data["inputs"]["v_in_V"], 30.0)            # the canvas source, not the plant's 40 V
        self.assertEqual(data["inputs"]["load_ohm"], 27.5)          # the canvas resistor
        self.assertEqual(data["inputs"]["f_sw_Hz"], 200e3)          # the plant's PWM
        self.assertEqual(data["values"]["inductance_H"], 33e-6)     # the plant default: the canvas says nothing
        self.assertEqual(data["board"], {"inductance_H": 33e-6, "capacitance_F": 14.1e-6})

    def test_ripple_is_the_textbook_formula(self):
        data = sheet(self.setup, "output_filter")
        d_i = (30 - 12) * (12 / 30) / (33e-6 * 200e3)
        self.assertAlmostEqual(self.result(data, "ripple_i")["value"], d_i, places=9)
        self.assertAlmostEqual(self.result(data, "ripple_v")["value"], d_i / (8 * 14.1e-6 * 200e3), places=9)
        self.assertTrue(self.result(data, "ripple_v")["meets"])     # 48 mV under the 100 mV limit

    def test_a_larger_L_lowers_the_ripple_and_the_canvas_value_is_used(self):
        base = self.result(sheet(self.setup, "output_filter"), "ripple_v")["value"]
        tried = self.result(sheet(self.setup, "output_filter", "--L", 47e-6), "ripple_v")["value"]
        self.assertAlmostEqual(tried, base * 33 / 47, places=9)
        other = wired_setup(pathlib.Path(self.tmp.name) / "b", board_values={"inductance_H": 47e-6})
        self.assertAlmostEqual(self.result(sheet(other, "output_filter"), "ripple_v")["value"], tried, places=12)

    def test_reversed_current_is_explained_not_called_an_error(self):
        valley = self.result(sheet(self.setup, "output_filter"), "i_valley")
        self.assertLess(valley["value"], 0)                          # 0.44 A load, 1.09 A ripple
        self.assertIn("synchronous", valley["note"])
        self.assertIsNone(valley["meets"])

    def test_the_curve_passes_through_the_current_point(self):
        data = sheet(self.setup, "output_filter")
        xs, ys = data["curve"]["inductance_H"], data["curve"]["ripple_V"]
        self.assertAlmostEqual(xs[0], 10e-6)
        self.assertAlmostEqual(xs[-1], 150e-6)
        self.assertTrue(all(a > b for a, b in zip(ys, ys[1:])))      # ripple falls as L grows

    def test_running_a_sheet_leaves_no_bytecode_in_the_setup(self):
        sheet(self.setup, "output_filter")
        sheet(self.setup, "control_loop")
        self.assertFalse((self.setup / "ownstudio" / "design" / "__pycache__").exists())

    def test_a_boost_operating_point_is_refused_with_a_sentence(self):
        out = sheet(self.setup, "output_filter", "--v-out", 40, check=False)
        self.assertEqual(out.returncode, 2)
        self.assertIn("between 0 and V_in", out.stderr)


class ControlLoop(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.setup = wired_setup(self.tmp.name)
        self.control = self.setup / "src" / "control.cpp"

    def tearDown(self):
        self.tmp.cleanup()

    def test_gains_come_from_control_cpp_and_margins_are_finite(self):
        data = sheet(self.setup, "control_loop")
        self.assertEqual(data["gains_in_control_cpp"], {"kp": 0.000215, "ti": 7.5175e-5})
        self.assertEqual(data["inputs"]["period_s"], 1e-4)           # the plant's C-Block sample time
        self.assertTrue(math.isfinite(data["margins"]["phase_margin_deg"]))
        self.assertAlmostEqual(data["f_Hz"][-1], 5000, places=6)     # up to the control Nyquist frequency

    def test_trying_gains_does_not_write_and_apply_writes_only_the_two_numbers(self):
        before = self.control.read_text()
        sheet(self.setup, "control_loop", "--kp", 0.001, "--ti", 2e-4)
        self.assertEqual(self.control.read_text(), before)
        data = sheet(self.setup, "control_loop", "--kp", 0.001, "--ti", 2e-4, "--apply")
        self.assertEqual(data["gains_in_control_cpp"], {"kp": 0.001, "ti": 2e-4})
        after = self.control.read_text()
        changed = [(a, b) for a, b in zip(before.splitlines(), after.splitlines()) if a != b]
        self.assertEqual(changed, [("static const float kp = 0.000215F;", "static const float kp = 0.001F;"),
                                   ("static const float Ti = 7.5175e-5F;", "static const float Ti = 0.0002F;")])

    def test_an_unchanged_gain_keeps_its_spelling(self):
        sheet(self.setup, "control_loop", "--kp", 0.0005, "--apply")
        self.assertIn("static const float Ti = 7.5175e-5F;", self.control.read_text())

    def test_a_control_cpp_it_cannot_change_safely_is_refused(self):
        self.control.write_text(CONTROL_CPP + "static const float kp = 1.0F;\n")
        before = self.control.read_text()
        out = sheet(self.setup, "control_loop", "--kp", 0.001, "--apply", check=False)
        self.assertEqual(out.returncode, 2)
        self.assertIn("exactly one", out.stderr)
        self.assertEqual(self.control.read_text(), before)

    def test_a_higher_gain_raises_the_crossover(self):
        low = sheet(self.setup, "control_loop")["margins"]["crossover_Hz"]
        high = sheet(self.setup, "control_loop", "--kp", 0.00215)["margins"]["crossover_Hz"]
        self.assertGreater(high, low)


class Install(unittest.TestCase):
    """The sheets join a setup at creation, or later for a setup made before U16."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        self.mirror = os.path.join(root, "cache", "core.git")
        su.update_mirror(fake_core(root), self.mirror)
        self.root = root

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_new_setup_carries_the_sheets_in_its_first_commit(self):
        dest = su.create_setup(self.mirror, os.path.join(self.root, "new"), "twist", board_root=str(BOARDS))
        info = su.design_sheets(dest)
        self.assertFalse(info["installed"])
        self.assertEqual([s["id"] for s in info["sheets"]], ["output_filter", "control_loop"])
        files = su.git(dest, "show", "--name-only", "--format=", "HEAD").split()
        self.assertIn("ownstudio/design/output_filter.py", files)
        self.assertFalse(any("__pycache__" in f for f in files))
        self.assertFalse(su.is_dirty(dest))

    def test_an_older_setup_gets_them_once_as_a_design_dot(self):
        dest = su.create_setup(self.mirror, os.path.join(self.root, "old"), "twist")
        with self.assertRaises(su.SetupError):
            su.design_sheets(dest)                                   # no board folder to take them from
        info = su.design_sheets(dest, str(BOARDS))
        self.assertTrue(info["installed"])
        self.assertEqual(su.timeline(dest)[-1].event, "design")
        self.assertFalse(su.is_dirty(dest))
        self.assertFalse(su.design_sheets(dest, str(BOARDS))["installed"])
        self.assertEqual(len(su.timeline(dest)), 2)


if __name__ == "__main__":
    unittest.main()


class Agents(unittest.TestCase):
    """Plan U17: every new setup tells the user's agents how to work in it, and their files stay out of git."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        mirror = os.path.join(self.tmp.name, "cache", "core.git")
        su.update_mirror(fake_core(self.tmp.name), mirror)
        self.setup = su.create_setup(mirror, os.path.join(self.tmp.name, "s"), "twist", board_root=str(BOARDS))

    def tearDown(self):
        self.tmp.cleanup()

    def test_agents_md_and_claude_md_are_in_the_first_commit(self):
        files = su.git(self.setup, "show", "--name-only", "--format=", "HEAD").split()
        self.assertIn("AGENTS.md", files)
        self.assertIn("CLAUDE.md", files)
        text = pathlib.Path(self.setup, "AGENTS.md").read_text()
        self.assertIn("never switch the converter on", text.lower())
        self.assertEqual(pathlib.Path(self.setup, "CLAUDE.md").read_text(), "@AGENTS.md\n")

    def test_claude_code_hooks_and_backups_do_not_dirty_the_setup(self):
        for path in (".claude/hooks/file-backup-hook.js", ".claude/settings.local.json", ".claude/.edit-baks/s1/x.cpp"):
            target = pathlib.Path(self.setup, path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("x")
        self.assertFalse(su.is_dirty(self.setup))

    def test_the_simulator_command_in_agents_md_names_a_real_procedure(self):
        from ownstudio_lab import capture, procedure
        self.assertIn(f"procedure . {procedure.DEFAULT_CAPTURE} --target simulator",
                      pathlib.Path(self.setup, "AGENTS.md").read_text())
        self.assertTrue(pathlib.Path(capture.__file__).is_file())
