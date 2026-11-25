# SPDX-License-Identifier: LGPL-2.1
"""Plan U17: Codex, in the sandboxes OwnStudio offers, cannot open a serial port.

The board's port is where power could be switched on outside OwnStudio's
dialog. Codex runs every command, and every child of it, under Landlock and
seccomp; OwnStudio offers only its "Workspace" and "Read-Only" sandboxes
(common/agent-policy.ts). This runs the Codex the AI tab installed (#47: the
pinned version, in OwnStudio's folder) on a probe, with no model and no account.
Set OWNSTUDIO_CODEX to probe another binary.
/dev/ttyS0 stands in for /dev/ttyACM0: a serial device the user may open.
"""
import os
import pathlib
import platform
import re
import subprocess
import sys
import tempfile
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
PINNED = re.search(r"codex: \{.*?version: '([^']+)'", (APP / "packages/ownstudio-core/src/common/agent-pins.ts").read_text(), re.S)[1]
HOME = pathlib.Path(os.environ.get("OWNSTUDIO_HOME") or pathlib.Path.home() / "OwnStudio")
CODEX = pathlib.Path(os.environ.get("OWNSTUDIO_CODEX") or HOME / ".agents" / f"codex-{PINNED}" / "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex")
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


@unittest.skipUnless(platform.system() == "Linux" and CODEX.is_file(), f"Codex {PINNED} is not installed (AI tab: Install Codex), looked at {CODEX}")
@unittest.skipUnless(user_can_open_serial(), f"this user cannot open {SERIAL} anyway, so the probe proves nothing")
class CodexSandbox(unittest.TestCase):
    def run_probe(self, *mode):
        # An empty CODEX_HOME: the user's own ~/.codex/config.toml (permission profiles, sandbox_mode) must not choose the sandbox.
        with tempfile.TemporaryDirectory() as setup, tempfile.TemporaryDirectory() as codex_home:
            pathlib.Path(codex_home, "config.toml").write_text('model_reasoning_effort = "xhigh"\n')
            out = subprocess.run([str(CODEX), *mode, "sandbox", sys.executable, "-c", PROBE], cwd=setup,
                                 env={**os.environ, "CODEX_HOME": codex_home}, capture_output=True, text=True, timeout=60)
            self.assertEqual(out.returncode, 0, out.stderr)
            return dict(line.split() for line in out.stdout.splitlines())

    def test_workspace_sandbox_writes_the_setup_but_not_the_serial_port(self):
        self.assertEqual(self.run_probe("-c", "sandbox_mode=\"workspace-write\""), {"serial": "refused", "outside": "refused", "inside": "allowed"})

    def test_read_only_sandbox_writes_nothing(self):
        self.assertEqual(self.run_probe(), {"serial": "refused", "outside": "refused", "inside": "refused"})


if __name__ == "__main__":
    unittest.main()
