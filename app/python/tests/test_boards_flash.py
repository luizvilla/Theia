# SPDX-License-Identifier: LGPL-2.1
import hashlib
import io
import json
import os
import pathlib
import stat
import tempfile
import unittest
from types import SimpleNamespace

from ownstudio_lab import flash as fl
from ownstudio_lab.boards import Board, find_boards


def port(device, serial, product, location, vid=0x2FE3):
    return SimpleNamespace(device=device, serial_number=serial, product=product, location=location, vid=vid)


class Discovery(unittest.TestCase):
    def test_ports_are_grouped_by_serial_number(self):
        ports = [port("/dev/ttyACM1", "A", "TWIST_V1_4_2", "3-4:1.2"),
                 port("/dev/ttyACM0", "A", "TWIST_V1_4_2", "3-4:1.0"),
                 port("/dev/ttyACM2", "B", "MCUBOOT", "3-5:1.0"),
                 port("/dev/ttyUSB0", "C", "FTDI", "1-1:1.0", vid=0x0403)]
        boards = find_boards(lambda: ports)
        self.assertEqual([b.serial_number for b in boards], ["A", "B"])
        self.assertEqual(boards[0].console, "/dev/ttyACM0")
        self.assertEqual(boards[0].other_ports(), ["/dev/ttyACM1"])
        self.assertTrue(boards[1].in_bootloader)


class Flashing(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        image = self.dir / "firmware.mcuboot.bin"
        image.write_bytes(b"\x3d\xb8\xf3\x96" + b"\0" * 60)
        self.manifest = self.dir / "manifest.json"
        self.manifest.write_text(json.dumps({
            "image": image.name, "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
            "build": {"source_hash": "0123456789abcdef"}}))
        self.mcumgr = self.dir / "mcumgr"
        self.mcumgr.write_text("#!/bin/sh\n")
        self.mcumgr.chmod(self.mcumgr.stat().st_mode | stat.S_IEXEC)
        self.state = {"A": "TWIST_V1_4_2"}
        self.calls = []

    def find(self):
        return [Board(s, p, {"1.0": f"/dev/fake-{s}"}) for s, p in self.state.items()]

    def touch(self, device):
        self.calls.append(("touch", device))
        self.state["A"] = "MCUBOOT"

    def run_tool(self, cmd, **kw):
        self.calls.append(tuple(cmd[5:7]))
        if cmd[-1] == "reset":
            self.state["A"] = "TWIST_V1_4_2"
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    def flash(self, **kw):
        return fl.flash(self.manifest, kw.pop("serial", None), str(self.mcumgr), log=lambda *_: None,
                        find=self.find, touch=self.touch, run=self.run_tool, sleep=lambda _: None, **kw)

    def test_full_sequence(self):
        board = self.flash()
        self.assertEqual(self.calls, [("touch", "/dev/fake-A"), ("image", "upload"), ("reset",)])
        self.assertEqual(board.product, "TWIST_V1_4_2")

    def test_fake_upload_reports_byte_progress(self):
        progress = []

        def upload(cmd, log):
            self.calls.append(tuple(cmd[5:7]))
            log("Uploading 32 / 64 bytes")
            log("Uploading 64 / 64 bytes")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        fl.flash(self.manifest, None, str(self.mcumgr), log=lambda line: progress.append(line),
                 find=self.find, touch=self.touch, run=self.run_tool, upload=upload, sleep=lambda _: None)
        self.assertIn("Uploading 32 / 64 bytes", progress)
        self.assertIn("Uploading 64 / 64 bytes", progress)

    def test_mcumgr_carriage_return_progress_is_streamed(self):
        process = SimpleNamespace(stdout=io.StringIO("Uploading 32 / 64 bytes\rUploading 64 / 64 bytes\n"), wait=lambda: 0)
        progress = []
        result = fl.stream_upload(["mcumgr"], progress.append, popen=lambda *args, **kwargs: process)
        self.assertEqual(progress, ["Uploading 32 / 64 bytes", "Uploading 64 / 64 bytes"])
        self.assertIn("64 / 64", result.stdout)

    def test_board_already_in_bootloader_is_not_touched(self):
        self.state["A"] = "MCUBOOT"
        self.flash()
        self.assertNotIn("touch", [c[0] for c in self.calls])

    def test_corrupt_image_is_refused_before_any_board_action(self):
        (self.dir / "firmware.mcuboot.bin").write_bytes(b"tampered")
        with self.assertRaises(fl.FlashError):
            self.flash()
        self.assertEqual(self.calls, [])

    def test_several_boards_need_a_serial_number(self):
        self.state["B"] = "TWIST_V1_4_2"
        with self.assertRaises(fl.FlashError):
            self.flash()
        self.assertEqual(self.calls, [])

    def test_named_board_must_be_present(self):
        with self.assertRaises(fl.FlashError):
            self.flash(serial="Z")

    def test_board_that_never_reaches_the_bootloader_fails(self):
        self.touch = lambda device: None
        with self.assertRaises(fl.FlashError) as ctx:
            self.flash()
        self.assertIn("bootloader", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
