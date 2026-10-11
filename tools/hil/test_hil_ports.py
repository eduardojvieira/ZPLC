#!/usr/bin/env python3
"""HIL-007: the serial port is a parameter or is detected from USB identifiers; no port is opened here."""
import unittest

import hil_ports
from hil_ports import PortError, resolve_port

PICO = ("/dev/ttyACM0", 0x2E8A, 0x000A, "ZPLC Runtime")
OTHER = ("/dev/ttyUSB0", 0x10C4, 0xEA60, "CP2102 USB to UART Bridge")


def lister(*ports):
    return lambda: list(ports)


class ResolvePortTests(unittest.TestCase):
    def test_an_explicit_port_wins_without_listing_anything(self):
        def boom():
            raise AssertionError("the explicit port must not trigger a scan")

        self.assertEqual(resolve_port("COM7", board="rpi_pico", env={"ZPLC_SERIAL_PORT": "COM9"}, lister=boom), "COM7")

    def test_the_environment_names_the_port_when_no_argument_does(self):
        self.assertEqual(resolve_port(None, env={"ZPLC_SERIAL_PORT": "/dev/cu.usbmodem11"}, lister=lister()), "/dev/cu.usbmodem11")

    def test_the_board_is_found_by_its_usb_identifiers(self):
        self.assertEqual(resolve_port(None, board="rpi_pico", env={}, lister=lister(OTHER, PICO)), "/dev/ttyACM0")

    def test_board_identifiers_are_read_from_the_tracked_table(self):
        self.assertEqual(hil_ports.board_usb_ids("rpi_pico"), [(0x2E8A, 0x000A)])
        self.assertEqual(hil_ports.board_usb_ids("no_such_board"), [])

    def test_two_matching_devices_are_ambiguous_and_both_are_named(self):
        second = ("/dev/ttyACM1", 0x2E8A, 0x000A, "ZPLC Runtime")
        with self.assertRaises(PortError) as caught:
            resolve_port(None, board="rpi_pico", env={}, lister=lister(PICO, second))
        self.assertIn("/dev/ttyACM0", str(caught.exception))
        self.assertIn("/dev/ttyACM1", str(caught.exception))
        self.assertIn("--port", str(caught.exception))

    def test_the_two_macos_names_of_one_device_are_one_device(self):
        tty = ("/dev/tty.usbmodem1101", 0x2E8A, 0x000A, "ZPLC Runtime")
        cu = ("/dev/cu.usbmodem1101", 0x2E8A, 0x000A, "ZPLC Runtime")
        self.assertEqual(resolve_port(None, board="rpi_pico", env={}, lister=lister(tty, cu)), "/dev/cu.usbmodem1101")

    def test_no_match_lists_what_was_seen_instead_of_guessing(self):
        with self.assertRaises(PortError) as caught:
            resolve_port(None, board="rpi_pico", env={}, lister=lister(OTHER))
        self.assertIn("/dev/ttyUSB0", str(caught.exception))

    def test_a_board_without_known_identifiers_needs_an_explicit_port(self):
        with self.assertRaises(PortError) as caught:
            resolve_port(None, board="esp32s3_devkitc", env={}, lister=lister(PICO, OTHER))
        self.assertIn("ZPLC_SERIAL_PORT", str(caught.exception))

    def test_a_missing_pyserial_is_reported_as_a_port_error(self):
        def missing():
            raise PortError("pyserial is not installed")

        with self.assertRaises(PortError):
            resolve_port(None, board="rpi_pico", env={}, lister=missing)


if __name__ == "__main__":
    unittest.main()
