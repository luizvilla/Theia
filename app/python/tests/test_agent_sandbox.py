# SPDX-License-Identifier: LGPL-2.1
"""Plan U17 and #51: Codex and Claude Code, as OwnStudio runs them, cannot open a serial port.

The board's port is where power could be switched on outside OwnStudio's
dialog. Codex runs every command, and every child of it, under Landlock and
seccomp; OwnStudio offers only its "Workspace" and "Read-Only" sandboxes
(common/agent-policy.ts). This runs the Codex the AI tab installed (#47: the
pinned version, in OwnStudio's folder) on a probe, with no model and no account.
Set OWNSTUDIO_CODEX to probe another binary.
#51: Claude Code runs every command in the agent SDK's sandbox (bubblewrap and socat on
Linux). The installed SDK runs one query through OwnStudio's own sandboxed()
(claude_sandbox_driver.mjs, needs `npm test` built lib/) against a local mock of the
Messages API, which answers with one Bash call to the probe: no account, no model.
Set OWNSTUDIO_CLAUDE_SDK to probe another SDK folder.
/dev/ttyS0 stands in for /dev/ttyACM0: a serial device the user may open.
"""
import http.server
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
PINNED = re.search(r"codex: \{.*?version: '([^']+)'", (APP / "packages/ownstudio-core/src/common/agent-pins.ts").read_text(), re.S)[1]
HOME = pathlib.Path(os.environ.get("OWNSTUDIO_HOME") or pathlib.Path.home() / "OwnStudio")
CODEX = pathlib.Path(os.environ.get("OWNSTUDIO_CODEX") or HOME / ".agents" / f"codex-{PINNED}" / "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex")
CLAUDE_PIN = re.search(r"claude: \{.*?version: '([^']+)'", (APP / "packages/ownstudio-core/src/common/agent-pins.ts").read_text(), re.S)[1]
CLAUDE_SDK = pathlib.Path(os.environ.get("OWNSTUDIO_CLAUDE_SDK") or HOME / ".agents" / f"claude-{CLAUDE_PIN}" / "node_modules/@anthropic-ai/claude-agent-sdk")
DRIVER = pathlib.Path(__file__).with_name("claude_sandbox_driver.mjs")
LOOKUP = APP / "packages/ownstudio-core/lib/node/agent-lookup.js"
SERIAL = "/dev/ttyS0"
OUTSIDE = pathlib.Path.home() / ".cache" / "ownstudio-sandbox-probe"
PROBE = f"""
import os
def attempt(what, action):
    try:
        action(); print(what, "allowed")
    except OSError:
        print(what, "refused")
attempt("serial", lambda: os.close(os.open({SERIAL!r}, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)))
attempt("outside", lambda: open({str(OUTSIDE)!r}, "w").close())
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


class MockMessages(http.server.BaseHTTPRequestHandler):
    """The Messages API, enough for one turn: a Bash call to the probe, then "done".
    The Bash tool's result, as Claude Code sends it back, lands in `server.tool_results`."""

    def log_message(self, *args):
        pass

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        self.reply_json({})

    def reply_json(self, body):
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
        if not self.path.startswith("/v1/messages") or "count_tokens" in self.path:
            return self.reply_json({"input_tokens": 1})
        results = [block for message in request.get("messages", []) if isinstance(message.get("content"), list)
                   for block in message["content"] if block.get("type") == "tool_result"]
        uses_bash = any(tool.get("name") == "Bash" for tool in request.get("tools", []))
        if results:
            self.server.tool_results.extend(results)
            block = {"type": "text", "text": "done"}
        elif uses_bash:
            block = {"type": "tool_use", "id": "toolu_probe", "name": "Bash", "input": self.server.bash_input}
        else:
            block = {"type": "text", "text": "ok"}
        stop = "tool_use" if block["type"] == "tool_use" else "end_turn"
        message = {"id": "msg_mock", "type": "message", "role": "assistant", "model": request.get("model", "mock"),
                   "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}}
        if not request.get("stream"):
            return self.reply_json({**message, "content": [block], "stop_reason": stop})
        start = {**block, "input": {}} if block["type"] == "tool_use" else {**block, "text": ""}
        delta = ({"type": "input_json_delta", "partial_json": json.dumps(block["input"])} if block["type"] == "tool_use"
                 else {"type": "text_delta", "text": block["text"]})
        events = [("message_start", {"type": "message_start", "message": message}),
                  ("content_block_start", {"type": "content_block_start", "index": 0, "content_block": start}),
                  ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": delta}),
                  ("content_block_stop", {"type": "content_block_stop", "index": 0}),
                  ("message_delta", {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": 1}}),
                  ("message_stop", {"type": "message_stop"})]
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for name, data in events:
            self.wfile.write(f"event: {name}\ndata: {json.dumps(data)}\n\n".encode())
        self.wfile.flush()


@unittest.skipUnless(platform.system() == "Linux" and (CLAUDE_SDK / "sdk.mjs").is_file(), f"Claude Code {CLAUDE_PIN} is not installed (AI tab: Install Claude Code), looked at {CLAUDE_SDK}")
@unittest.skipUnless(LOOKUP.is_file(), f"{LOOKUP} is not built (npm test in packages/ownstudio-core)")
@unittest.skipUnless(user_can_open_serial(), f"this user cannot open {SERIAL} anyway, so the probe proves nothing")
class ClaudeCodeSandbox(unittest.TestCase):
    def run_claude(self, bash, path=None):
        """Runs one query; returns the Bash results that came back to the mock model, and the driver's output."""
        OUTSIDE.unlink(missing_ok=True)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), MockMessages)
        server.tool_results = []
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as setup, tempfile.TemporaryDirectory() as config:
                pathlib.Path(setup, "probe.py").write_text(PROBE)
                server.bash_input = {"command": f"{sys.executable} probe.py", "description": "Run the probe", **bash}
                # An empty config folder: the user's own ~/.claude settings must not choose the sandbox.
                env = {key: value for key, value in os.environ.items() if not key.startswith(("ANTHROPIC_", "CLAUDE"))}
                if path:
                    env["PATH"] = path
                env.update(ANTHROPIC_BASE_URL=f"http://127.0.0.1:{server.server_address[1]}", ANTHROPIC_API_KEY="mock",
                           CLAUDE_CONFIG_DIR=config, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1", DISABLE_AUTOUPDATER="1")
                out = subprocess.run([shutil.which("node"), str(DRIVER), str(CLAUDE_SDK), setup], cwd=setup, env=env,
                                     capture_output=True, text=True, timeout=180)
                return list(server.tool_results), out
        finally:
            server.shutdown()
            server.server_close()
            OUTSIDE.unlink(missing_ok=True)

    def run_probe(self, **bash):
        """The probe's output, as Claude Code ran it from the Bash call the mock model made."""
        results, out = self.run_claude(bash)
        self.assertEqual(len(results), 1, f"no Bash result came back\n{out.stdout}\n{out.stderr}")
        content = results[0]["content"]
        text = content if isinstance(content, str) else "".join(part.get("text", "") for part in content)
        return dict(line.split()[:2] for line in text.splitlines() if line.split()[:1] in (["serial"], ["outside"], ["inside"]))

    def test_commands_write_the_setup_but_not_the_serial_port_or_outside(self):
        self.assertEqual(self.run_probe(), {"serial": "refused", "outside": "refused", "inside": "allowed"})

    def test_a_command_asking_to_leave_the_sandbox_stays_in_it(self):
        self.assertEqual(self.run_probe(dangerouslyDisableSandbox=True), {"serial": "refused", "outside": "refused", "inside": "allowed"})


    def test_without_socat_claude_code_does_not_start(self):
        # A PATH with this node and every system program but socat.
        with tempfile.TemporaryDirectory() as bin_dir:
            for folder in ("/usr/local/bin", "/usr/bin"):
                for program in pathlib.Path(folder).iterdir():
                    link = pathlib.Path(bin_dir, program.name)
                    if program.name != "socat" and not link.exists():
                        link.symlink_to(program)
            results, out = self.run_claude({}, path=f"{pathlib.Path(shutil.which('node')).parent}{os.pathsep}{bin_dir}")
        self.assertEqual(results, [], "a command ran without the sandbox")
        self.assertIn("socat not installed", out.stderr)
        self.assertIn("Refusing to start without a working sandbox", out.stderr)


if __name__ == "__main__":
    unittest.main()
