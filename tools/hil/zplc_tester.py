import serial
import time
import json
import binascii
import struct
import os
import re


class ZPLCTester:
    OP = {
        # System (0x00-0x0F)
        "NOP": 0x00,
        "HALT": 0x01,
        "BREAK": 0x02,
        "GET_TICKS": 0x03,
        # Stack (0x10-0x1F)
        "DUP": 0x10,
        "DROP": 0x11,
        "SWAP": 0x12,
        "OVER": 0x13,
        "ROT": 0x14,
        # Indirect
        "LOADI8": 0x15,
        "LOADI32": 0x16,
        "STOREI8": 0x17,
        "STOREI32": 0x18,
        "LOADI16": 0x19,
        "STOREI16": 0x1A,
        # String
        "STRLEN": 0x1B,
        "STRCPY": 0x1C,
        "STRCAT": 0x1D,
        "STRCMP": 0x1E,
        "STRCLR": 0x1F,
        # Int Arithmetic
        "ADD": 0x20,
        "SUB": 0x21,
        "MUL": 0x22,
        "DIV": 0x23,
        "MOD": 0x24,
        "NEG": 0x25,
        "ABS": 0x26,
        # Float Arithmetic
        "ADDF": 0x28,
        "SUBF": 0x29,
        "MULF": 0x2A,
        "DIVF": 0x2B,
        "NEGF": 0x2C,
        "ABSF": 0x2D,
        # Logic
        "AND": 0x30,
        "OR": 0x31,
        "XOR": 0x32,
        "NOT": 0x33,
        "SHL": 0x34,
        "SHR": 0x35,
        "SAR": 0x36,
        # Comparison
        "EQ": 0x38,
        "NE": 0x39,
        "LT": 0x3A,
        "LE": 0x3B,
        "GT": 0x3C,
        "GE": 0x3D,
        "LTU": 0x3E,
        "GTU": 0x3F,
        # 8-bit operands
        "PUSH8": 0x40,
        "PICK": 0x41,
        "JR": 0x50,
        "JRZ": 0x51,
        "JRNZ": 0x52,
        # 16-bit operands
        "LOAD8": 0x80,
        "LOAD16": 0x81,
        "LOAD32": 0x82,
        "LOAD64": 0x83,
        "STORE8": 0x84,
        "STORE16": 0x85,
        "STORE32": 0x86,
        "STORE64": 0x87,
        "PUSH16": 0x88,
        "JMP": 0x90,
        "JZ": 0x91,
        "JNZ": 0x92,
        "CALL": 0x93,
        "RET": 0x94,
        # Conversion
        "I2F": 0xA0,
        "F2I": 0xA1,
        "I2B": 0xA2,
        "EXT8": 0xA3,
        "EXT16": 0xA4,
        "ZEXT8": 0xA5,
        "ZEXT16": 0xA6,
        # 32-bit operands
        "PUSH32": 0xC0,
    }

    def __init__(self, port=None, baud=115200):
        if port is None:
            # Check environment variable first
            port = os.environ.get("ZPLC_PORT")

        if port is None:
            import glob

            ports = glob.glob("/dev/tty.usbmodem*")
            if not ports:
                # Try CU as fallback
                ports = glob.glob("/dev/cu.usbmodem*")

            if not ports:
                raise Exception("No Pico found on serial port")

            # Sort by modification time (most recent first) to get the active port
            ports.sort(key=lambda p: os.path.getmtime(p), reverse=True)
            port = ports[0]

        print(f"DEBUG: Using port {port}")

        self.ser = serial.Serial(port, baud, timeout=1)
        time.sleep(1)

    def close(self):
        self.ser.close()

    def send(self, cmd, wait_for="zplc:~$", timeout=5.0):
        """Envia un comando y espera el prompt o una respuesta específica."""
        while self.ser.in_waiting:
            self.ser.read(self.ser.in_waiting)

        self.ser.write(f"{cmd}\r\n".encode())

        start = time.time()
        response = ""
        while time.time() - start < timeout:
            if self.ser.in_waiting > 0:
                char = self.ser.read().decode("utf-8", errors="ignore")
                response += char
                if wait_for in response:
                    break
            else:
                time.sleep(0.01)
        return response

    def reset_state(self):
        self.send("zplc stop")
        self.send("zplc reset")
        self.send("zplc persist clear")
        time.sleep(0.5)

    def upload_bytecode(self, bytecode):
        self.send("zplc stop")
        self.send("zplc reset")

        # Retry load command
        resp = ""
        for attempt in range(3):
            while self.ser.in_waiting:
                self.ser.read()
            resp = self.send(f"zplc load {len(bytecode)}", wait_for="OK:", timeout=5.0)
            if "OK:" in resp:
                break
            print(f"WARN: zplc load retry {attempt + 1}")
            time.sleep(0.5)
        else:
            print(f"ERROR: zplc load failed. Resp: {resp}")
            return

        hex_data = binascii.hexlify(bytearray(bytecode)).decode()
        chunk_size = 32  # Safe size (32 hex chars = 16 bytes)

        for i in range(0, len(hex_data), chunk_size):
            chunk = hex_data[i : i + chunk_size]

            # Retry logic for chunks
            for attempt in range(3):
                # Clear input buffer to avoid stale data
                while self.ser.in_waiting:
                    self.ser.read(self.ser.in_waiting)

                resp = self.send(f"zplc data {chunk}", wait_for="OK:", timeout=5.0)
                if "OK:" in resp:
                    break
                print(f"WARN: Chunk {i} retry {attempt + 1}. Resp: {resp}")
                time.sleep(0.5)
            else:
                print(f"ERROR: zplc data chunk {i} failed after retries")
                return

            time.sleep(0.05)  # Small delay between chunks

        self.send("")

    def start_and_capture(self, duration=1.0):
        """Manda zplc start y captura los traces en modo verbose."""
        self.send("zplc hil mode verbose")
        self.ser.reset_input_buffer()
        self.ser.write(b"zplc start\r\n")

        traces = []
        start_time = time.time()
        buffer = ""

        while time.time() - start_time < duration:
            if self.ser.in_waiting > 0:
                char = self.ser.read().decode("utf-8", errors="ignore")
                buffer += char

                if "}" in buffer:
                    start_idx = buffer.find("{")
                    end_idx = buffer.find("}")

                    if start_idx != -1 and end_idx > start_idx:
                        json_str = buffer[start_idx : end_idx + 1]
                        try:
                            data = json.loads(json_str)
                            if data.get("t") in [
                                "opcode",
                                "error",
                                "task",
                                "fb",
                                "ack",
                            ]:
                                traces.append(data)
                        except json.JSONDecodeError:
                            pass
                        buffer = buffer[end_idx + 1 :]
            else:
                time.sleep(0.01)
        return traces

    def start_and_wait(self, duration=1.0):
        """Manda zplc start en modo off y espera."""
        self.send("zplc hil mode off")
        self.ser.reset_input_buffer()
        resp = self.send("zplc start")
        print(f"DEBUG: Start response: {resp.strip()}")
        time.sleep(duration)
        self.send("zplc stop")

    def peek(self, addr, length=1):
        resp = self.send(f"zplc dbg peek {hex(addr)} {length}")
        # print(f"DEBUG: Peek raw response:\n{resp}")

        # Extraer todos los valores hexadecimales de 2 dígitos que sigan a un ":"
        bytes_out = []
        for line in resp.splitlines():
            if ":" in line:
                data_part = line.split(":")[1]
                # Buscar patrones de 2 caracteres hex
                hex_matches = re.findall(r"([0-9A-Fa-f]{2})", data_part)
                for hv in hex_matches:
                    bytes_out.append(int(hv, 16))

        # print(f"DEBUG: Parsed bytes: {bytes_out}")
        return bytes_out[:length]

    def compile_st(self, st_file):
        base, ext = os.path.splitext(st_file)
        output_bin = base + ".zplc"

        root_dir = os.path.join(os.path.dirname(__file__), "../..")
        cli_path = os.path.join(root_dir, "packages/zplc-ide/src/cli/index.ts")

        # Resolve relative paths from repo root (handles tools/hil/, packages/, etc.)
        if not os.path.isabs(st_file):
            st_abs = os.path.abspath(os.path.join(root_dir, st_file))
            base_abs, _ = os.path.splitext(st_abs)
            output_bin = base_abs + ".zplc"
        else:
            st_abs = st_file

        bin_abs = (
            os.path.abspath(output_bin) if not os.path.isabs(output_bin) else output_bin
        )

        cmd = f"bun {cli_path} compile {st_abs} -o {bin_abs}"
        result = os.system(cmd)
        if result != 0:
            raise Exception(f"Compilation failed for {st_file}")

        with open(bin_abs, "rb") as f:
            return list(f.read())

    def run_st(self, st_file, reset=True, duration=2.0):
        bytecode = self.compile_st(st_file)
        if reset:
            self.reset_state()
        self.upload_bytecode(bytecode)
        return self.start_and_capture(duration=duration)

    def run_bytecode(self, bytecode, reset=True, duration=0.5):
        """
        Upload raw bytecode (list of bytes) and run, capturing traces.
        Returns list of trace dicts from verbose mode.
        """
        if reset:
            self.reset_state()
        self.upload_bytecode(bytecode)
        return self.start_and_capture(duration=duration)

    def get_last_tos(self, traces):
        """
        Extract the last TOS (top-of-stack) value from opcode traces.
        Returns None if no opcode traces found.
        """
        for trace in reversed(traces):
            if trace.get("t") == "opcode" and "tos" in trace:
                return trace["tos"]
        return None

    def get_last_sp(self, traces):
        """
        Extract the last SP (stack pointer) value from opcode traces.
        Returns None if no opcode traces found.
        """
        for trace in reversed(traces):
            if trace.get("t") == "opcode" and "sp" in trace:
                return trace["sp"]
        return None

