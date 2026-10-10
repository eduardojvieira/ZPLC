"""GENERATED FILE. Do not edit.

Source: tools/contract/contract.json. Regenerate: python3 tools/contract/generate.py

The ZPLC binary contract for the Python tools: opcodes, container constants,
memory regions, error codes and the communication function-block layouts.
`generate.py --check` fails when this file differs from a fresh generation.
"""
from enum import IntEnum

ZPLC_MAGIC = 0x434C505A
ZPLC_VERSION_MAJOR = 1
ZPLC_VERSION_MINOR = 0
ZPLC_DRAFT_COUNTER = 2
HEADER_SIZE = 32
SEGMENT_ENTRY_SIZE = 8
TASK_DEF_SIZE = 16
IOMAP_ENTRY_SIZE = 8
TAG_ENTRY_SIZE = 8
MAX_TASKS = 16
CRC_OFFSET = 12
CRC_SIZE = 4

# Header layout: struct format of the 32-byte file header and of a segment entry.
HEADER_STRUCT = "<IHHIIIIHHI"
SEGMENT_ENTRY_STRUCT = "<HHI"
TASK_DEF_STRUCT = "<HBBIHHI"
TAG_ENTRY_STRUCT = "<HBBI"

SEGMENT_TYPE = {
    "CODE": 0x01,
    "DATA": 0x02,
    "BSS": 0x03,
    "RETAIN": 0x04,
    "IOMAP": 0x05,
    "SYMTAB": 0x10,
    "DEBUG": 0x11,
    "TASK": 0x20,
    "TAGS": 0x30,
}

TASK_TYPE = {
    "CYCLIC": 0,
    "EVENT": 1,
    "INIT": 2,
}

IO_DIRECTION = {
    "INPUT": 0,
    "OUTPUT": 1,
}

TAG_ID = {
    "NONE": 0,
    "PUBLISH": 1,
    "MODBUS": 2,
    "SUBSCRIBE": 3,
}

FILE_FLAG = {
    "HAS_DEBUG": 0x01,
    "HAS_SYMBOLS": 0x02,
    "HAS_RETAIN": 0x04,
    "SIGNED": 0x08,
}

# Memory regions: base address and default size in bytes.
MEMORY_REGION = {
    "IPI": {"base": 0x0000, "size": 0x1000},
    "OPI": {"base": 0x1000, "size": 0x1000},
    "WORK": {"base": 0x2000, "size": 0x2000},
    "RETAIN": {"base": 0x4000, "size": 0x1000},
    "CODE": {"base": 0x5000, "size": 0xB000},
}

# System registers in the input image: address, type, size in bytes.
SYSTEM_REGISTER = {
    "CYCLE_TIME": {"address": 0x0FF0, "type": "DINT", "size": 4},
    "UPTIME": {"address": 0x0FF4, "type": "UDINT", "size": 4},
    "TASK_ID": {"address": 0x0FF8, "type": "BYTE", "size": 1},
    "FLAGS": {"address": 0x0FF9, "type": "BYTE", "size": 1},
}

# IEC 61131-3 data type identifiers (symbol table, I/O map, tags).
DATA_TYPE_ID = {
    "NONE": 0x00,
    "BOOL": 0x01,
    "SINT": 0x02,
    "INT": 0x04,
    "DINT": 0x06,
    "LINT": 0x08,
    "USINT": 0x03,
    "UINT": 0x05,
    "UDINT": 0x07,
    "ULINT": 0x09,
    "REAL": 0x0A,
    "LREAL": 0x0B,
    "TIME": 0x0C,
    "BYTE": 0x10,
    "WORD": 0x11,
    "DWORD": 0x12,
    "LWORD": 0x13,
    "STRING": 0x20,
}

# STRING layout: [length:2][capacity:2][data:capacity+1].
STRING_LEN_OFFSET = 0
STRING_CAP_OFFSET = 2
STRING_DATA_OFFSET = 4
STRING_DEFAULT_SIZE = 80
STRING_MAX_SIZE = 255


class Opcode(IntEnum):
    """ZPLC VM opcodes."""

    NOP = 0x00  # No operation
    HALT = 0x01  # Stop execution
    BREAK = 0x02  # Debugger breakpoint
    GET_TICKS = 0x03  # Push system tick (ms) to stack
    DUP = 0x10  # Duplicate top of stack
    DROP = 0x11  # Discard top of stack
    SWAP = 0x12  # Swap top two elements
    OVER = 0x13  # Copy second element to top
    ROT = 0x14  # Rotate top three elements
    LOADI8 = 0x15  # Load 8-bit from address on stack
    LOADI32 = 0x16  # Load 32-bit from address on stack
    STOREI8 = 0x17  # Store 8-bit to address on stack: [addr val] -> []
    STOREI32 = 0x18  # Store 32-bit to address on stack: [addr val] -> []
    LOADI16 = 0x19  # Load 16-bit from address on stack
    STOREI16 = 0x1A  # Store 16-bit to address on stack: [addr val] -> []
    STRLEN = 0x1B  # Get string length: [str_addr] -> [length]
    STRCPY = 0x1C  # Copy string: [src_addr dst_addr] -> [] (safe, bounds-checked)
    STRCAT = 0x1D  # Concatenate: [src_addr dst_addr] -> [] (safe, bounds-checked)
    STRCMP = 0x1E  # Compare strings: [addr1 addr2] -> [result] (-1, 0, 1)
    STRCLR = 0x1F  # Clear string: [str_addr] -> []
    ADD = 0x20  # Integer addition
    SUB = 0x21  # Integer subtraction
    MUL = 0x22  # Integer multiplication
    DIV = 0x23  # Integer division
    MOD = 0x24  # Integer modulo
    NEG = 0x25  # Integer negation
    ABS = 0x26  # Absolute value
    ADDF = 0x28  # Float addition
    SUBF = 0x29  # Float subtraction
    MULF = 0x2A  # Float multiplication
    DIVF = 0x2B  # Float division
    NEGF = 0x2C  # Float negation
    ABSF = 0x2D  # Float absolute value
    AND = 0x30  # Bitwise AND
    OR = 0x31  # Bitwise OR
    XOR = 0x32  # Bitwise XOR
    NOT = 0x33  # Bitwise NOT
    SHL = 0x34  # Shift left
    SHR = 0x35  # Shift right (logical)
    SAR = 0x36  # Shift right (arithmetic)
    EQ = 0x38  # Equal
    NE = 0x39  # Not equal
    LT = 0x3A  # Less than (signed)
    LE = 0x3B  # Less or equal (signed)
    GT = 0x3C  # Greater than (signed)
    GE = 0x3D  # Greater or equal (signed)
    LTU = 0x3E  # Less than (unsigned)
    GTU = 0x3F  # Greater than (unsigned)
    PUSH8 = 0x40  # Push 8-bit immediate (sign-extended)
    PICK = 0x41  # Copy nth stack element to top: PICK n copies stack[sp-1-n]
    JR = 0x50  # Relative jump (signed 8-bit offset)
    JRZ = 0x51  # Relative jump if zero
    JRNZ = 0x52  # Relative jump if not zero
    LOAD8 = 0x80  # Load 8-bit from address
    LOAD16 = 0x81  # Load 16-bit from address
    LOAD32 = 0x82  # Load 32-bit from address
    LOAD64 = 0x83  # Load 64-bit from address
    STORE8 = 0x84  # Store 8-bit to address
    STORE16 = 0x85  # Store 16-bit to address
    STORE32 = 0x86  # Store 32-bit to address
    STORE64 = 0x87  # Store 64-bit to address
    PUSH16 = 0x88  # Push 16-bit immediate (sign-extended)
    JMP = 0x90  # Unconditional jump
    JZ = 0x91  # Jump if zero (false)
    JNZ = 0x92  # Jump if not zero (true)
    CALL = 0x93  # Call subroutine
    RET = 0x94  # Return from subroutine
    I2F = 0xA0  # Integer to float
    F2I = 0xA1  # Float to integer
    I2B = 0xA2  # Integer to boolean
    EXT8 = 0xA3  # Sign-extend 8-bit to 32-bit
    EXT16 = 0xA4  # Sign-extend 16-bit to 32-bit
    ZEXT8 = 0xA5  # Zero-extend 8-bit to 32-bit
    ZEXT16 = 0xA6  # Zero-extend 16-bit to 32-bit
    PUSH32 = 0xC0  # Push 32-bit immediate
    COMM_EXEC = 0xD0  # Execute/update Comm FB; pop base addr from stack
    COMM_STATUS = 0xD1  # Push status word for a kind to stack
    COMM_RESET = 0xD2  # Reset FSM for Comm FB; pop base addr from stack


# Per opcode: operand bytes, stack words popped and pushed, minimum depth, flags.
OPCODE_INFO = {
    Opcode.NOP: {"operand": 0, "pops": 0, "pushes": 0, "min_depth": 0, "flags": (), "effect": "[] -> []"},
    Opcode.HALT: {"operand": 0, "pops": 0, "pushes": 0, "min_depth": 0, "flags": ('terminates',), "effect": "[] -> []"},
    Opcode.BREAK: {"operand": 0, "pops": 0, "pushes": 0, "min_depth": 0, "flags": (), "effect": "[] -> []"},
    Opcode.GET_TICKS: {"operand": 0, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [ticks]"},
    Opcode.DUP: {"operand": 0, "pops": 0, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [a a]"},
    Opcode.DROP: {"operand": 0, "pops": 1, "pushes": 0, "min_depth": 1, "flags": (), "effect": "[a] -> []"},
    Opcode.SWAP: {"operand": 0, "pops": 0, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[a b] -> [b a]"},
    Opcode.OVER: {"operand": 0, "pops": 0, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [a b a]"},
    Opcode.ROT: {"operand": 0, "pops": 0, "pushes": 0, "min_depth": 3, "flags": (), "effect": "[a b c] -> [b c a]"},
    Opcode.LOADI8: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[addr] -> [value]"},
    Opcode.LOADI32: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[addr] -> [value]"},
    Opcode.STOREI8: {"operand": 0, "pops": 2, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[addr value] -> []"},
    Opcode.STOREI32: {"operand": 0, "pops": 2, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[addr value] -> []"},
    Opcode.LOADI16: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[addr] -> [value]"},
    Opcode.STOREI16: {"operand": 0, "pops": 2, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[addr value] -> []"},
    Opcode.STRLEN: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[str] -> [len]"},
    Opcode.STRCPY: {"operand": 0, "pops": 2, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[src dst] -> []"},
    Opcode.STRCAT: {"operand": 0, "pops": 2, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[src dst] -> []"},
    Opcode.STRCMP: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [cmp]"},
    Opcode.STRCLR: {"operand": 0, "pops": 1, "pushes": 0, "min_depth": 1, "flags": (), "effect": "[str] -> []"},
    Opcode.ADD: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.SUB: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.MUL: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.DIV: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.MOD: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.NEG: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.ABS: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.ADDF: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.SUBF: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.MULF: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.DIVF: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.NEGF: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.ABSF: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.AND: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.OR: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.XOR: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.NOT: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.SHL: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.SHR: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.SAR: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [r]"},
    Opcode.EQ: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.NE: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.LT: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.LE: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.GT: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.GE: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.LTU: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.GTU: {"operand": 0, "pops": 2, "pushes": 1, "min_depth": 2, "flags": (), "effect": "[a b] -> [flag]"},
    Opcode.PUSH8: {"operand": 1, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [imm]"},
    Opcode.PICK: {"operand": 1, "pops": 0, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[x_n .. x_0] -> [x_n .. x_0 x_n]"},
    Opcode.JR: {"operand": 1, "pops": 0, "pushes": 0, "min_depth": 0, "flags": ('relative', 'terminates'), "effect": "[] -> []"},
    Opcode.JRZ: {"operand": 1, "pops": 1, "pushes": 0, "min_depth": 1, "flags": ('relative',), "effect": "[cond] -> []"},
    Opcode.JRNZ: {"operand": 1, "pops": 1, "pushes": 0, "min_depth": 1, "flags": ('relative',), "effect": "[cond] -> []"},
    Opcode.LOAD8: {"operand": 2, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [value]"},
    Opcode.LOAD16: {"operand": 2, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [value]"},
    Opcode.LOAD32: {"operand": 2, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [value]"},
    Opcode.LOAD64: {"operand": 2, "pops": 0, "pushes": 2, "min_depth": 0, "flags": (), "effect": "[] -> [low high]"},
    Opcode.STORE8: {"operand": 2, "pops": 1, "pushes": 0, "min_depth": 1, "flags": (), "effect": "[value] -> []"},
    Opcode.STORE16: {"operand": 2, "pops": 1, "pushes": 0, "min_depth": 1, "flags": (), "effect": "[value] -> []"},
    Opcode.STORE32: {"operand": 2, "pops": 1, "pushes": 0, "min_depth": 1, "flags": (), "effect": "[value] -> []"},
    Opcode.STORE64: {"operand": 2, "pops": 2, "pushes": 0, "min_depth": 2, "flags": (), "effect": "[low high] -> []"},
    Opcode.PUSH16: {"operand": 2, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [imm]"},
    Opcode.JMP: {"operand": 2, "pops": 0, "pushes": 0, "min_depth": 0, "flags": ('absolute', 'terminates'), "effect": "[] -> []"},
    Opcode.JZ: {"operand": 2, "pops": 1, "pushes": 0, "min_depth": 1, "flags": ('absolute',), "effect": "[cond] -> []"},
    Opcode.JNZ: {"operand": 2, "pops": 1, "pushes": 0, "min_depth": 1, "flags": ('absolute',), "effect": "[cond] -> []"},
    Opcode.CALL: {"operand": 2, "pops": 0, "pushes": 0, "min_depth": 0, "flags": ('absolute', 'call'), "effect": "[] -> []"},
    Opcode.RET: {"operand": 0, "pops": 0, "pushes": 0, "min_depth": 0, "flags": ('terminates',), "effect": "[] -> []"},
    Opcode.I2F: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.F2I: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.I2B: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.EXT8: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.EXT16: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.ZEXT8: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.ZEXT16: {"operand": 0, "pops": 1, "pushes": 1, "min_depth": 1, "flags": (), "effect": "[a] -> [r]"},
    Opcode.PUSH32: {"operand": 4, "pops": 0, "pushes": 1, "min_depth": 0, "flags": (), "effect": "[] -> [imm]"},
    Opcode.COMM_EXEC: {"operand": 4, "pops": 1, "pushes": 0, "min_depth": 1, "flags": ('comm',), "effect": "[base] -> []"},
    Opcode.COMM_STATUS: {"operand": 4, "pops": 1, "pushes": 1, "min_depth": 1, "flags": ('comm',), "effect": "[base] -> [status]"},
    Opcode.COMM_RESET: {"operand": 4, "pops": 1, "pushes": 0, "min_depth": 1, "flags": ('comm',), "effect": "[base] -> []"},
}


def get_operand_size(opcode: int) -> int:
    """Operand size in bytes for an opcode value (the C zplc_opcode_operand_size)."""
    if opcode == 0x94:  # RET
        return 0
    if 0xA0 <= opcode <= 0xA6:  # I2F..ZEXT16
        return 0
    if opcode <= 0x3F:
        return 0
    if opcode <= 0x7F:
        return 1
    if opcode <= 0xBF:
        return 2
    return 4


class VmError(IntEnum):
    """zplc_vm_error_t: faults and run states of the VM."""

    OK = 0
    STACK_OVERFLOW = 1
    STACK_UNDERFLOW = 2
    DIV_BY_ZERO = 3
    INVALID_OPCODE = 4
    OUT_OF_BOUNDS = 5
    CALL_OVERFLOW = 6
    INVALID_JUMP = 7
    WATCHDOG = 8
    HALTED = 9
    PAUSED = 10


class LoaderError(IntEnum):
    """Loader verification result codes (zero is success)."""

    OK = 0
    ERR_MAGIC = -1
    ERR_VERSION = -2
    ERR_SIZE = -3
    ERR_NO_CODE = -4
    ERR_CRC32 = -6
    ERR_FLAGS = -7
    ERR_SEGMENT = -8
    ERR_ENTRY_POINT = -9
    ERR_WORKSPACE = -10
    ERR_OPCODE = -11
    ERR_CONTROL_FLOW = -12
    ERR_MEMORY = -13
    ERR_TASK = -14
    ERR_TAGS = -15
    ERR_COMM = -16
    ERR_DRAFT = -17
    ERR_STACK = -18


class CommKind(IntEnum):
    """Communication function-block kind identifiers (zplc_comm_fb_kind_t)."""

    NONE = 0
    MB_READ_HREG = 1
    MB_WRITE_HREG = 2
    MB_READ_COIL = 3
    MB_WRITE_COIL = 4
    MQTT_CONNECT = 10
    MQTT_PUBLISH = 11
    MQTT_SUBSCRIBE = 12
    COMM_STATUS = 20
    AZURE_C2D_RECV = 32
    AZURE_DPS_PROV = 33
    AZURE_EG_PUB = 34
    AWS_FLEET_PROV = 48
    SPB_REBIRTH = 64


class CommStatus(IntEnum):
    """Communication status codes written to FB.STATUS."""

    OK = 0
    BUSY = 1
    TIMEOUT = 2
    NO_HANDLER = 3
    NOT_CONNECTED = 4
    QUEUE_FULL = 5
    INVALID_ADDR = 6
    STRING_OVERFLOW = 7
    PROTO_ERROR = 8
    AUTH_FAILED = 9
    UNKNOWN = 255


COMM_KIND_MAX = 0x00FF

# Function-block layouts: kind, instance size and member offsets.
COMM_BLOCKS = {
    "MB_READ_HREG": {
        "kind": 0x0001,
        "size": 110,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "PROTO", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "SLAVE_ID", "type": "UINT", "offset": 9, "size": 2, "direction": "in"},
            {"name": "ADDR", "type": "UINT", "offset": 11, "size": 2, "direction": "in"},
            {"name": "COUNT", "type": "UINT", "offset": 13, "size": 2, "direction": "in"},
            {"name": "VALUE", "type": "UINT", "offset": 15, "size": 2, "direction": "out"},
            {"name": "HOST", "type": "STRING", "offset": 18, "size": 85, "direction": "in"},
            {"name": "PORT", "type": "UINT", "offset": 103, "size": 2, "direction": "in"},
        ],
    },
    "MB_WRITE_HREG": {
        "kind": 0x0002,
        "size": 110,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "PROTO", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "SLAVE_ID", "type": "UINT", "offset": 9, "size": 2, "direction": "in"},
            {"name": "ADDR", "type": "UINT", "offset": 11, "size": 2, "direction": "in"},
            {"name": "COUNT", "type": "UINT", "offset": 13, "size": 2, "direction": "in"},
            {"name": "VALUE", "type": "UINT", "offset": 15, "size": 2, "direction": "in"},
            {"name": "HOST", "type": "STRING", "offset": 18, "size": 85, "direction": "in"},
            {"name": "PORT", "type": "UINT", "offset": 103, "size": 2, "direction": "in"},
        ],
    },
    "MB_READ_COIL": {
        "kind": 0x0003,
        "size": 110,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "PROTO", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "SLAVE_ID", "type": "UINT", "offset": 9, "size": 2, "direction": "in"},
            {"name": "ADDR", "type": "UINT", "offset": 11, "size": 2, "direction": "in"},
            {"name": "COUNT", "type": "UINT", "offset": 13, "size": 2, "direction": "in"},
            {"name": "VALUE", "type": "BOOL", "offset": 15, "size": 1, "direction": "out"},
            {"name": "HOST", "type": "STRING", "offset": 18, "size": 85, "direction": "in"},
            {"name": "PORT", "type": "UINT", "offset": 103, "size": 2, "direction": "in"},
        ],
    },
    "MB_WRITE_COIL": {
        "kind": 0x0004,
        "size": 110,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "PROTO", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "SLAVE_ID", "type": "UINT", "offset": 9, "size": 2, "direction": "in"},
            {"name": "ADDR", "type": "UINT", "offset": 11, "size": 2, "direction": "in"},
            {"name": "COUNT", "type": "UINT", "offset": 13, "size": 2, "direction": "in"},
            {"name": "VALUE", "type": "BOOL", "offset": 15, "size": 1, "direction": "in"},
            {"name": "HOST", "type": "STRING", "offset": 18, "size": 85, "direction": "in"},
            {"name": "PORT", "type": "UINT", "offset": 103, "size": 2, "direction": "in"},
        ],
    },
    "MQTT_CONNECT": {
        "kind": 0x000A,
        "size": 12,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "PROFILE", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "CONNECTED", "type": "BOOL", "offset": 9, "size": 1, "direction": "out"},
        ],
    },
    "MQTT_PUBLISH": {
        "kind": 0x000B,
        "size": 190,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "QOS", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "RETAIN", "type": "BOOL", "offset": 9, "size": 1, "direction": "in"},
            {"name": "TOPIC", "type": "STRING", "offset": 12, "size": 85, "direction": "in"},
            {"name": "PAYLOAD", "type": "STRING", "offset": 97, "size": 85, "direction": "in"},
        ],
    },
    "MQTT_SUBSCRIBE": {
        "kind": 0x000C,
        "size": 190,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "QOS", "type": "USINT", "offset": 8, "size": 1, "direction": "in"},
            {"name": "VALID", "type": "BOOL", "offset": 9, "size": 1, "direction": "out"},
            {"name": "TOPIC", "type": "STRING", "offset": 12, "size": 85, "direction": "in"},
            {"name": "PAYLOAD", "type": "STRING", "offset": 97, "size": 85, "direction": "out"},
        ],
    },
    "AZURE_C2D_RECV": {
        "kind": 0x0020,
        "size": 94,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "PAYLOAD", "type": "STRING", "offset": 8, "size": 85, "direction": "out"},
            {"name": "VALID", "type": "BOOL", "offset": 93, "size": 1, "direction": "out"},
        ],
    },
    "AZURE_DPS_PROV": {
        "kind": 0x0021,
        "size": 201,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "DEVICE_ID", "type": "STRING", "offset": 8, "size": 85, "direction": "in"},
            {"name": "ASSIGNED_HUB", "type": "STRING", "offset": 73, "size": 85, "direction": "out"},
        ],
    },
    "AZURE_EG_PUB": {
        "kind": 0x0022,
        "size": 266,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "TOPIC", "type": "STRING", "offset": 8, "size": 85, "direction": "in"},
            {"name": "EVENT_TYPE", "type": "STRING", "offset": 73, "size": 85, "direction": "in"},
            {"name": "PAYLOAD", "type": "STRING", "offset": 138, "size": 85, "direction": "in"},
        ],
    },
    "AWS_FLEET_PROV": {
        "kind": 0x0030,
        "size": 137,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
            {"name": "TEMPLATE_NAME", "type": "STRING", "offset": 8, "size": 85, "direction": "in"},
            {"name": "THING_NAME", "type": "STRING", "offset": 73, "size": 85, "direction": "out"},
        ],
    },
    "SPB_REBIRTH": {
        "kind": 0x0040,
        "size": 8,
        "members": [
            {"name": "EN", "type": "BOOL", "offset": 0, "size": 1, "direction": "in"},
            {"name": "BUSY", "type": "BOOL", "offset": 1, "size": 1, "direction": "out"},
            {"name": "DONE", "type": "BOOL", "offset": 2, "size": 1, "direction": "out"},
            {"name": "ERROR", "type": "BOOL", "offset": 3, "size": 1, "direction": "out"},
            {"name": "STATUS", "type": "DINT", "offset": 4, "size": 4, "direction": "out"},
        ],
    },
}
