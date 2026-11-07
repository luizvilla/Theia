# SPDX-License-Identifier: LGPL-2.1
"""Flash a mission's pre-built firmware onto a Spin board through MCUboot.

Usage: python -m ownstudio_lab.flash <manifest.json> [--board SERIAL] [--mcumgr PATH]

Steps:
1. Check the image against the SHA-256 in its manifest.
2. Pick the board by USB serial number. With no --board, there must be
   exactly one board connected.
3. Restart it in MCUboot with the 1200-baud request on its first port.
4. Wait for the same serial number to come back as MCUBOOT.
5. Upload with mcumgr over the board's /dev/serial/by-id path, then reset.
6. Wait for the application to come back.

mcumgr is the OwnTech build (github.com/owntech-foundation/mcumgr). It is
given its connection on each call, so no ~/.mcumgr.cfg is written.
"""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

import serial

from .boards import find_boards, stable_path


class FlashError(Exception):
    pass


def check_image(manifest_path):
    manifest_path = pathlib.Path(manifest_path)
    manifest = json.loads(manifest_path.read_text())
    image = manifest_path.parent / manifest["image"]
    if not image.is_file():
        raise FlashError(f"image {image} is missing")
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    if digest != manifest["sha256"]:
        raise FlashError(f"{image.name} does not match its manifest (SHA-256 {digest[:16]}…, "
                         f"expected {manifest['sha256'][:16]}…); refusing to flash")
    return image, manifest


def pick_board(serial_number, boards):
    if serial_number:
        for board in boards:
            if board.serial_number == serial_number:
                return board
        raise FlashError(f"no board with serial number {serial_number} is connected")
    if not boards:
        raise FlashError("no OwnTech board is connected")
    if len(boards) > 1:
        raise FlashError("several boards are connected; choose one with --board: "
                         + ", ".join(b.serial_number for b in boards))
    return boards[0]


def touch_1200(device):
    """Open and close the port at 1200 baud: the Spin's request to restart in MCUboot."""
    port = serial.Serial()
    port.port = device
    port.baudrate = 1200
    port.dtr = False
    try:
        port.open()
        port.close()
    except (OSError, serial.SerialException):
        # The board may restart while the port is still opening; the request
        # went through. Whether it did is checked by waiting for MCUBOOT.
        pass


def wait_for(serial_number, bootloader, find, sleep, timeout):
    waited = 0.0
    while waited < timeout:
        for board in find():
            if board.serial_number == serial_number and board.in_bootloader == bootloader:
                return board
        sleep(0.25)
        waited += 0.25
    state = "bootloader" if bootloader else "application"
    raise FlashError(f"board {serial_number} did not come back in its {state} within {timeout:.0f} s")


def find_mcumgr(explicit=None):
    for candidate in (explicit, os.environ.get("OWNSTUDIO_MCUMGR"), shutil.which("mcumgr")):
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise FlashError("mcumgr not found: pass --mcumgr or set OWNSTUDIO_MCUMGR")


def flash(manifest_path, serial_number=None, mcumgr=None, log=print,
          find=find_boards, touch=touch_1200, run=subprocess.run, sleep=time.sleep):
    image, manifest = check_image(manifest_path)
    tool = find_mcumgr(mcumgr)
    board = pick_board(serial_number, find())
    log(f"Board {board.serial_number} ({board.product}); image {manifest['sha256'][:16]}, "
        f"sources {manifest['build']['source_hash']}")

    if not board.in_bootloader:
        log("Restarting the board in its bootloader…")
        touch(board.console)
        board = wait_for(board.serial_number, True, find, sleep, timeout=10)
        sleep(1.0)  # let MCUboot finish starting its serial recovery

    connection = ["--conntype", "serial", "--connstring",
                  f"dev={stable_path(board.console, board.serial_number)},baud=115200,mtu=128"]
    log("Uploading…")
    result = run([tool, *connection, "image", "upload", str(image)], capture_output=True, text=True)
    if result.returncode != 0:
        raise FlashError("upload failed: " + (result.stderr or result.stdout).strip())
    log("Restarting the board…")
    result = run([tool, *connection, "reset"], capture_output=True, text=True)
    if result.returncode != 0:
        raise FlashError("reset failed: " + (result.stderr or result.stdout).strip())
    board = wait_for(board.serial_number, False, find, sleep, timeout=30)
    log(f"Done: board {board.serial_number} runs {board.product}")
    return board


def main(argv=None):
    parser = argparse.ArgumentParser(description="Flash a mission's pre-built firmware through MCUboot")
    parser.add_argument("manifest", type=pathlib.Path)
    parser.add_argument("--board", help="USB serial number of the board")
    parser.add_argument("--mcumgr", help="path to the mcumgr executable")
    args = parser.parse_args(argv)
    try:
        flash(args.manifest, args.board, args.mcumgr)
    except FlashError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
