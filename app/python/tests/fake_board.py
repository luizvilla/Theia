# SPDX-License-Identifier: LGPL-2.1
"""A fake Spin shell port answering like the buck mission firmware does
(transcripts taken from a Twist on 2026-11-07)."""
import json

PROMPT = b"\x1b[1;32muart:~$ \x1b[m"


class FakeShellPort:
    def __init__(self, tree=None, duplicate_control=False):
        self.tree = tree or {
            "Measurements": {"rV1Low_V": -10.79, "rDuty": 0.3},
            "Converter": {"Mode": 0, "wVoltageRef_V": 12.0},
            "Build": {"rCommit": "e4cb76a2" * 5, "rDirty": False, "rSourceHash": "53f91fdde3f983f4"},
            "pNodeID": "68007B35FB262C21",
        }
        self.duplicate_control = duplicate_control
        self.selected = False
        self.out = b""
        self.line = b""
        self.writes = []
        self.closed = False

    # pyserial-like surface
    @property
    def in_waiting(self):
        return len(self.out)

    def read(self, n):
        data, self.out = self.out[:n], self.out[n:]
        return data

    def write(self, data):
        self.writes.append(data)
        self.line += data
        while b"\r\n" in self.line:
            line, self.line = self.line.split(b"\r\n", 1)
            self._answer(line.decode())

    def flush(self):
        pass

    def reset_input_buffer(self):
        self.out = b""

    def close(self):
        self.closed = True

    # shell
    def _say(self, echo, *lines):
        body = echo + "\r\n" + "".join(l + "\r\n" for l in lines)
        self.out += body.encode() + PROMPT

    def _answer(self, line):
        if line == "":
            self.out += b"\r\n" + PROMPT
            return
        if line == "select thingset":
            self.selected = True
            return self._say(line)
        if not self.selected:
            return self._say(line, f"\x1b[1;31m{line.split()[0]}: command not found\x1b[m")
        request = line.replace('\\"', '"')
        if request.startswith("?"):
            path, _, arg = request[1:].partition(" ")
            node = self._find(path)
            if node is None:
                return self._say(line, ':A4 "Invalid endpoint"')
            if arg == "null":
                names = list(node) + (["Control"] if path == "" and self.duplicate_control else [])
                return self._say(line, ":85 " + json.dumps(names))
            if isinstance(node, dict):
                text = json.dumps({k: (None if isinstance(v, dict) else v) for k, v in node.items()})
                if path == "" and self.duplicate_control:
                    text = text[:-1] + ', "Control":null}'
                return self._say(line, ":85 " + text)
            return self._say(line, ":85 " + json.dumps(node))
        if request.startswith("="):
            group, _, payload = request[1:].partition(" ")
            node = self._find(group)
            for name, value in json.loads(payload).items():
                if name not in node:
                    return self._say(line, ':A4 "Invalid endpoint"')
                if name.startswith("r"):
                    return self._say(line, f':A3 "Item {name} is read-only"')
                node[name] = value
            return self._say(line, ":84")
        return self._say(line, ':A0 "Bad request"')

    def _find(self, path):
        node = self.tree
        for part in [p for p in path.split("/") if p]:
            if not isinstance(node, dict) or part not in node:
                return None
            node = node[part]
        return node
