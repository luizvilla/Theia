# SPDX-License-Identifier: LGPL-2.1
"""ThingSet text mode over a Spin board's shell port.

The mission firmware runs a Zephyr shell on its second CDC-ACM port
(app.overlay). After each boot, `select thingset` makes ThingSet requests
the shell's default. Requests and responses follow the ThingSet text mode
(thingset.io/spec/v0.6/text-mode):

    ?Converter                     -> :85 {"Mode":0,"wVoltageRef_V":12.00}
    ?Converter null                -> :85 ["Mode","wVoltageRef_V"]
    =Converter {"wVoltageRef_V":12} -> :84
    ?Nope                          -> :A4 "Invalid endpoint"

The shell treats double quotes as argument delimiters, so they are sent
escaped. Requests go out in 32-byte chunks, because the firmware's serial
receive ring is smaller than a long request.
"""
import json
import re
import time

import serial

STATUS = {
    0x81: "Created", 0x82: "Deleted", 0x84: "Changed", 0x85: "Content",
    0xA0: "Bad Request", 0xA1: "Unauthorized", 0xA3: "Forbidden", 0xA4: "Not Found",
    0xA5: "Method Not Allowed", 0xA8: "Request Entity Incomplete", 0xA9: "Conflict",
    0xAD: "Request Entity Too Large", 0xAF: "Unsupported Content-Format",
    0xC0: "Internal Server Error", 0xC1: "Not Implemented",
}

_ANSI = re.compile(r"\x1b\[[0-9;]*m")
_PROMPT = re.compile(r"[A-Za-z0-9_-]+:~\$ ?")
_RESPONSE = re.compile(r"^:([0-9A-Fa-f]{2})(?: (.*))?$")
CHUNK = 32


class ThingSetError(Exception):
    def __init__(self, code, message):
        self.code = code
        text = f"{STATUS.get(code, 'Error')} (:{code:02X})" if code is not None else "No answer"
        super().__init__(f"{text}: {message}" if message else text)


def _pairs(pairs):
    """Keep JSON objects as lists of pairs, so duplicate names stay visible."""
    return pairs


def _to_value(node):
    if isinstance(node, list) and node and all(isinstance(p, tuple) and len(p) == 2 for p in node):
        return {k: _to_value(v) for k, v in node}
    if isinstance(node, list):
        return [_to_value(v) for v in node]
    return node


class ThingSet:
    def __init__(self, port, timeout=2.0):
        self.port = port
        self.timeout = timeout

    @classmethod
    def open(cls, device, timeout=2.0):
        link = cls(serial.Serial(device, 115200, timeout=0.05), timeout)
        link.start()
        return link

    def close(self):
        self.port.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def start(self):
        """Clear the shell's line and make ThingSet its default command."""
        self.port.reset_input_buffer()
        self._exchange("")
        self._exchange("select thingset")

    # Requests -----------------------------------------------------------

    def get(self, path=""):
        return _to_value(self._request(f"?{path}"))

    def names(self, path=""):
        """Names of a group's children, in firmware order (duplicates kept)."""
        return self._request(f"?{path} null") or []

    def tree(self, path=""):
        """Children of a group with their values, as (name, value) pairs.
        Duplicates are kept: two objects with one name is a firmware bug."""
        node = self._request(f"?{path}")
        return [(k, _to_value(v)) for k, v in node] if isinstance(node, list) else []

    def update(self, group, values):
        """Write {name: value} into a group, one object per request."""
        for name, value in values.items():
            payload = json.dumps({name: value}, separators=(",", ":"))
            self._request(f"={group} {payload}")

    # Transport ----------------------------------------------------------

    def _request(self, text):
        lines = self._exchange(text)
        for line in lines:
            match = _RESPONSE.match(line)
            if match:
                code = int(match.group(1), 16)
                payload = match.group(2)
                value = json.loads(payload, object_pairs_hook=_pairs) if payload else None
                if code >= 0xA0:
                    raise ThingSetError(code, value if isinstance(value, str) else payload)
                return value
        raise ThingSetError(None, f"unexpected answer to {text!r}: {lines!r}")

    def _exchange(self, text):
        """Send one shell line and return the lines before the next prompt."""
        wire = (text.replace('"', '\\"') + "\r\n").encode()
        for start in range(0, len(wire), CHUNK):
            self.port.write(wire[start:start + CHUNK])
            if start + CHUNK < len(wire):
                self.port.flush()
                time.sleep(0.005)
        received = b""
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            chunk = self.port.read(max(1, self.port.in_waiting))
            if chunk:
                received += chunk
                plain = _ANSI.sub("", received.decode(errors="replace"))
                if _PROMPT.search(plain):
                    body = _PROMPT.split(plain)[0]
                    lines = [l.strip() for l in body.replace("\r", "").split("\n")]
                    echo = text.replace('"', '\\"')
                    return [l for l in lines if l and l not in (text, echo)]
        raise ThingSetError(None, f"no prompt after {text!r} within {self.timeout:.1f} s")


def find_thingset_port(board, open_link=ThingSet.open):
    """The board's port that answers ThingSet: every port but the console is
    tried in interface order. Returns (device, link) with the link open."""
    for device in board.other_ports():
        try:
            link = open_link(device)
            link.get("")
            return device, link
        except (ThingSetError, OSError, serial.SerialException):
            continue
    return None, None


def main(argv=None):
    """python -m ownstudio_lab.thingset [--board SERIAL] [PATH]: print one path as JSON."""
    import argparse
    import sys

    from .boards import find_boards

    parser = argparse.ArgumentParser(description="Read a ThingSet path from a connected board")
    parser.add_argument("path", nargs="?", default="")
    parser.add_argument("--board", help="USB serial number of the board")
    args = parser.parse_args(argv)
    boards = [b for b in find_boards() if not args.board or b.serial_number == args.board]
    if len(boards) != 1:
        print("error: connect exactly one board, or name it with --board", file=sys.stderr)
        return 1
    device, link = find_thingset_port(boards[0])
    if link is None:
        print(f"error: board {boards[0].serial_number} has no port answering ThingSet", file=sys.stderr)
        return 1
    with link:
        print(json.dumps({"board": boards[0].serial_number, "port": device, path_key(args.path): link.get(args.path)}))
    return 0


def path_key(path):
    return path or "/"


if __name__ == "__main__":
    raise SystemExit(main())
