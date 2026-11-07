# SPDX-License-Identifier: LGPL-2.1
"""Find connected OwnTech Spin boards.

A board is identified by its USB serial number, never by a port name: port
names move when boards are plugged, reset or flashed. One board can show
several serial ports (one per CDC-ACM interface), grouped here by serial
number and keyed by USB interface ("1.0", "1.2", ...).
"""
import os
from dataclasses import dataclass, field

from serial.tools import list_ports

OWNTECH_VID = 0x2FE3
BOOTLOADER_PRODUCT = "MCUBOOT"


@dataclass
class Board:
    serial_number: str
    product: str
    ports: dict = field(default_factory=dict)  # USB interface -> device path

    @property
    def in_bootloader(self):
        return self.product == BOOTLOADER_PRODUCT

    @property
    def console(self):
        """The first CDC-ACM interface: Zephyr's console, which also takes the
        1200-baud request to restart in the bootloader."""
        return self.ports[min(self.ports, key=_interface_key)]

    def other_ports(self):
        first = min(self.ports, key=_interface_key)
        return [self.ports[i] for i in sorted(self.ports, key=_interface_key) if i != first]

    def to_json(self):
        return {"serial_number": self.serial_number, "product": self.product,
                "ports": dict(self.ports), "in_bootloader": self.in_bootloader}


def _interface_key(interface):
    return tuple(int(part) if part.isdigit() else 0 for part in interface.split("."))


def _interface(location, index):
    # pyserial gives "3-4:1.0" on Linux; fall back to the enumeration order.
    if location and ":" in location:
        return location.rsplit(":", 1)[1]
    return f"x.{index}"


def find_boards(comports=list_ports.comports):
    boards = {}
    for index, port in enumerate(sorted(comports(), key=lambda p: p.device)):
        if port.vid != OWNTECH_VID or not port.serial_number:
            continue
        board = boards.setdefault(port.serial_number, Board(port.serial_number, port.product or ""))
        board.ports[_interface(port.location, index)] = port.device
    return sorted(boards.values(), key=lambda b: b.serial_number)


def find_board(serial_number, comports=list_ports.comports):
    return next((b for b in find_boards(comports) if b.serial_number == serial_number), None)


def stable_path(device, serial_number, by_id="/dev/serial/by-id"):
    """On Linux, the /dev/serial/by-id link that names this board's serial
    number and points at device. A ttyACM number can be reused by another
    board right after a reset; the by-id link cannot."""
    if not os.path.isdir(by_id):
        return device
    target = os.path.realpath(device)
    for entry in sorted(os.listdir(by_id)):
        link = os.path.join(by_id, entry)
        if serial_number in entry and os.path.realpath(link) == target:
            return link
    return device
