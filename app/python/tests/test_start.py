# SPDX-License-Identifier: LGPL-2.1
"""Plan U6: the Start page's data: boards, recent setups, and the board's examples from the index."""
import os
import pathlib
import tempfile
import time
import unittest

from ownstudio_lab import examples as ex
from ownstudio_lab import setups as su
from ownstudio_lab import start

from test_setups import fake_core

BOARDS = pathlib.Path(__file__).parents[3] / "boards"
REAL_EXAMPLES = os.environ.get("OWNSTUDIO_EXAMPLES")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


class ExamplesIndex(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.tmp.name
        write(f"{r}/TWIST/DC_DC/buck_voltage_mode/main.cpp", "")
        write(f"{r}/TWIST/DC_DC/buck_voltage_mode/README.md", "intro\n# Buck with PID controlled output voltage\n")
        write(f"{r}/TWIST/DC_DC/buck_voltage_mode/app.ini", "[env]\nboard_shield = twist\nlib_deps=\n    a = b\n")
        write(f"{r}/TWIST/DC_DC/buck_voltage_mode/mission/firmware/main.cpp", "")      # not an example of its own
        write(f"{r}/TWIST/Basic/Open-Loop PWM/main.cpp", "")
        write(f"{r}/SPIN/PWM/burst_mode/main.cpp", "")
        write(f"{r}/SPIN/PWM/burst_mode/app.ini", "[env]\nboard_shield = none_really\n")
        write(f"{r}/docs/home.md", "")
        self.root = r

    def tearDown(self):
        self.tmp.cleanup()

    def test_board_from_app_ini_else_from_the_top_folder(self):
        all_ = {e.path: e for e in ex.index(self.root)}
        self.assertEqual(set(all_), {"TWIST/DC_DC/buck_voltage_mode", "TWIST/Basic/Open-Loop PWM", "SPIN/PWM/burst_mode"})
        self.assertEqual(all_["TWIST/Basic/Open-Loop PWM"].board, "twist")       # no app.ini: inferred
        self.assertEqual(all_["SPIN/PWM/burst_mode"].board, "none_really")       # app.ini wins

    def test_titles_groups_extras_and_the_board_filter(self):
        twist = ex.index(self.root, "twist")
        self.assertEqual([e.title for e in twist], ["Open-Loop PWM", "Buck with PID controlled output voltage"])
        self.assertEqual([e.group for e in twist], ["Basic", "DC_DC"])
        self.assertEqual([e.extras for e in twist], [False, True])


@unittest.skipUnless(REAL_EXAMPLES, "set OWNSTUDIO_EXAMPLES to a clone of owntech-foundation/examples")
class RealIndex(unittest.TestCase):
    def test_the_twist_examples_of_the_real_index(self):
        twist = ex.index(REAL_EXAMPLES, "twist")
        titles = {e.title for e in twist}
        self.assertGreaterEqual(len(twist), 20)
        self.assertIn("Buck with PID controlled output voltage", titles)
        self.assertIn("Open Loop PWM", titles)
        self.assertTrue(all(e.path.startswith("TWIST/") for e in twist))
        self.assertTrue(ex.index(REAL_EXAMPLES, "spin"))


class StartInfo(unittest.TestCase):
    def test_boards_recent_setups_newest_first(self):
        with tempfile.TemporaryDirectory() as home:
            upstream = fake_core(home)
            mirror = os.path.join(home, ".cache", "core.git")
            su.update_mirror(upstream, mirror)
            su.create_setup(mirror, os.path.join(home, "setups", "older"), "twist")
            time.sleep(0.05)
            su.create_setup(mirror, os.path.join(home, "setups", "newer"), "twist", "Newer buck")
            os.makedirs(os.path.join(home, "setups", "not-a-setup"))
            info = start.start_info(home, str(BOARDS))
            self.assertEqual([b["board"] for b in info["boards"]], ["twist", "spin", "ownverter"])
            self.assertEqual(info["boards"][0]["label"], "Twist 1.4.2")
            self.assertTrue(info["boards"][0]["defined"])
            self.assertFalse(info["boards"][1]["defined"])
            self.assertEqual([s["name"] for s in info["recent"]], ["Newer buck", "older"])
            self.assertEqual(info["examples"], [])
            self.assertFalse(info["examplesFound"])


if __name__ == "__main__":
    unittest.main()
