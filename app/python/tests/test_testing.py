# SPDX-License-Identifier: LGPL-2.1
"""Catalogue, findings register, campaigns and states on a fixture mission with every state."""
import datetime
import json
import pathlib
import subprocess
import tempfile
import textwrap
import unittest

from ownstudio_lab import testing

CATALOGUE = """
tabs:
  - {id: loop, title: Closed loop, question: "Does the loop hold the requirements?"}
  - {id: link, title: Link}
tests:
  - {id: T-FAIL,    tab: loop, level: L1, title: a, criterion: c, status: implemented, target: simulator, requirements: [REQ-A]}
  - {id: T-KNOWN,   tab: loop, level: L1, title: b, criterion: c, status: implemented, target: simulator, requirements: [REQ-B]}
  - {id: T-BLKRUN,  tab: loop, level: L2, title: c, criterion: c, status: implemented, target: board}
  - {id: T-PASS,    tab: loop, level: L1, title: d, criterion: c, status: implemented, target: simulator, requirements: [REQ-C]}
  - {id: T-BENCH,   tab: loop, level: bench, title: d, criterion: c, status: implemented, target: board, requirements: [REQ-D]}
  - {id: T-INFO,    tab: link, level: bench, title: e, criterion: c, status: implemented, target: board}
  - {id: T-NOTRUN,  tab: link, level: L0, title: f, criterion: c, status: implemented, target: pc, requirements: [REQ-E]}
  - {id: T-BLOCKED, tab: link, level: L2, title: g, criterion: c, status: blocked, blocked_by: firmware scope, target: board}
  - {id: T-PLANNED, tab: link, level: L2, title: h, criterion: c, status: planned, target: board}
"""
REQUIREMENTS = """
requirements:
  - {id: REQ-A, title: A, verified_by: [T-FAIL]}
  - {id: REQ-B, title: B, verified_by: [T-KNOWN]}
  - {id: REQ-C, title: C, verified_by: [T-PASS]}
  - {id: REQ-D, title: D, verified_by: [T-BENCH]}
  - {id: REQ-E, title: E, verified_by: [T-NOTRUN]}
  - {id: REQ-F, title: F}
"""
FINDINGS = """
findings:
  - {issue: "https://github.com/x/y/issues/7", criteria: [T-KNOWN], cause: known cause, status: open}
  - {issue: "https://github.com/x/y/issues/8", criteria: [T-PASS], cause: fixed now, status: open}
"""


def case(cid, passed=True, **kw):
    return {"id": cid, "title": "t", "criterion": "c", "measured": 1.0, "expected": 1.0, "unit": "V",
            "passed": passed, **kw}


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.m = pathlib.Path(self.tmp.name)
        (self.m / "tests").mkdir()
        (self.m / "tests" / "catalogue.yaml").write_text(CATALOGUE)
        (self.m / "tests" / "findings.yaml").write_text(FINDINGS)
        (self.m / "requirements.yaml").write_text(REQUIREMENTS)
        subprocess.run(["git", "init", "-q", str(self.m)], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def record(self, name, cases, target="simulator", date=None):
        out = self.m / "records" / name
        testing.write_record(out, name, "L1", target, cases, self.m)
        if date:
            rec = json.loads((out / "record.json").read_text())
            rec["date"] = date
            (out / "record.json").write_text(json.dumps(rec))


class CatalogueTest(Fixture):
    def test_loads(self):
        self.assertEqual(len(testing.load_catalogue(self.m)["tests"]), 9)

    def test_reports_every_problem(self):
        (self.m / "tests" / "catalogue.yaml").write_text(textwrap.dedent("""
            tabs: [{id: a, title: A}]
            tests:
              - {id: X, tab: b, level: L9, title: t, criterion: c, status: maybe, target: moon}
              - {id: X, tab: a, level: L0, title: t, criterion: c, status: blocked, target: pc}
            """))
        with self.assertRaises(testing.CatalogueError) as err:
            testing.load_catalogue(self.m)
        text = str(err.exception)
        for part in ("tab 'b'", "level 'L9'", "status 'maybe'", "target 'moon'", "defined twice", "blocked_by"):
            self.assertIn(part, text)

    def test_requirement_links_both_ways(self):
        problems = testing.check_requirements(self.m, testing.load_catalogue(self.m))
        self.assertEqual(problems, ["REQ-F: no test case verifies it"])


class StatesTest(Fixture):
    def test_every_state(self):
        self.record("2026-11-07_aaaaaaa_100000/l1", [case("T-FAIL", False), case("T-KNOWN", False), case("T-PASS")],
                    date="2026-11-07T10:00:00+00:00")
        self.record("2026-11-07_aaaaaaa_110000/bench",
                    [case("T-BLKRUN", verdict="BLOCKED", reason="no load"), case("T-INFO.a", verdict="INFO"),
                     case("T-BENCH")], target="board", date="2026-11-07T11:00:00+00:00")
        data = testing.states(self.m)
        got = {t["id"]: t["state"] for t in data["tests"]}
        self.assertEqual(got, {"T-FAIL": "fail", "T-KNOWN": "known", "T-BLKRUN": "blocked_run", "T-PASS": "pass",
                               "T-BENCH": "pass", "T-INFO": "info", "T-NOTRUN": "not_run", "T-BLOCKED": "blocked",
                               "T-PLANNED": "planned"})
        known = next(t for t in data["tests"] if t["id"] == "T-KNOWN")
        self.assertTrue(known["finding"]["issue"].endswith("/7"))
        reqs = {r["id"]: r["state"] for r in data["requirements"]}
        self.assertEqual(reqs, {"REQ-A": "fail", "REQ-B": "known", "REQ-C": "sim-pass", "REQ-D": "bench-pass",
                                "REQ-E": "untested", "REQ-F": "no-case"})
        ready = {f["issue"][-1]: f["ready_to_close"] for f in data["findings"]}
        self.assertEqual(ready, {"7": False, "8": True})

    def test_simulation_and_bench_disagree(self):
        (self.m / "requirements.yaml").write_text("requirements:\n  - {id: REQ-A, title: A, verified_by: [T-PASS, T-BENCH]}\n")
        (self.m / "tests" / "catalogue.yaml").write_text(CATALOGUE.replace("requirements: [REQ-C]", "requirements: [REQ-A]")
                                                         .replace("requirements: [REQ-D]", "requirements: [REQ-A]"))
        self.record("a/l1", [case("T-PASS")])
        self.record("b/bench", [case("T-BENCH", False)], target="board")
        self.assertEqual(testing.states(self.m)["requirements"][0]["state"], "disagree")

    def test_newest_record_wins(self):
        self.record("old/l1", [case("T-FAIL", False)], date="2026-11-07T10:00:00+00:00")
        self.record("new/l1", [case("T-FAIL", True)], date="2026-11-07T12:00:00+00:00")
        t = next(t for t in testing.states(self.m)["tests"] if t["id"] == "T-FAIL")
        self.assertEqual((t["state"], t["latest"]["campaign"]), ("pass", "new"))

    def test_uncatalogued_cases_are_listed(self):
        self.record("c/l1", [case("NOPE-1")])
        self.assertEqual(testing.states(self.m)["unknown_cases"], ["NOPE-1"])

    def test_page_names_states_in_words(self):
        self.record("c/l1", [case("T-FAIL", False)])
        page = testing.control_center_html(self.m, testing.states(self.m))
        self.assertIn("✗ Failing", page)
        self.assertIn("◌ Not implemented", page)
        self.assertIn("Blocked by: firmware scope", page)


class CampaignTest(Fixture):
    def test_new_campaign_never_reuses_a_folder(self):
        now = datetime.datetime(2026, 11, 7, 12, 0, 0)
        a = testing.new_campaign(self.m, now=now)
        b = testing.new_campaign(self.m, now=now)
        self.assertNotEqual(a, b)
        self.assertTrue(a.name.startswith("2026-11-07_unknown"[:11]))
        self.assertTrue(a.name.endswith("_120000"))

    def test_record_with_operator_and_blocked_case(self):
        out = self.m / "records" / "x"
        ok = testing.write_record(out, "BENCH", "bench", "board",
                                  [case("T-BENCH"), case("T-BLKRUN", verdict="BLOCKED", reason="no meter")], self.m,
                                  operator={"V_LOW1_meter_V": 12.03})
        self.assertTrue(ok)
        rec = json.loads((out / "record.json").read_text())
        self.assertEqual((rec["verdict"], rec["operator"]["V_LOW1_meter_V"]), ("BLOCKED", 12.03))
        self.assertIn("Entered by the operator: V_LOW1_meter_V = 12.03", (out / "record.md").read_text())


if __name__ == "__main__":
    unittest.main()
