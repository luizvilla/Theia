# SPDX-License-Identifier: LGPL-2.1
"""Targets and the procedure runner, on a fake mission (first-order 'converter') and a fake board."""
import io
import json
import pathlib
import subprocess
import tempfile
import textwrap
import unittest
from unittest import mock

from ownstudio_lab import procedure as proc
from ownstudio_lab import capture
from ownstudio_lab.fakes import fake_board_target
from ownstudio_lab.target import BoardTarget, SimTarget, TargetError, load_harness

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

    def test_firmware_without_scope_cannot_arm(self):
        with self.assertRaises(TargetError):
            BoardTarget(Board(), FakeLink(), sleep=lambda s: None).arm()


SCOPE_PROCEDURE = '''
PROCEDURE = {"title": "Scope", "targets": ["simulator", "board"],
             "power_on": {"group": "Converter", "name": "Mode", "value": 1}}
def run(target, ctx):
    target.update("Converter", {"wVoltageRef_V": 10.0, "Mode": 1})
    target.wait(0.1)
    target.arm()
    target.update("Converter", {"wVoltageRef_V": 12.0})
    target.wait(0.1)
    ctx.wave = target.capture()
    ctx.record("scope", "SCOPE", "L1", [{"id": "T1", "title": "t", "criterion": "c", "verdict": "INFO"}])
'''


class Waveforms(Fixture):
    """The same procedure gets its waveform the same way from the simulator and a board with a scope."""

    def run_on(self, kind):
        (self.m / "scope.py").write_text(SCOPE_PROCEDURE)
        harness = load_harness(self.m)
        target = fake_board_target(harness) if kind == "board" else SimTarget(harness)
        seen = {}
        original = proc.Context.record

        def keep(ctx, *args, **kwargs):
            seen["wave"] = ctx.wave
            return original(ctx, *args, **kwargs)
        proc.Context.record = keep
        try:
            proc.run_procedure(self.m, self.m / "scope.py", kind, FakeIO([]), allow_power=True, target=target)
        finally:
            proc.Context.record = original
        return seen["wave"], target

    def test_board_capture_is_aligned_on_the_trigger(self):
        wave, target = self.run_on("board")
        t, ref = wave["t"], wave["wVoltageRef_V"]
        self.assertEqual(len(t), 1024)
        self.assertAlmostEqual(t[205], 0.0)
        self.assertTrue((ref[t < 0] == 10.0).all() and (ref[t >= 0] == 12.0).all())
        self.assertEqual(wave["t_trigger"], 0.0)
        self.assertGreater(wave["rV1Low_V"][-1], 11.5)
        self.assertEqual(target.link.writes[-1], ("Converter", {"Mode": 0}))    # switched off at the end

    def test_simulator_marks_the_same_trigger(self):
        wave, _ = self.run_on("simulator")
        self.assertAlmostEqual(wave["t_trigger"], 0.1, places=6)
        self.assertEqual(wave["source"], "simulator")

    def test_capture_without_trigger_times_out(self):
        harness = load_harness(self.m)
        target = fake_board_target(harness)
        target.arm()
        with self.assertRaises(TargetError):
            target.capture(timeout=0.05)


class DefaultCapture(Fixture):
    def test_fake_board_capture_files_setup_record_report_and_waveform(self):
        ownstudio = self.m / "ownstudio"
        ownstudio.mkdir()
        (ownstudio / "setup.yaml").write_text(textwrap.dedent("""
            name: fake bench
            board: twist
            canvas:
              nodes:
                - {id: source, part: dc-source, values: {voltage: 30, limit: 1}}
                - {id: board, part: twist}
                - {id: load, part: resistor, values: {ohm: 33}}
              wires: []
            """))
        subprocess.run(["git", "-C", str(self.m), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(self.m), "-c", "user.name=test", "-c", "user.email=test@example.invalid",
                        "commit", "-qm", "fixture"], check=True)
        boards = pathlib.Path(__file__).resolve().parents[3] / "boards"
        fake = FakeIO([])
        target = fake_board_target(load_harness(self.m))
        with mock.patch.dict("os.environ", {"OWNSTUDIO_BOARDS": str(boards)}):
            status = proc.run_procedure(self.m, pathlib.Path(capture.__file__), "board", fake,
                                        allow_power=True, target=target)
        self.assertEqual(status, 0)
        record_folder, verdict = fake.records[0]
        self.assertEqual(verdict, "PASS")
        self.assertEqual(record_folder.parents[1], ownstudio / "records")
        waveform = (record_folder / "waveform.csv").read_text().splitlines()
        self.assertEqual(waveform[0], "t_s,V_LOW1_V,I_LOW1_A")
        self.assertEqual(len(waveform), 1025)
        record = json.loads((record_folder / "record.json").read_text())
        self.assertEqual(record["conditions"]["load_ohm"], 33)
        report = self.m / record["report"]
        self.assertTrue(report.is_file())
        self.assertIn("Captured waveform", report.read_text())
        status_lines = subprocess.run(["git", "-C", str(self.m), "status", "--porcelain"],
                                      capture_output=True, text=True, check=True).stdout
        self.assertNotIn("ownstudio/records", status_lines)
        self.assertIn("ownstudio/reports", status_lines)
        self.assertEqual(target.link.writes[-1], ("Converter", {"Mode": 0}))


TWIN_PROCEDURE = '''
PROCEDURE = {"title": "Twin", "targets": ["simulator", "board"],
             "power_on": {"group": "Converter", "name": "Mode", "value": 1},
             "twin": {"tau": "tau_s"}}
def run(target, ctx):
    target.update("Converter", {"wVoltageRef_V": 10.0, "Mode": 1})
    target.wait(0.02)
    v = target.get("Measurements")["rV1Low_V"]
    tau = 0.05 if target.kind == "board" else target.harness.tau
    ctx.record(f"twin-{target.kind}", "TWIN", "L1", [{"id": "T1", "title": "t", "criterion": "c", "measured": v,
               "expected": 10.0, "unit": "V", "passed": True}], conditions={"tau_s": tau})
'''


class Twin(Fixture):
    def test_board_run_brings_its_simulation_at_the_same_conditions(self):
        (self.m / "twin.py").write_text(TWIN_PROCEDURE)
        target = fake_board_target(load_harness(self.m))
        fake = FakeIO([])
        status = proc.run_procedure(self.m, self.m / "twin.py", "board", fake, allow_power=True, target=target, twin=True)
        self.assertEqual(status, 0)
        (board_path, _), (sim_path, _) = fake.records
        self.assertEqual(board_path.parent, sim_path.parent)                  # one campaign
        board, sim = (json.loads((p / "record.json").read_text()) for p in (board_path, sim_path))
        self.assertEqual((board["target"], sim["target"]), ("board", "simulator"))
        self.assertEqual((board["twin"], sim["twin"]), (sim_path.name, board_path.name))
        self.assertEqual(sim["conditions"], {"tau_s": 0.05})                 # the board's conditions
        self.assertIn("Conditions: tau_s = 0.05", (board_path / "record.md").read_text())

    def test_no_twin_without_the_flag(self):
        (self.m / "twin.py").write_text(TWIN_PROCEDURE)
        fake = FakeIO([])
        proc.run_procedure(self.m, self.m / "twin.py", "board", fake, allow_power=True,
                           target=fake_board_target(load_harness(self.m)))
        self.assertEqual(len(fake.records), 1)


class PowerToken(unittest.TestCase):
    def test_missing_invented_and_reused_tokens_are_refused(self):
        self.assertFalse(proc.consume_power_token(None, None))
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "token"
            path.write_text("issued-by-dialog")
            self.assertFalse(proc.consume_power_token(path, "invented"))
            self.assertFalse(path.exists())
            path.write_text("issued-by-dialog")
            self.assertTrue(proc.consume_power_token(path, "issued-by-dialog"))
            self.assertFalse(proc.consume_power_token(path, "issued-by-dialog"))


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
