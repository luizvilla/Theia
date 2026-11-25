# SPDX-License-Identifier: LGPL-2.1-only
"""#18: the dev map redrawn from a recorded tracker snapshot (snapshot.json, `devmap.py snapshot`)."""
import copy
import datetime as dt
import json
import pathlib
import sys
import tomllib
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import devmap  # noqa: E402

SNAPSHOT = json.loads((HERE / "snapshot.json").read_text())
LAYOUT = tomllib.loads((HERE.parent / "layout.toml").read_text())
OVERVIEW = "# Overview\n\n<!-- devmap:diagram:start -->\nold\n<!-- devmap:diagram:end -->\n\nmore\n"


def snap(**changes):
    """The recorded snapshot with some tickets changed: snap(t47={"state": "OPEN"}, now=...)."""
    s = copy.deepcopy(SNAPSHOT)
    for key, value in changes.items():
        if key == "now":
            s["now"] = value
            continue
        t = next(t for t in s["tickets"] if t["number"] == int(key[1:]))
        t.update(value)
    return s


def node(diagram: str, node_id: str) -> str:
    return next(line.strip() for line in diagram.splitlines() if line.strip().startswith(node_id + "["))


def later(days: float) -> str:
    return (devmap.parse_time(SNAPSHOT["now"]) + dt.timedelta(days=days)).isoformat()


class Diagram(unittest.TestCase):
    def test_nodes_carry_number_icons_and_state(self):
        d = devmap.render_diagram(SNAPSHOT, LAYOUT)
        self.assertEqual(node(d, "N47"), 'N47["✓ #47 Agents installed<br/>on first use"]:::done')
        self.assertEqual(node(d, "N19"), 'N19["🔨👤 #19 F20 checked<br/>on the bench"]:::open')
        self.assertEqual(node(d, "N26"), 'N26["👤 #26 Slice 1 retest:<br/>nine steps"]:::blocked')
        self.assertEqual(node(d, "N18"), 'N18["🔨 #18 Dev map tooling"]:::wip')
        self.assertTrue(node(d, "N33_38").startswith('N33_38["🔨 #33–#38 T3–T8'))

    def test_fog_destination_and_done_before_the_map(self):
        d = devmap.render_diagram(SNAPSHOT, LAYOUT)
        self.assertEqual(node(d, "FT"), 'FT["trial build work"]:::fog')
        self.assertIn('DEST(["🎯', d)
        self.assertEqual(node(d, "D4"), 'D4["✓ Fixes F1–F20<br/>after the 11-19 trial"]:::done')

    def test_arrows_come_from_blocking_without_the_transitive_ones(self):
        d = devmap.render_diagram(SNAPSHOT, LAYOUT)
        self.assertIn("  N31 --> N32\n", d)
        self.assertIn("  N28 --> N48\n", d)
        self.assertNotIn("  N31 --> N40\n", d)      # #40 waits on #31, but through #32 and T3–T8
        self.assertIn("  N40 --> DEST\n", d)        # layout arrows
        self.assertIn("  N27 -.-> FS\n", d)

    def test_a_claimed_ticket_is_stale_after_three_idle_days(self):
        self.assertIn(":::wip", node(devmap.render_diagram(snap(now=later(2.5)), LAYOUT), "N18"))
        stale = devmap.render_diagram(snap(now=later(4)), LAYOUT)
        self.assertEqual(node(stale, "N18"), 'N18["⏳🔨 #18 Dev map tooling"]:::stale')
        self.assertIn("⏳ **stale**", devmap.render_resume(snap(now=later(4)), LAYOUT))

    def test_a_comment_or_commit_keeps_it_fresh(self):
        s = snap(now=later(4), t18={"lastComment": {"body": "stopped at x", "createdAt": later(3.5)}})
        self.assertIn(":::wip", node(devmap.render_diagram(s, LAYOUT), "N18"))
        s = snap(now=later(4), t18={"lastCommit": {"sha": "a" * 40, "date": later(3.5), "subject": "feat: x (#18)"}})
        self.assertIn(":::wip", node(devmap.render_diagram(s, LAYOUT), "N18"))

    def test_blocked_until_every_blocker_is_closed(self):
        open26 = [{"number": n, "state": "CLOSED"} for n in (19, 20, 23, 24, 25, 47)]
        self.assertIn(":::open", node(devmap.render_diagram(snap(t26={"blockedBy": open26}), LAYOUT), "N26"))
        open26[0]["state"] = "OPEN"
        self.assertIn(":::blocked", node(devmap.render_diagram(snap(t26={"blockedBy": open26}), LAYOUT), "N26"))

    def test_a_slice_all_done_shows_as_one_node_with_its_arrows(self):
        closed = {f"t{n}": {"state": "CLOSED", "assignees": []} for n in range(31, 41)}
        d = devmap.render_diagram(snap(**closed), LAYOUT)
        self.assertIn('S5_done["✓ Slice 5 · timing on the Spin<br/>10 tickets done"]:::done', d)
        self.assertNotIn("N31[", d)
        self.assertIn("  N30 --> S5_done\n", d)
        self.assertIn("  S5_done --> N41\n", d)
        self.assertIn("  S5_done --> DEST\n", d)

    def test_a_ticket_the_layout_does_not_place_still_shows(self):
        s = copy.deepcopy(SNAPSHOT)
        s["tickets"].append({"number": 99, "title": "A brand new question about something", "state": "OPEN",
                             "updatedAt": s["now"], "labels": ["wayfinder:grilling"], "assignees": [], "blockedBy": [],
                             "lastComment": None, "lastCommit": None})
        d = devmap.render_diagram(s, LAYOUT)
        self.assertIn('subgraph New["New tickets', d)
        self.assertIn('N99["#99 A brand new question about<br/>something"]:::open', d)

    def test_reduce_transitive(self):
        edges = {("a", "b"), ("b", "c"), ("a", "c"), ("c", "d"), ("a", "d")}
        self.assertEqual(devmap.reduce_transitive(edges), {("a", "b"), ("b", "c"), ("c", "d")})


class Writing(unittest.TestCase):
    def test_only_the_marked_blocks_change(self):
        body, overview, _ = devmap.plan(SNAPSHOT, LAYOUT, OVERVIEW)
        self.assertTrue(overview.startswith("# Overview\n\n<!-- devmap:diagram:start -->\n```mermaid"))
        self.assertTrue(overview.endswith("<!-- devmap:diagram:end -->\n\nmore\n"))
        outside = lambda text: devmap.splice(devmap.splice(text, "diagram", ""), "resume", "")
        self.assertEqual(outside(body), outside(SNAPSHOT["mapBody"]))

    def test_running_twice_changes_nothing(self):
        body, overview, _ = devmap.plan(SNAPSHOT, LAYOUT, OVERVIEW)
        again = dict(SNAPSHOT, mapBody=body)
        self.assertEqual(devmap.plan(again, LAYOUT, overview)[:2], (body, overview))

    def test_no_markers_no_write(self):
        with self.assertRaises(ValueError):
            devmap.splice("no markers here", "diagram", "x")

    def test_resume_lists_claimed_tickets_with_last_comment_and_commit(self):
        s = snap(t18={"lastCommit": {"sha": "abcdef0123", "date": SNAPSHOT["now"], "subject": "feat: devmap (#18)"}})
        r = devmap.render_resume(s, LAYOUT)
        self.assertIn("[Dev map tooling", r)
        self.assertIn("last commit: `abcdef0` feat: devmap (#18)", r)
        none = snap(t18={"assignees": []})
        self.assertEqual(devmap.render_resume(none, LAYOUT), "_Nothing in progress._ Takeable now: see the blue nodes.")


class Project(unittest.TestCase):
    def test_the_recorded_project_already_matches(self):
        self.assertEqual(devmap.project_changes(SNAPSHOT, LAYOUT), [])

    def test_a_missing_ticket_is_added_with_status_slice_and_kind(self):
        s = copy.deepcopy(SNAPSHOT)
        del s["project"]["items"]["50"]
        self.assertEqual(devmap.project_changes(s, LAYOUT),
                         [{"number": 50, "add": True, "set": {"Status": "Todo", "Kind": "Build", "Slice": "Slice 1"}}])

    def test_status_follows_the_ticket(self):
        s = snap(t50={"state": "CLOSED"})
        [change] = devmap.project_changes(s, LAYOUT)
        self.assertEqual((change["number"], change["set"]), (50, {"Status": "Done"}))
        self.assertEqual(devmap.project_changes(snap(now=later(4)), LAYOUT), [])   # stale stays In Progress


if __name__ == "__main__":
    unittest.main()
