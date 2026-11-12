# SPDX-License-Identifier: LGPL-2.1
"""Plan U5: setups are Core clones with an OwnStudio folder, committed at events (S4, S5, S7)."""
import os
import random
import subprocess
import tempfile
import time
import unittest

import yaml

from ownstudio_lab import setups as su


def run(cwd, *args, stdin=None):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True, input=stdin).stdout


def fake_core(root):
    """A small stand-in for OwnTech Core: platformio.ini, src/, zephyr/, as a bare 'upstream'."""
    work = os.path.join(root, "core-work")
    os.makedirs(os.path.join(work, "src"))
    os.makedirs(os.path.join(work, "zephyr", "boards"))
    for path, text in {"platformio.ini": "[env:twist]\n", "src/main.cpp": "void setup_routine() {}\n",
                       "zephyr/boards/README": "boards\n"}.items():
        with open(os.path.join(work, path), "w") as f:
            f.write(text)
    run(work, "git", "init", "--quiet", "-b", "main")
    run(work, "git", "add", "-A")
    run(work, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "Core")
    upstream = os.path.join(root, "core.git")
    run(root, "git", "clone", "--quiet", "--bare", work, upstream)
    return upstream


class Setups(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.upstream = fake_core(self.root)
        self.mirror = os.path.join(self.root, "cache", "core.git")
        su.update_mirror(self.upstream, self.mirror)
        self.setup = su.create_setup(self.mirror, os.path.join(self.root, "twist-buck"), "twist", upstream=self.upstream)

    def tearDown(self):
        self.tmp.cleanup()

    def edit_canvas(self, ohm):
        path = os.path.join(self.setup, su.SETUP_FILE)
        with open(path) as f:
            data = yaml.safe_load(f)
        data["canvas"]["nodes"] = [n for n in data["canvas"]["nodes"] if n["id"] != "load"] + [{"id": "load", "part": "resistor", "ohm": ohm}]
        with open(path, "w") as f:
            yaml.safe_dump(data, f, sort_keys=False)

    def ohm(self):
        with open(os.path.join(self.setup, su.SETUP_FILE)) as f:
            return next((n["ohm"] for n in yaml.safe_load(f)["canvas"]["nodes"] if n["id"] == "load"), None)

    def branches(self):
        return set(su.git(self.setup, "for-each-ref", "--format=%(refname:short)", "refs/heads").split())

    def test_create_clones_core_and_commits_the_setup_file(self):
        self.assertTrue(os.path.exists(os.path.join(self.setup, "platformio.ini")))
        self.assertEqual(su.current_branch(self.setup), "twist-buck")
        with open(os.path.join(self.setup, su.SETUP_FILE)) as f:
            data = yaml.safe_load(f)
        self.assertEqual(data["board"], "twist")
        self.assertEqual(data["canvas"]["nodes"], [{"id": "board", "part": "twist"}])
        self.assertEqual([d.event for d in su.timeline(self.setup)], ["create"])
        self.assertIn("core", su.git(self.setup, "remote").split())
        with open(os.path.join(self.setup, ".gitignore")) as f:
            self.assertIn("ownstudio/records/", f.read().splitlines())
        self.assertFalse(su.is_dirty(self.setup))

    def test_create_copies_the_board_plant_into_the_setup_commit(self):
        boards = os.path.join(self.root, "boards")
        plant = os.path.join(boards, "twist", "plant")
        os.makedirs(plant)
        with open(os.path.join(boards, "twist", "board.yaml"), "w") as f:
            f.write("plant:\n  file: plant/twist_buck.pulsim\n  wrapper: plant/control_block.cpp\n  control_source: src/control.cpp\n")
        with open(os.path.join(plant, "twist_buck.pulsim"), "w") as f:
            f.write("{\"version\": \"1.0\"}\n")
        with open(os.path.join(plant, "control_block.cpp"), "w") as f:
            f.write("// wrapper\n")
        dest = os.path.join(self.root, "with-plant")
        su.create_setup(self.mirror, dest, "twist", "with plant", board_root=boards)
        with open(os.path.join(dest, su.SETUP_FILE)) as f:
            setup = yaml.safe_load(f)
        self.assertEqual(setup["plant"]["file"], "ownstudio/plant/twist_buck.pulsim")
        self.assertEqual(setup["plant"]["wrapper"], "ownstudio/plant/control_block.cpp")
        self.assertTrue(os.path.isfile(os.path.join(dest, setup["plant"]["file"])))
        self.assertTrue(os.path.isfile(os.path.join(dest, setup["plant"]["wrapper"])))
        self.assertIn("ownstudio/plant/twist_buck.pulsim", su.git(dest, "show", "--name-only", "--format=", "HEAD"))
        self.assertFalse(su.is_dirty(dest))

    def test_the_mirror_works_offline(self):
        os.rename(self.upstream, self.upstream + ".gone")
        self.assertFalse(su.update_mirror(self.upstream, self.mirror))      # fetch fails, the mirror stays
        other = su.create_setup(self.mirror, os.path.join(self.root, "offline"), "twist")
        self.assertTrue(os.path.exists(os.path.join(other, su.SETUP_FILE)))

    def test_events_are_commits_with_a_trailer_and_the_timeline_lists_them(self):
        self.edit_canvas(33)
        su.commit_event(self.setup, "canvas", "load added")
        su.commit_event(self.setup, "build", "build", {"OwnStudio-Firmware": "584efeb"})
        dots = su.timeline(self.setup)
        self.assertEqual([d.event for d in dots], ["create", "canvas", "build"])
        message = su.git(self.setup, "log", "-1", "--format=%B")
        self.assertIn("OwnStudio-Event: build", message)
        self.assertIn("OwnStudio-Firmware: 584efeb", message)
        with self.assertRaises(su.SetupError):
            su.commit_event(self.setup, "lunch", "not an event")

    def test_restore_shows_an_old_dot_without_a_branch_and_back(self):
        self.edit_canvas(33)
        first = su.commit_event(self.setup, "canvas", "33 ohm")
        self.edit_canvas(10)
        su.commit_event(self.setup, "canvas", "10 ohm")
        before = su.all_commits(self.setup)
        branches = self.branches()
        su.restore(self.setup, first.commit)
        self.assertEqual(self.ohm(), 33)
        self.assertIsNone(su.current_branch(self.setup))
        self.assertEqual(self.branches(), branches)
        self.assertEqual(su.back_to_latest(self.setup), "twist-buck")
        self.assertEqual(self.ohm(), 10)
        self.assertEqual(su.all_commits(self.setup), before)

    def test_unsaved_work_is_committed_before_a_restore(self):
        first = su.timeline(self.setup)[0]
        self.edit_canvas(47)
        su.restore(self.setup, first.commit)
        self.assertEqual(su.timeline(self.setup, ref="twist-buck")[-1].event, "save")
        su.back_to_latest(self.setup)
        self.assertEqual(self.ohm(), 47)

    def test_the_first_edit_after_a_restore_makes_a_branch_and_loses_nothing(self):
        self.edit_canvas(33)
        first = su.commit_event(self.setup, "canvas", "33 ohm")
        self.edit_canvas(10)
        su.commit_event(self.setup, "canvas", "10 ohm")
        before = su.all_commits(self.setup)
        su.restore(self.setup, first.commit)
        self.edit_canvas(22)
        dot = su.commit_event(self.setup, "canvas", "22 ohm, from the 33 ohm dot")
        self.assertEqual(dot.branch, f"twist-buck-from-{first.commit[:7]}")
        self.assertEqual(su.current_branch(self.setup), dot.branch)
        self.assertTrue(before <= su.all_commits(self.setup))
        self.assertEqual(su.timeline(self.setup, ref="twist-buck")[-1].summary, "10 ohm")
        # A second branch from the same dot gets its own name.
        su.restore(self.setup, first.commit)
        self.edit_canvas(15)
        self.assertEqual(su.commit_event(self.setup, "canvas", "15 ohm").branch, f"twist-buck-from-{first.commit[:7]}-2")

    def test_a_commit_made_by_hand_on_a_restored_dot_is_kept(self):
        first = su.timeline(self.setup)[0]
        su.restore(self.setup, first.commit)
        su.git(self.setup, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "by hand")
        by_hand = su.git(self.setup, "rev-parse", "HEAD").strip()
        su.restore(self.setup, first.commit)
        self.assertIn(by_hand, su.all_commits(self.setup))
        self.assertTrue(su.git(self.setup, "branch", "--contains", by_hand).strip())

    def test_back_and_forth_without_edits_makes_no_branch(self):
        for ohm in range(5, 25):
            self.edit_canvas(ohm)
            su.commit_event(self.setup, "canvas", f"{ohm} ohm")
        dots = su.timeline(self.setup)
        branches = self.branches()
        rng = random.Random(7)
        for _ in range(50):
            su.restore(self.setup, rng.choice(dots).commit)
        su.back_to_latest(self.setup)
        self.assertEqual(self.branches(), branches)
        self.assertEqual(self.ohm(), 24)


REAL_EXAMPLES = os.environ.get("OWNSTUDIO_EXAMPLES")


class Examples(unittest.TestCase):
    """Plan U7: an example loads on its own branch; the previous work stays on its branch."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        upstream = fake_core(root)
        mirror = os.path.join(root, "core.git")
        su.update_mirror(upstream, mirror)
        self.setup = su.create_setup(mirror, os.path.join(root, "s"), "twist", "twist-buck")
        self.examples = os.path.join(root, "examples")
        ex = os.path.join(self.examples, "TWIST", "DC_DC", "buck_voltage_mode")
        os.makedirs(os.path.join(ex, "Image"))
        os.makedirs(os.path.join(ex, "ownstudio", "procedures"))
        for path, text in {"main.cpp": "// buck\n", "app.ini": "[env]\nboard_shield = twist\n", "README.md": "# Buck\n",
                           "Image/fig.png": "png", "ownstudio/procedures/capture.py": "# capture\n"}.items():
            with open(os.path.join(ex, path), "w") as f:
                f.write(text)
        run(self.examples, "git", "init", "--quiet")

    def tearDown(self):
        self.tmp.cleanup()

    def read(self, path):
        with open(os.path.join(self.setup, path)) as f:
            return f.read()

    def test_the_example_lands_on_its_own_branch_and_the_previous_work_stays(self):
        with open(os.path.join(self.setup, "src", "main.cpp"), "w") as f:
            f.write("// my own work, unsaved\n")
        out = su.load_example(self.setup, self.examples, "TWIST/DC_DC/buck_voltage_mode")
        self.assertEqual(out["branch"], "buck-voltage-mode")
        self.assertEqual(out["previous_branch"], "twist-buck")
        self.assertEqual(su.current_branch(self.setup), "buck-voltage-mode")
        self.assertEqual(self.read("src/main.cpp"), "// buck\n")
        self.assertTrue(os.path.exists(os.path.join(self.setup, "src", "app.ini")))
        self.assertFalse(os.path.exists(os.path.join(self.setup, "src", "README.md")))
        self.assertFalse(os.path.exists(os.path.join(self.setup, "src", "Image")))
        self.assertEqual(self.read("ownstudio/procedures/capture.py"), "# capture\n")       # the extras
        origin = yaml.safe_load(self.read(su.ORIGIN_FILE))
        self.assertEqual(origin["example"], "TWIST/DC_DC/buck_voltage_mode")
        self.assertTrue(origin["extras"])
        self.assertEqual(su.timeline(self.setup)[-1].event, "example")
        self.assertFalse(su.is_dirty(self.setup))
        # The previous work is on its branch, committed; no old/ folder anywhere.
        self.assertEqual(su.git(self.setup, "show", "twist-buck:src/main.cpp"), "// my own work, unsaved\n")
        self.assertFalse(os.path.exists(os.path.join(self.setup, "old")))

    def test_loading_the_same_example_twice_makes_a_second_branch(self):
        su.load_example(self.setup, self.examples, "TWIST/DC_DC/buck_voltage_mode")
        self.assertEqual(su.load_example(self.setup, self.examples, "TWIST/DC_DC/buck_voltage_mode")["branch"], "buck-voltage-mode-2")

    def test_not_an_example_is_refused(self):
        with self.assertRaises(su.SetupError):
            su.load_example(self.setup, self.examples, "TWIST/DC_DC")

    @unittest.skipUnless(REAL_EXAMPLES, "set OWNSTUDIO_EXAMPLES to a clone of owntech-foundation/examples")
    def test_the_real_buck_example_loads(self):
        out = su.load_example(self.setup, REAL_EXAMPLES, "TWIST/DC_DC/buck_voltage_mode")
        self.assertEqual(out["branch"], "buck-voltage-mode")
        self.assertIn("main.cpp", out["files"])
        self.assertIn("app.ini", out["files"])
        self.assertNotIn("mission", out["files"])
        self.assertIn("buck", self.read("src/main.cpp").lower())
        self.assertEqual(su.git(self.setup, "show", "twist-buck:src/main.cpp"), "void setup_routine() {}\n")


class CommandLine(unittest.TestCase):
    def test_create_event_timeline_restore_back(self):
        import json
        import sys
        with tempfile.TemporaryDirectory() as root:
            upstream = fake_core(root)
            py = [sys.executable, "-m", "ownstudio_lab.setups"]
            cli = lambda *a: json.loads(run(os.path.dirname(os.path.dirname(__file__)), *py, *a))
            mirror = os.path.join(root, "m.git")
            self.assertTrue(cli("mirror", upstream, mirror)["updated"])
            dest = cli("create", mirror, os.path.join(root, "s"), "twist", "My buck")["setup"]
            dot = cli("event", dest, "build", "build")
            self.assertEqual(dot["event"], "build")
            dots = cli("timeline", dest)
            self.assertEqual([d["event"] for d in dots], ["create", "build"])
            cli("restore", dest, dots[0]["commit"])
            self.assertEqual(cli("back", dest)["branch"], "my-buck")


class RestorePerformance(unittest.TestCase):
    """S7: 200 restores on a setup of 1 000 commits with 3 libraries, each under 2 s."""

    COMMITS, LIBRARIES, LIBRARY_FILES, RESTORES, LIMIT_S = 1000, 3, 300, 200, 2.0

    def test_two_hundred_restores_each_under_two_seconds(self):
        with tempfile.TemporaryDirectory() as root:
            repo = os.path.join(root, "big")
            run(root, "git", "init", "--quiet", "-b", "main", repo)
            run(repo, "git", "fast-import", "--quiet", stdin=self.history())
            run(repo, "git", "checkout", "--quiet", "main")
            dots = su.timeline(repo)
            self.assertEqual(len(dots), self.COMMITS)
            before = su.all_commits(repo)
            rng = random.Random(1)
            slowest = 0.0
            for _ in range(self.RESTORES):
                t0 = time.perf_counter()
                su.restore(repo, rng.choice(dots).commit)
                slowest = max(slowest, time.perf_counter() - t0)
            su.back_to_latest(repo)
            self.assertLess(slowest, self.LIMIT_S, f"slowest restore {slowest:.2f} s")
            self.assertEqual(su.all_commits(repo), before)
            print(f"\n  {self.RESTORES} restores on {self.COMMITS} commits: slowest {slowest * 1000:.0f} ms", end="")

    def history(self):
        """A fast-import stream: Core-like files, 3 libraries of 300 files, 1 000 event commits."""
        out = []
        mark = 0
        def blob(text):
            nonlocal mark
            mark += 1
            data = text.encode()
            out.append(f"blob\nmark :{mark}\ndata {len(data)}\n{text}\n")
            return mark
        files = {"platformio.ini": "[env:twist]\n", "src/main.cpp": "void setup_routine() {}\n"}
        for lib in range(self.LIBRARIES):
            for i in range(self.LIBRARY_FILES):
                files[f"lib/library{lib}/src/file{i}.cpp"] = f"// library {lib} file {i}\nint f{i}() {{ return {i}; }}\n"
        marks = {path: blob(text) for path, text in files.items()}
        for n in range(self.COMMITS):
            changed = {"ownstudio/setup.yaml": f"name: big\ncanvas: {{ohm: {n}}}\n", "src/control.cpp": f"float kp = {n};\n"}
            if n % 50 == 0:      # a library update now and then
                for i in range(0, self.LIBRARY_FILES, 3):
                    changed[f"lib/library{n % self.LIBRARIES}/src/file{i}.cpp"] = f"// v{n}\nint f{i}() {{ return {n}; }}\n"
            for path, text in changed.items():
                marks[path] = blob(text)
            message = f"event {n}\n\nOwnStudio-Event: canvas\n"
            out.append(f"commit refs/heads/main\ncommitter T <t@t> {1700000000 + n} +0000\ndata {len(message.encode())}\n{message}\n")
            if n == 0:
                out.extend(f"M 100644 :{m} {p}\n" for p, m in marks.items())
            else:
                out.extend(f"M 100644 :{marks[p]} {p}\n" for p in changed)
            out.append("\n")
        return "".join(out)


if __name__ == "__main__":
    unittest.main()
