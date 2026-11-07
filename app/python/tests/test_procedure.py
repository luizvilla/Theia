# SPDX-License-Identifier: LGPL-2.1
"""Targets and the procedure runner, on a fake mission (first-order 'converter') and a fake board."""
import io
import json
import pathlib
import subprocess
import tempfile
import textwrap
import unittest

from ownstudio_lab import procedure as proc
from ownstudio_lab.target import BoardTarget, TargetError, load_harness

HARNESS = '''
class Harness:
    def __init__(self, mission, tau=0.01):
        self.t, self.v, self.mode, self.ref, self.tau, self.trace = 0.0, 0.0, 0, 12.0, tau, []
    def get(self, group):
        return {"Converter": {"Mode": self.mode, "wVoltageRef_V": self.ref},
                "Measurements": {"rV1Low_V": self.v}}[group]
    def update(self, group, values):
        self.mode = values.get("Mode", self.mode); self.ref = values.get("wVoltageRef_V", self.ref)
    def advance(self, seconds):
        steps = int(round(seconds / 1e-4))
        for _ in range(steps):
            target = self.ref if self.mode == 1 else 0.0
            self.v += (target - self.v) * 1e-4 / self.tau; self.t += 1e-4; self.trace.append((self.t, self.v))
    def now(self): return self.t
    def capture(self):
        t, v = zip(*self.trace) if self.trace else ((), ()); self.trace = []; return {"t": list(t), "v": list(v)}
    def environment(self, name, value):
        raise ValueError(name)
    def identity(self): return {"model": "first order", "tau_s": self.tau}
'''

PROCEDURE = '''
PROCEDURE = {"title": "Step", "targets": ["simulator", "board"],
             "power_on": {"group": "Converter", "name": "Mode", "value": 1}}
def run(target, ctx):
    target.update("Converter", {"wVoltageRef_V": 10.0, "Mode": 1})
    target.wait(0.1)
    v = target.get("Measurements")["rV1Low_V"]
    ctx.log(f"v = {v:.3f}")
    ok = ctx.confirm("Looks right?")
    ctx.record("step", "STEP", "L1", [{"id": "T1", "title": "settles", "criterion": "within 1 %",
                "measured": v, "expected": 10.0, "unit": "V", "passed": abs(v - 10) < 0.1 and ok}])
'''

CATALOGUE = "tabs: [{id: a, title: A}]\ntests:\n  - {id: T1, tab: a, level: L1, title: t, criterion: c, status: implemented, target: simulator}\n"


class FakeIO:
    def __init__(self, answers):
        self.answers, self.logs, self.records = list(answers), [], []

    def log(self, text):
        self.logs.append(text)

    def ask(self, kind, question):
        return self.answers.pop(0)

    def record(self, path, verdict):
        self.records.append((path, verdict))

    def done(self, status, error=None):
        pass


class FakeLink:
    def __init__(self):
        self.groups = {"Converter": {"Mode": 0, "wVoltageRef_V": 12.0}, "Measurements": {"rV1Low_V": 9.95},
                       "Build": {"rCommit": "abc", "rDirty": False, "rSourceHash": "1234"}}
        self.writes, self.closed = [], False

    def get(self, group):
        return dict(self.groups[group])

    def update(self, group, values):
        self.writes.append((group, values))
        self.groups[group].update(values)

    def close(self):
        self.closed = True


class Board:
    serial_number = "S1"


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.m = pathlib.Path(self.tmp.name)
        (self.m / "tests").mkdir()
        (self.m / "tests" / "sim_harness.py").write_text(HARNESS)
        (self.m / "tests" / "catalogue.yaml").write_text(CATALOGUE)
        (self.m / "step.py").write_text(PROCEDURE)
        subprocess.run(["git", "init", "-q", str(self.m)], check=True)

    def tearDown(self):
        self.tmp.cleanup()


class Simulator(Fixture):
    def test_runs_and_files_a_record(self):
        fake = FakeIO([True])
        status = proc.run_procedure(self.m, self.m / "step.py", "simulator", fake)
        self.assertEqual(status, 0)
        path, verdict = fake.records[0]
        rec = json.loads((path / "record.json").read_text())
        self.assertEqual((verdict, rec["target"], rec["versions"]["model"]), ("PASS", "simulator", "first order"))
        self.assertTrue(path.parent.name.startswith("20"))     # a campaign folder

    def test_failed_case_gives_status_1(self):
        self.assertEqual(proc.run_procedure(self.m, self.m / "step.py", "simulator", FakeIO([False])), 1)

    def test_wait_is_simulated_time(self):
        harness = load_harness(self.m, tau=0.02)
        harness.update("Converter", {"Mode": 1})
        harness.advance(0.02)
        self.assertAlmostEqual(harness.now(), 0.02)


class Board_(Fixture):
    def test_power_needs_allow_power(self):
        with self.assertRaises(proc.ProcedureError):
            proc.run_procedure(self.m, self.m / "step.py", "board", FakeIO([True]))

    def test_guard_refuses_the_power_on_write(self):
        link = FakeLink()
        target = BoardTarget(Board(), link, proc.power_guard({"group": "Converter", "name": "Mode", "value": 1}, False))
        with self.assertRaises(TargetError):
            target.update("Converter", {"Mode": 1})
        self.assertEqual(link.writes, [])

    def test_board_run_with_permission_switches_off_at_the_end(self):
        link = FakeLink()
        target = BoardTarget(Board(), link, sleep=lambda s: None)
        fake = FakeIO([True])
        status = proc.run_procedure(self.m, self.m / "step.py", "board", fake, allow_power=True, target=target)
        self.assertEqual(status, 0)
        self.assertEqual(link.writes[-1], ("Converter", {"Mode": 0}))
        self.assertTrue(link.closed)
        rec = json.loads((fake.records[0][0] / "record.json").read_text())
        self.assertEqual(rec["board"]["serial_number"], "S1")

    def test_board_cannot_capture(self):
        with self.assertRaises(TargetError):
            BoardTarget(Board(), FakeLink()).capture()


class Json(unittest.TestCase):
    def test_ask_and_answer(self):
        out = io.StringIO()
        j = proc.JsonIO(out, io.StringIO(json.dumps({"id": 1, "answer": 12.5}) + "\n"))
        self.assertEqual(j.ask("number", "Meter?"), 12.5)
        self.assertEqual(json.loads(out.getvalue())["kind"], "number")

    def test_cancel(self):
        j = proc.JsonIO(io.StringIO(), io.StringIO(json.dumps({"id": 1, "answer": None}) + "\n"))
        with self.assertRaises(proc.ProcedureError):
            j.ask("confirm", "Go?")


if __name__ == "__main__":
    unittest.main()
