# SPDX-License-Identifier: LGPL-2.1
import unittest

from fake_board import FakeShellPort
from ownstudio_lab.boards import Board
from ownstudio_lab.thingset import ThingSet, ThingSetError, find_thingset_port


def link(**kw):
    port = FakeShellPort(**kw)
    ts = ThingSet(port, timeout=0.5)
    ts.start()
    return ts, port


class Requests(unittest.TestCase):
    def test_start_selects_thingset(self):
        _, port = link()
        self.assertTrue(port.selected)

    def test_get_group(self):
        ts, _ = link()
        self.assertEqual(ts.get("Converter"), {"Mode": 0, "wVoltageRef_V": 12.0})

    def test_get_item(self):
        ts, _ = link()
        self.assertEqual(ts.get("Build/rSourceHash"), "53f91fdde3f983f4")

    def test_names(self):
        ts, _ = link()
        self.assertEqual(ts.names("Converter"), ["Mode", "wVoltageRef_V"])

    def test_update_escapes_quotes_for_the_shell(self):
        ts, port = link()
        ts.update("Converter", {"wVoltageRef_V": 11.5})
        self.assertEqual(ts.get("Converter/wVoltageRef_V"), 11.5)
        self.assertIn(b'=Converter {\\"wVoltageRef_V\\":11.5}', b"".join(port.writes))

    def test_long_requests_are_chunked(self):
        ts, port = link()
        ts.update("Converter", {"wVoltageRef_V": 11.123456789012345})
        self.assertTrue(all(len(w) <= 32 for w in port.writes))

    def test_read_only_write_raises_forbidden(self):
        ts, _ = link()
        with self.assertRaises(ThingSetError) as ctx:
            ts.update("Measurements", {"rDuty": 0.5})
        self.assertEqual(ctx.exception.code, 0xA3)

    def test_unknown_path_raises_not_found(self):
        ts, _ = link()
        with self.assertRaises(ThingSetError) as ctx:
            ts.get("Nope")
        self.assertEqual(ctx.exception.code, 0xA4)

    def test_duplicate_root_names_stay_visible(self):
        """As on the board before e4cb76a: the mission's Control and Core's."""
        ts, port = link(duplicate_control=True)
        port.tree["Control"] = {}
        self.assertEqual([n for n, _ in ts.tree("")].count("Control"), 2)

    def test_without_select_the_shell_does_not_answer_thingset(self):
        port = FakeShellPort()
        ts = ThingSet(port, timeout=0.3)
        with self.assertRaises(ThingSetError) as ctx:
            ts.get("")
        self.assertIsNone(ctx.exception.code)


class PortChoice(unittest.TestCase):
    def test_console_is_skipped_and_the_shell_port_found(self):
        board = Board("X", "TWIST_V1_4_2", {"1.0": "/dev/ttyACM0", "1.2": "/dev/ttyACM1"})
        tried = []

        def open_link(device):
            tried.append(device)
            ts = ThingSet(FakeShellPort(), timeout=0.3)
            ts.start()
            return ts

        device, ts = find_thingset_port(board, open_link)
        self.assertEqual(device, "/dev/ttyACM1")
        self.assertEqual(tried, ["/dev/ttyACM1"])
        self.assertIsNotNone(ts)


if __name__ == "__main__":
    unittest.main()
