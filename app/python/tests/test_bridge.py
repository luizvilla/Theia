# SPDX-License-Identifier: LGPL-2.1
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

from fake_board import FakeShellPort
from ownstudio_lab.boards import Board
from ownstudio_lab.bridge import Bridge
from ownstudio_lab.thingset import ThingSet

PYTHON_DIR = pathlib.Path(__file__).resolve().parents[1]


class Fixture(unittest.TestCase):
    def setUp(self):
        self.boards = [Board("A", "TWIST_V1_4_2", {"1.0": "/dev/a0", "1.2": "/dev/a1"})]
        self.ports = []

        def open_link(board):
            port = FakeShellPort()
            self.ports.append(port)
            link = ThingSet(port, timeout=0.3)
            link.start()
            return board.ports["1.2"], link

        self.bridge = Bridge(find=lambda: list(self.boards), open_link=open_link)

    def call(self, method, **params):
        return self.bridge.handle({"id": 7, "method": method, "params": params})


class Methods(Fixture):
    def test_tests_needs_a_catalogue(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIn("no tests/catalogue.yaml", self.call("tests", mission=tmp)["error"])

    def test_design_runs_a_mission_script(self):
        with tempfile.TemporaryDirectory() as tmp:
            (pathlib.Path(tmp) / "design").mkdir()
            (pathlib.Path(tmp) / "design" / "sizing.py").write_text(
                "import json, sys\nprint(json.dumps({'args': sys.argv[1:]}))\n")
            self.assertEqual(self.call("design", mission=tmp, script="sizing", args=["--x", 1])["result"],
                             {"args": ["--json", "--x", "1"]})
            self.assertIn("not a design script", self.call("design", mission=tmp, script="../x")["error"])
            self.assertIn("no design/loop.py", self.call("design", mission=tmp, script="loop")["error"])

    def test_procedures_are_listed_without_running_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = pathlib.Path(tmp) / "tests" / "procedures"
            folder.mkdir(parents=True)
            (folder / "step.py").write_text('"""Step.\n\nMore."""\nraise SystemExit("never run")\n'
                                            'PROCEDURE = {"title": "Step", "targets": ["simulator"], "tests": ["T1"],'
                                            ' "power_on": {"group": "C", "name": "M", "value": 1}}\n')
            (folder / "helper.py").write_text("X = 1\n")
            found = self.call("procedures", mission=tmp)["result"]
            self.assertEqual(found, [{"path": "tests/procedures/step.py", "title": "Step", "targets": ["simulator"],
                                      "tests": ["T1"], "level": "", "power_on": True, "doc": "Step."}])

    def test_tests_gives_states(self):
        with tempfile.TemporaryDirectory() as tmp:
            m = pathlib.Path(tmp)
            (m / "tests").mkdir()
            (m / "tests" / "catalogue.yaml").write_text(
                "tabs: [{id: a, title: A}]\ntests:\n  - {id: T1, tab: a, level: L0, title: t, criterion: c, "
                "status: implemented, target: pc, requirements: [R1]}\n")
            (m / "requirements.yaml").write_text("requirements:\n  - {id: R1, title: R, verified_by: [T1]}\n")
            result = self.call("tests", mission=tmp)["result"]
            self.assertEqual((result["tests"][0]["state"], result["requirements"][0]["state"]), ("not_run", "untested"))


    def test_status_lists_boards(self):
        answer = self.call("status")
        self.assertEqual(answer["id"], 7)
        self.assertEqual(answer["result"]["boards"][0]["serial_number"], "A")
        self.assertIsNone(answer["result"]["link"])

    def test_connect_reads_the_build_identity(self):
        link = self.call("connect", serial_number="A")["result"]
        self.assertEqual(link["port"], "/dev/a1")
        self.assertEqual(link["build"]["rSourceHash"], "53f91fdde3f983f4")

    def test_get_and_update(self):
        self.call("connect", serial_number="A")
        self.assertIsNone(self.call("update", group="Converter", values={"wVoltageRef_V": 10})["result"])
        self.assertEqual(self.call("get", path="Converter/wVoltageRef_V")["result"], 10)

    def test_errors_are_answers_not_crashes(self):
        self.assertIn("not connected", self.call("get", path="Build")["error"])
        self.assertIn("no board", self.call("connect", serial_number="Z")["error"])
        self.assertIn("unknown method", self.bridge.handle({"id": 1, "method": "rm"})["error"])
        self.call("connect", serial_number="A")
        self.assertIn("Forbidden", self.call("update", group="Measurements", values={"rDuty": 1})["error"])

    def test_link_drops_when_the_board_leaves(self):
        self.call("connect", serial_number="A")
        self.boards.clear()
        self.assertIsNone(self.call("status")["result"]["link"])
        self.assertTrue(self.ports[0].closed)

    def test_bootloader_board_cannot_be_connected(self):
        self.boards[0] = Board("A", "MCUBOOT", {"1.0": "/dev/a0"})
        self.assertIn("bootloader", self.call("connect", serial_number="A")["error"])

    def test_flash_links_again_once_the_firmware_answers(self):
        attempts = []
        inner = self.bridge.open_link

        def slow_boot(board):
            attempts.append(1)
            return (None, None) if len(attempts) < 3 else inner(board)

        self.bridge.open_link = slow_boot
        self.bridge.flash_fn = lambda manifest, serial, mcumgr, log: self.boards[0]
        self.bridge.sleep = lambda _: None
        self.call("flash", manifest="m.json")
        self.assertEqual(len(attempts), 3)
        self.assertEqual(self.call("status")["result"]["link"]["serial_number"], "A")

    def test_identity_reads_the_mission(self):
        mission = pathlib.Path(tempfile.mkdtemp())
        (mission / "tools").mkdir()
        (mission / "tools" / "build_identity.py").write_text(
            'import json; print(json.dumps({"commit": "c", "dirty": False, "source_hash": "h"}))\n')
        (mission / "bin").mkdir()
        (mission / "bin" / "manifest.json").write_text('{"sha256": "s"}')
        result = self.call("identity", mission=str(mission))["result"]
        self.assertEqual(result["sources"]["source_hash"], "h")
        self.assertEqual(result["prebuilt"]["sha256"], "s")


class Process(unittest.TestCase):
    def test_json_lines_over_stdio(self):
        proc = subprocess.run([sys.executable, "-m", "ownstudio_lab.bridge"], cwd=PYTHON_DIR,
                              input='{"id": 1, "method": "nope"}\nnot json\n',
                              capture_output=True, text=True, timeout=30)
        lines = [json.loads(l) for l in proc.stdout.splitlines()]
        self.assertEqual(lines[0], {"id": 1, "error": "unknown method 'nope'"})
        self.assertIn("bad request", lines[1]["error"])


if __name__ == "__main__":
    unittest.main()
