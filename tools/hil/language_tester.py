import os
import struct
import time
from zplc_tester import ZPLCTester


class LanguageTester(ZPLCTester):
    """
    Extended tester for multi-language HIL tests.
    Provides helper methods for common verification patterns across IL, LD, FBD, SFC.
    """

    def compile_and_run(self, source_file, duration=1.0, reset=True):
        """Compiles any supported source file and runs it on the device."""
        print(f"Compiling {source_file}...")
        # compile_st in base class handles extension resolution and paths
        bytecode = self.compile_st(source_file)

        if reset:
            self.reset_state()

        self.upload_bytecode(bytecode)

        print(f"Running for {duration}s...")
        self.start_and_wait(duration=duration)

    def start_running(self):
        """Starts the PLC runtime without blocking."""
        self.send("zplc hil mode off")
        self.ser.reset_input_buffer()
        self.send("zplc start")
        time.sleep(0.1)  # Give it a moment to start

    def stop_running(self):
        """Stops the PLC runtime."""
        self.send("zplc stop")

    def poke(self, address, value, size=1):
        """Writes a value to memory address (hex). value is int."""
        data = bytearray()
        if size == 1:
            data.append(value & 0xFF)
        elif size == 2:
            data.extend(struct.pack("<H", value))
        elif size == 4:
            data.extend(struct.pack("<I", value))

        hex_str = data.hex()
        self.send(f"zplc dbg poke {hex(address)} {hex_str}")

    def expect_memory(self, address, fmt, expected_value, description="Value"):
        """
        Reads memory and asserts expected value.
        fmt: struct format string (e.g. '<h' for short, '<f' for float)
        """
        size_map = {"b": 1, "B": 1, "h": 2, "H": 2, "i": 4, "I": 4, "f": 4, "d": 8}
        # Get the last char of fmt as type indicator
        fmt_char = fmt[-1] if fmt[-1] in size_map else fmt[-2]
        size = size_map.get(fmt_char, 2)

        mem = self.peek(address, size)
        if len(mem) < size:
            print(
                f"FAIL: Incomplete read at {hex(address)} (Got {len(mem)} bytes, need {size})"
            )
            return False

        val = struct.unpack(fmt, bytearray(mem))[0]

        # Handle float comparison with tolerance
        if "f" in fmt or "d" in fmt:
            match = abs(val - expected_value) < 0.001
            val_str = f"{val:.4f}"
            exp_str = f"{expected_value:.4f}"
        else:
            match = val == expected_value
            val_str = str(val)
            exp_str = str(expected_value)

        status = "PASS ✅" if match else "FAIL ❌"
        print(f"{description}: {val_str} (Exp: {exp_str}) - {status}")
        return match

    def expect_bool(self, address, bit_offset, expected_bool, description="Flag"):
        """Reads a byte and checks a specific bit. Assumes OPI memory (adds 0x1000)."""
        # Add OPI base offset (0x1000) because tests use relative offsets for %Q
        real_addr = address + 0x1000
        mem = self.peek(real_addr, 1)
        if not mem:
            print(f"FAIL: Read failed at {hex(real_addr)}")
            return False

        val = (mem[0] >> bit_offset) & 1
        expected = 1 if expected_bool else 0
        match = val == expected

        status = "PASS ✅" if match else "FAIL ❌"
        print(f"{description}: {bool(val)} (Exp: {expected_bool}) - {status}")
        return match

    def expect_int16(self, address, expected_value, description="Int16"):
        return self.expect_memory(address + 0x1000, "<h", expected_value, description)

    def expect_int32(self, address, expected_value, description="Int32"):
        return self.expect_memory(address + 0x1000, "<i", expected_value, description)

    def expect_real(self, address, expected_value, description="Real"):
        return self.expect_memory(address + 0x1000, "<f", expected_value, description)
