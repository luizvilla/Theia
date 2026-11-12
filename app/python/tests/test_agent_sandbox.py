# SPDX-License-Identifier: LGPL-2.1
"""Plan U17: Codex, in the sandboxes OwnStudio offers, cannot open a serial port.

The board's port is where power could be switched on outside OwnStudio's
dialog. Codex runs every command, and every child of it, under Landlock and
seccomp; OwnStudio offers only its "Workspace" and "Read-Only" sandboxes
(common/agent-policy.ts). This runs the Codex binary that the app ships
(from @openai/codex-sdk) on a probe, with no model and no account.
/dev/ttyS0 stands in for /dev/ttyACM0: a serial device the user may open.
"""
import os
import pathlib
import platform
import subprocess
import sys
import tempfile
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
CODEX = APP / "node_modules/@openai/codex-sdk/vendor/x86_64-unknown-linux-musl/codex/codex"
SERIAL = "/dev/ttyS0"
PROBE = f"""
import os
def attempt(what, action):
    try:
        action(); print(what, "allowed")
    except OSError:
        print(what, "refused")
attempt("serial", lambda: os.close(os.open({SERIAL!r}, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)))
attempt("outside", lambda: open({str(pathlib.Path.home() / ".cache" / "ownstudio-sandbox-probe")!r}, "w").close())
attempt("inside", lambda: open("probe", "w").close())
"""


def user_can_open_serial():
    try:
        os.close(os.open(SERIAL, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK))
        return True
    except OSError:
        return False


@unittest.skipUnless(platform.system() == "Linux" and CODEX.is_file(), "the app's Codex binary (Linux) is not installed")
@unittest.skipUnless(user_can_open_serial(), f"this user cannot open {SERIAL} anyway, so the probe proves nothing")
class CodexSandbox(unittest.TestCase):
    def run_probe(self, *mode):
        with tempfile.TemporaryDirectory() as setup:
            # -c: the user's own ~/.codex/config.toml may carry settings this Codex version does not know.
            out = subprocess.run([str(CODEX), "sandbox", "linux", "-c", "model_reasoning_effort=high", *mode,
                                  sys.executable, "-c", PROBE], cwd=setup, capture_output=True, text=True, timeout=60)
            self.assertEqual(out.returncode, 0, out.stderr)
            return dict(line.split() for line in out.stdout.splitlines())

    def test_workspace_sandbox_writes_the_setup_but_not_the_serial_port(self):
        self.assertEqual(self.run_probe("--full-auto"), {"serial": "refused", "outside": "refused", "inside": "allowed"})

    def test_read_only_sandbox_writes_nothing(self):
        self.assertEqual(self.run_probe(), {"serial": "refused", "outside": "refused", "inside": "refused"})


if __name__ == "__main__":
    unittest.main()
