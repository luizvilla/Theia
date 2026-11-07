# SPDX-License-Identifier: LGPL-2.1
"""The process the OwnStudio app talks to: one JSON object per line.

Requests on stdin:   {"id": 1, "method": "status", "params": {...}}
Answers on stdout:   {"id": 1, "result": ...}  or  {"id": 1, "error": "text"}
Events on stdout:    {"event": "log", "text": "..."}   (during a flash)

The bridge holds at most one ThingSet link, to one board picked by its USB
serial number. Methods:

status                        boards connected, and the open link if any
connect {serial_number}       open ThingSet on that board; read Build and Device
disconnect
get {path}                    read a path
update {group, values}        write {name: value} into a group
identity {mission}            the mission folder's source hash and pre-built manifest
tests {mission}                where the mission's validation stands (ownstudio_lab.testing.states)
design {mission, script, args} run design/<script>.py --json [args] in the mission; its JSON output
flash {manifest, serial_number?, mcumgr?}
                              close the link, flash, then link again once the new
                              firmware answers ThingSet (it takes a few seconds to boot)
"""
import json
import pathlib
import subprocess
import sys
import time

from . import flash as flashing
from . import testing
from .boards import find_boards
from .thingset import ThingSetError, find_thingset_port


class BridgeError(Exception):
    pass


class Bridge:
    def __init__(self, find=find_boards, open_link=find_thingset_port, flash=flashing.flash, emit=None,
                 sleep=time.sleep):
        self.find = find
        self.open_link = open_link
        self.flash_fn = flash
        self.emit = emit or (lambda event: None)
        self.sleep = sleep
        self.link = None
        self.linked = None

    # Methods ------------------------------------------------------------

    def status(self):
        boards = self.find()
        if self.linked:
            here = next((b for b in boards if b.serial_number == self.linked["serial_number"]), None)
            if here is None or here.in_bootloader:
                self.disconnect()
        return {"boards": [b.to_json() for b in boards], "link": self.linked}

    def connect(self, serial_number):
        if self.linked and self.linked["serial_number"] == serial_number:
            return self.linked
        self.disconnect()
        board = next((b for b in self.find() if b.serial_number == serial_number), None)
        if board is None:
            raise BridgeError(f"no board with serial number {serial_number} is connected")
        if board.in_bootloader:
            raise BridgeError("the board is in its bootloader: flash a firmware first")
        device, link = self.open_link(board)
        if link is None:
            raise BridgeError("no port of this board answers ThingSet: it is not running a mission firmware")
        self.link = link
        build = self._try(lambda: link.get("Build"))
        self.linked = {"serial_number": serial_number, "product": board.product, "port": device,
                       "build": build, "device": self._try(lambda: link.get("Device"))}
        return self.linked

    def disconnect(self):
        if self.link is not None:
            try:
                self.link.close()
            except OSError:
                pass
        self.link = None
        self.linked = None
        return None

    def get(self, path):
        return self._linked().get(path)

    def update(self, group, values):
        self._linked().update(group, values)
        return None

    def identity(self, mission):
        mission = pathlib.Path(mission)
        tool = mission / "tools" / "build_identity.py"
        sources = None
        if tool.is_file():
            result = subprocess.run([sys.executable, str(tool), "--json"], cwd=mission,
                                    capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                sources = json.loads(result.stdout)
        manifest_path = mission / "bin" / "manifest.json"
        prebuilt = json.loads(manifest_path.read_text()) if manifest_path.is_file() else None
        return {"sources": sources, "prebuilt": prebuilt}

    def tests(self, mission):
        mission = pathlib.Path(mission)
        if not (mission / "tests" / "catalogue.yaml").is_file():
            raise BridgeError("this mission has no tests/catalogue.yaml")
        try:
            return testing.states(mission)
        except testing.CatalogueError as err:
            raise BridgeError(f"tests/catalogue.yaml: {err}") from err

    def design(self, mission, script, args=None):
        mission = pathlib.Path(mission)
        if not script.replace("_", "").isalnum():
            raise BridgeError(f"not a design script name: {script!r}")
        path = mission / "design" / f"{script}.py"
        if not path.is_file():
            raise BridgeError(f"this mission has no design/{script}.py")
        args = [str(a) for a in (args or [])]
        result = subprocess.run([sys.executable, str(path), "--json", *args], cwd=mission,
                                capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise BridgeError(f"design/{script}.py: {(result.stderr or result.stdout).strip().splitlines()[-1:]}")
        return json.loads(result.stdout)

    def flash(self, manifest, serial_number=None, mcumgr=None):
        self.disconnect()
        try:
            board = self.flash_fn(manifest, serial_number, mcumgr,
                                  log=lambda text: self.emit({"event": "log", "text": text}))
        except flashing.FlashError as err:
            raise BridgeError(str(err)) from err
        for _ in range(10):
            try:
                self.connect(board.serial_number)
                break
            except BridgeError:
                self.sleep(1.0)
        return board.to_json()

    # Plumbing -----------------------------------------------------------

    def _linked(self):
        if self.link is None:
            raise BridgeError("not connected to a board")
        return self.link

    @staticmethod
    def _try(read):
        try:
            return read()
        except ThingSetError:
            return None

    def handle(self, request):
        method = request.get("method")
        params = request.get("params") or {}
        if method not in ("status", "connect", "disconnect", "get", "update", "identity", "tests", "design", "flash"):
            return {"id": request.get("id"), "error": f"unknown method {method!r}"}
        try:
            result = getattr(self, method)(**params)
        except (BridgeError, ThingSetError, OSError, TypeError, ValueError) as err:
            if isinstance(err, OSError):
                self.disconnect()  # the port went away: the board was unplugged or reset
            return {"id": request.get("id"), "error": str(err)}
        return {"id": request.get("id"), "result": result}


def main():
    def emit(message):
        sys.stdout.write(json.dumps(message) + "\n")
        sys.stdout.flush()

    bridge = Bridge(emit=emit)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as err:
            emit({"id": None, "error": f"bad request: {err}"})
            continue
        emit(bridge.handle(request))
    bridge.disconnect()


if __name__ == "__main__":
    main()
