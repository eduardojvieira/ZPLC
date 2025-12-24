#!/usr/bin/env python3
"""
ZPLC Assembler - Converts text assembly to .zplc bytecode.

SPDX-License-Identifier: MIT

This tool translates human-readable assembly into ZPLC VM bytecode.
It's designed for development, testing, and educational purposes.

Usage:
    python zplc_asm.py input.asm -o output.zplc
    python zplc_asm.py input.asm --raw -o output.bin  # Raw bytecode, no header
    python zplc_asm.py --help

Example assembly:
    ; Simple addition: C = A + B
    LOAD16 0x0000    ; Load A from IPI
    LOAD16 0x0002    ; Load B from IPI  
    ADD              ; A + B
    STORE16 0x1000   ; Store to OPI
    HALT

Author: ZPLC Project
"""

import argparse
import struct
import sys
import re
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Optional


# =============================================================================
# Constants from zplc_isa.h
# =============================================================================

ZPLC_MAGIC = 0x434C505A  # "ZPLC" in little-endian
ZPLC_VERSION_MAJOR = 1
ZPLC_VERSION_MINOR = 0


class Opcode(IntEnum):
    """ZPLC VM opcodes - must match zplc_isa.h exactly."""
    
    # System Operations (0x00-0x0F) - no operand
    NOP = 0x00
    HALT = 0x01
    BREAK = 0x02
    GET_TICKS = 0x03
    
    # Stack Operations (0x10-0x1F) - no operand
    DUP = 0x10
    DROP = 0x11
    SWAP = 0x12
    OVER = 0x13
    ROT = 0x14
    
    # Integer Arithmetic (0x20-0x27) - no operand
    ADD = 0x20
    SUB = 0x21
    MUL = 0x22
    DIV = 0x23
    MOD = 0x24
    NEG = 0x25
    ABS = 0x26
    
    # Float Arithmetic (0x28-0x2F) - no operand
    ADDF = 0x28
    SUBF = 0x29
    MULF = 0x2A
    DIVF = 0x2B
    NEGF = 0x2C
    ABSF = 0x2D
    
    # Logical/Bitwise (0x30-0x37) - no operand
    AND = 0x30
    OR = 0x31
    XOR = 0x32
    NOT = 0x33
    SHL = 0x34
    SHR = 0x35
    SAR = 0x36
    
    # Comparison (0x38-0x3F) - no operand
    EQ = 0x38
    NE = 0x39
    LT = 0x3A
    LE = 0x3B
    GT = 0x3C
    GE = 0x3D
    LTU = 0x3E
    GTU = 0x3F
    
    # 8-bit operand (0x40-0x7F)
    PUSH8 = 0x40
    JR = 0x50
    JRZ = 0x51
    JRNZ = 0x52
    
    # 16-bit operand (0x80-0xBF)
    LOAD8 = 0x80
    LOAD16 = 0x81
    LOAD32 = 0x82
    LOAD64 = 0x83
    STORE8 = 0x84
    STORE16 = 0x85
    STORE32 = 0x86
    STORE64 = 0x87
    PUSH16 = 0x88
    JMP = 0x90
    JZ = 0x91
    JNZ = 0x92
    CALL = 0x93
    RET = 0x94
    
    # Type Conversion (0xA0-0xAF) - no operand
    I2F = 0xA0
    F2I = 0xA1
    I2B = 0xA2
    EXT8 = 0xA3
    EXT16 = 0xA4
    ZEXT8 = 0xA5
    ZEXT16 = 0xA6
    
    # 32-bit operand (0xC0-0xFF)
    PUSH32 = 0xC0


def get_operand_size(opcode: int) -> int:
    """
    Get operand size in bytes for an opcode.
    
    Most opcodes follow the range-based encoding:
        0x00-0x3F: 0 bytes (no operand)
        0x40-0x7F: 1 byte (8-bit operand)
        0x80-0xBF: 2 bytes (16-bit operand)
        0xC0-0xFF: 4 bytes (32-bit operand)
    
    Exceptions:
        RET (0x94): No operand despite being in 0x80-0xBF range
        Type conversion (0xA0-0xA6): No operand
    """
    # Special cases - no operand despite opcode range
    if opcode == 0x94:  # RET
        return 0
    if 0xA0 <= opcode <= 0xA6:  # Type conversions
        return 0
    
    # Standard range-based encoding
    if opcode < 0x40:
        return 0
    elif opcode < 0x80:
        return 1
    elif opcode < 0xC0:
        return 2
    else:
        return 4


# Build lookup tables
OPCODE_BY_NAME = {op.name: op for op in Opcode}
OPERAND_SIZE = {op: get_operand_size(op.value) for op in Opcode}


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class Token:
    """A parsed token from the source."""
    type: str       # 'label', 'instruction', 'operand', 'directive'
    value: str
    line_num: int
    raw_line: str


@dataclass
class Instruction:
    """A parsed instruction."""
    opcode: Opcode
    operand: Optional[int]
    operand_label: Optional[str]  # For unresolved label references
    line_num: int
    address: int  # Byte offset in code segment


@dataclass
class Label:
    """A label definition."""
    name: str
    address: int
    line_num: int


class AssemblerError(Exception):
    """Error during assembly."""
    def __init__(self, message: str, line_num: int = 0, line: str = ""):
        self.line_num = line_num
        self.line = line
        super().__init__(f"Line {line_num}: {message}\n  -> {line}")


# =============================================================================
# Assembler
# =============================================================================

class ZPLCAssembler:
    """
    Two-pass assembler for ZPLC bytecode.
    
    Pass 1: Parse instructions, collect labels, calculate addresses
    Pass 2: Resolve label references, emit bytecode
    """
    
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.instructions: list[Instruction] = []
        self.labels: dict[str, Label] = {}
        self.entry_point = 0
        self.current_address = 0
    
    def log(self, msg: str):
        """Print verbose output."""
        if self.verbose:
            print(f"[ASM] {msg}")
    
    def parse_number(self, s: str) -> int:
        """
        Parse a number from string.
        
        Supports:
            - Decimal: 123, -45
            - Hexadecimal: 0x1234, 0X5678
            - Binary: 0b1010
            - Character: 'A'
        """
        s = s.strip()
        
        if not s:
            raise ValueError("Empty number")
        
        # Character literal
        if s.startswith("'") and s.endswith("'") and len(s) >= 3:
            if s[1] == '\\':
                # Escape sequences
                escapes = {'n': 10, 'r': 13, 't': 9, '\\': 92, "'": 39, '0': 0}
                if len(s) >= 4 and s[2] in escapes:
                    return escapes[s[2]]
            return ord(s[1])
        
        # Handle negative
        negative = False
        if s[0] == '-':
            negative = True
            s = s[1:]
        elif s[0] == '+':
            s = s[1:]
        
        # Parse base
        if s.lower().startswith('0x'):
            value = int(s, 16)
        elif s.lower().startswith('0b'):
            value = int(s, 2)
        elif s.lower().startswith('0o'):
            value = int(s, 8)
        else:
            value = int(s)
        
        return -value if negative else value
    
    def parse_operand(self, operand_str: str, line_num: int, opcode: Opcode) -> tuple[Optional[int], Optional[str]]:
        """
        Parse an operand, returning (value, label_ref).
        
        If the operand is a label reference, value is None and label_ref is set.
        """
        operand_str = operand_str.strip()
        
        if not operand_str:
            return None, None
        
        # Check if it's a label reference
        if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', operand_str):
            # It's a label - will be resolved in pass 2
            return None, operand_str
        
        # Parse as number
        try:
            value = self.parse_number(operand_str)
            return value, None
        except ValueError as e:
            raise AssemblerError(f"Invalid operand '{operand_str}': {e}", line_num, "")
    
    def parse_line(self, line: str, line_num: int):
        """
        Parse a single line of assembly.
        
        Syntax:
            [label:] [instruction [operand]] [; comment]
        """
        # Remove comments
        if ';' in line:
            line = line[:line.index(';')]
        
        line = line.strip()
        if not line:
            return
        
        # Check for label
        label_match = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*:', line)
        if label_match:
            label_name = label_match.group(1).upper()
            if label_name in self.labels:
                raise AssemblerError(f"Duplicate label '{label_name}'", line_num, line)
            self.labels[label_name] = Label(label_name, self.current_address, line_num)
            self.log(f"Label '{label_name}' at 0x{self.current_address:04X}")
            line = line[label_match.end():].strip()
            if not line:
                return
        
        # Parse instruction
        parts = line.split(None, 1)
        mnemonic = parts[0].upper()
        operand_str = parts[1] if len(parts) > 1 else ""
        
        # Handle directives
        if mnemonic.startswith('.'):
            self.handle_directive(mnemonic, operand_str, line_num)
            return
        
        # Look up opcode
        if mnemonic not in OPCODE_BY_NAME:
            raise AssemblerError(f"Unknown instruction '{mnemonic}'", line_num, line)
        
        opcode = OPCODE_BY_NAME[mnemonic]
        operand_size = OPERAND_SIZE[opcode]
        
        # Parse operand
        if operand_size > 0:
            if not operand_str:
                raise AssemblerError(f"Instruction '{mnemonic}' requires an operand", line_num, line)
            operand_val, operand_label = self.parse_operand(operand_str, line_num, opcode)
        else:
            if operand_str:
                raise AssemblerError(f"Instruction '{mnemonic}' takes no operand", line_num, line)
            operand_val, operand_label = None, None
        
        # Create instruction
        instr = Instruction(
            opcode=opcode,
            operand=operand_val,
            operand_label=operand_label,
            line_num=line_num,
            address=self.current_address
        )
        self.instructions.append(instr)
        
        # Advance address
        instr_size = 1 + operand_size
        self.log(f"0x{self.current_address:04X}: {mnemonic} {operand_str} ({instr_size} bytes)")
        self.current_address += instr_size
    
    def handle_directive(self, directive: str, operand: str, line_num: int):
        """Handle assembler directives."""
        if directive == '.ORG':
            # Set origin address
            try:
                self.current_address = self.parse_number(operand)
                self.log(f"Origin set to 0x{self.current_address:04X}")
            except ValueError:
                raise AssemblerError(f"Invalid address for .ORG: {operand}", line_num, "")
        
        elif directive == '.ENTRY':
            # Set entry point
            operand = operand.strip()
            if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', operand):
                # It's a label - will be resolved later
                self.entry_point = operand.upper()
            else:
                try:
                    self.entry_point = self.parse_number(operand)
                except ValueError:
                    raise AssemblerError(f"Invalid entry point: {operand}", line_num, "")
        
        elif directive == '.DB' or directive == '.BYTE':
            # Define byte(s)
            for val_str in operand.split(','):
                val = self.parse_number(val_str.strip())
                # Store as raw byte - we'll handle this in pass 2
                # For now, just advance address
                self.current_address += 1
        
        else:
            raise AssemblerError(f"Unknown directive '{directive}'", line_num, "")
    
    def resolve_labels(self):
        """Pass 2: Resolve label references."""
        for instr in self.instructions:
            if instr.operand_label:
                label_name = instr.operand_label.upper()
                if label_name not in self.labels:
                    raise AssemblerError(
                        f"Undefined label '{label_name}'",
                        instr.line_num,
                        ""
                    )
                label = self.labels[label_name]
                
                # For relative jumps (JR, JRZ, JRNZ), calculate offset
                if instr.opcode in (Opcode.JR, Opcode.JRZ, Opcode.JRNZ):
                    # Offset is from PC after instruction (PC + 2)
                    offset = label.address - (instr.address + 2)
                    if offset < -128 or offset > 127:
                        raise AssemblerError(
                            f"Relative jump to '{label_name}' out of range ({offset})",
                            instr.line_num,
                            ""
                        )
                    instr.operand = offset & 0xFF  # Signed to unsigned
                else:
                    # Absolute address
                    instr.operand = label.address
                
                self.log(f"Resolved '{label_name}' -> 0x{instr.operand:04X}")
        
        # Resolve entry point if it's a label
        if isinstance(self.entry_point, str):
            if self.entry_point not in self.labels:
                raise AssemblerError(f"Undefined entry point label '{self.entry_point}'", 0, "")
            self.entry_point = self.labels[self.entry_point].address
    
    def emit_bytecode(self) -> bytes:
        """Generate bytecode from parsed instructions."""
        output = bytearray()
        
        for instr in self.instructions:
            # Emit opcode
            output.append(instr.opcode.value)
            
            # Emit operand
            operand_size = OPERAND_SIZE[instr.opcode]
            operand = instr.operand if instr.operand is not None else 0
            
            if operand_size == 1:
                # 8-bit operand (could be signed)
                output.append(operand & 0xFF)
            elif operand_size == 2:
                # 16-bit little-endian
                output.extend(struct.pack('<H', operand & 0xFFFF))
            elif operand_size == 4:
                # 32-bit little-endian
                output.extend(struct.pack('<I', operand & 0xFFFFFFFF))
        
        return bytes(output)
    
    def create_zplc_file(self, bytecode: bytes) -> bytes:
        """
        Create a complete .zplc file with header.
        
        File format:
            - Header: 32 bytes
            - Segment table: 8 bytes per segment
            - Code segment
        """
        code_size = len(bytecode)
        segment_count = 1  # Just code for now
        
        # Header (32 bytes)
        # Layout from zplc_isa.h:
        #   magic         (4 bytes, uint32_t)
        #   version_major (2 bytes, uint16_t)
        #   version_minor (2 bytes, uint16_t)
        #   flags         (4 bytes, uint32_t)
        #   crc32         (4 bytes, uint32_t)
        #   code_size     (4 bytes, uint32_t)
        #   data_size     (4 bytes, uint32_t)
        #   entry_point   (2 bytes, uint16_t)
        #   segment_count (2 bytes, uint16_t)
        #   reserved      (4 bytes, uint32_t)
        # Total: 4+2+2+4+4+4+4+2+2+4 = 32 bytes
        # TODO: Calculate proper CRC32
        header = struct.pack(
            '<IHHIIIIHHI',
            ZPLC_MAGIC,           # magic (4)
            ZPLC_VERSION_MAJOR,   # version_major (2)
            ZPLC_VERSION_MINOR,   # version_minor (2)
            0,                    # flags (4)
            0,                    # crc32 (4) - TODO
            code_size,            # code_size (4)
            0,                    # data_size (4)
            self.entry_point if isinstance(self.entry_point, int) else 0,  # entry_point (2)
            segment_count,        # segment_count (2)
            0                     # reserved (4)
        )
        
        assert len(header) == 32, f"Header size mismatch: {len(header)}"
        
        # Segment table entry for code (8 bytes)
        # type=0x01 (CODE), flags=0, size=code_size
        segment_entry = struct.pack('<HHI', 0x01, 0, code_size)
        
        assert len(segment_entry) == 8, f"Segment entry size mismatch: {len(segment_entry)}"
        
        return header + segment_entry + bytecode
    
    def assemble(self, source: str) -> bytes:
        """
        Assemble source code to bytecode.
        
        Returns raw bytecode (no header).
        """
        self.instructions = []
        self.labels = {}
        self.current_address = 0
        self.entry_point = 0
        
        # Pass 1: Parse
        self.log("=== Pass 1: Parse ===")
        for line_num, line in enumerate(source.splitlines(), 1):
            try:
                self.parse_line(line, line_num)
            except AssemblerError:
                raise
            except Exception as e:
                raise AssemblerError(str(e), line_num, line)
        
        # Pass 2: Resolve labels
        self.log("=== Pass 2: Resolve ===")
        self.resolve_labels()
        
        # Emit bytecode
        self.log("=== Emit bytecode ===")
        bytecode = self.emit_bytecode()
        
        self.log(f"Generated {len(bytecode)} bytes of code")
        return bytecode
    
    def assemble_file(self, input_path: Path, output_path: Path, raw: bool = False):
        """Assemble a file and write output."""
        source = input_path.read_text()
        
        bytecode = self.assemble(source)
        
        if raw:
            output_path.write_bytes(bytecode)
            self.log(f"Wrote {len(bytecode)} bytes to {output_path}")
        else:
            zplc_data = self.create_zplc_file(bytecode)
            output_path.write_bytes(zplc_data)
            self.log(f"Wrote {len(zplc_data)} bytes to {output_path} (32 header + 8 segment + {len(bytecode)} code)")


# =============================================================================
# Disassembler (for debugging)
# =============================================================================

def disassemble(bytecode: bytes, base_addr: int = 0) -> str:
    """Disassemble bytecode to readable text."""
    lines = []
    pc = 0
    
    # Build reverse lookup
    opcode_names = {op.value: op.name for op in Opcode}
    
    while pc < len(bytecode):
        addr = base_addr + pc
        opcode = bytecode[pc]
        
        if opcode not in opcode_names:
            lines.append(f"0x{addr:04X}: ??? (0x{opcode:02X})")
            pc += 1
            continue
        
        name = opcode_names[opcode]
        operand_size = get_operand_size(opcode)
        instr_size = 1 + operand_size
        
        if pc + operand_size >= len(bytecode):
            lines.append(f"0x{addr:04X}: {name} <truncated>")
            break
        
        if operand_size == 0:
            lines.append(f"0x{addr:04X}: {name}")
        elif operand_size == 1:
            operand = bytecode[pc + 1]
            # Show signed for relative jumps
            if opcode in (Opcode.JR, Opcode.JRZ, Opcode.JRNZ):
                signed_op = operand if operand < 128 else operand - 256
                target = addr + 2 + signed_op
                lines.append(f"0x{addr:04X}: {name} {signed_op} (-> 0x{target:04X})")
            else:
                lines.append(f"0x{addr:04X}: {name} {operand} (0x{operand:02X})")
        elif operand_size == 2:
            operand = struct.unpack_from('<H', bytecode, pc + 1)[0]
            lines.append(f"0x{addr:04X}: {name} 0x{operand:04X}")
        else:  # 4 bytes
            operand = struct.unpack_from('<I', bytecode, pc + 1)[0]
            lines.append(f"0x{addr:04X}: {name} 0x{operand:08X}")
        
        pc += instr_size
    
    return '\n'.join(lines)


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='ZPLC Assembler - Convert text assembly to bytecode',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s input.asm -o output.zplc
    %(prog)s input.asm --raw -o output.bin
    %(prog)s input.asm --disasm

Assembly Syntax:
    ; This is a comment
    label:              ; Label definition
        PUSH8 10        ; Push 8-bit immediate
        PUSH8 20
        ADD             ; Add top two values
        STORE16 0x1000  ; Store to OPI
        HALT            ; Stop execution
    
    loop:
        NOP
        JR loop         ; Relative jump to label
"""
    )
    
    parser.add_argument('input', type=Path, help='Input assembly file')
    parser.add_argument('-o', '--output', type=Path, help='Output file (default: input with .zplc extension)')
    parser.add_argument('--raw', action='store_true', help='Output raw bytecode without .zplc header')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    parser.add_argument('--disasm', action='store_true', help='Disassemble output and print')
    parser.add_argument('--hex', action='store_true', help='Print bytecode as hex dump')
    
    args = parser.parse_args()
    
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    # Default output path
    if args.output is None:
        suffix = '.bin' if args.raw else '.zplc'
        args.output = args.input.with_suffix(suffix)
    
    # Assemble
    asm = ZPLCAssembler(verbose=args.verbose)
    
    try:
        asm.assemble_file(args.input, args.output, raw=args.raw)
        print(f"Assembled: {args.input} -> {args.output}")
        
        # Optional: show disassembly
        if args.disasm:
            bytecode = asm.emit_bytecode()
            print("\nDisassembly:")
            print(disassemble(bytecode))
        
        # Optional: hex dump
        if args.hex:
            bytecode = asm.emit_bytecode()
            print("\nHex dump:")
            for i in range(0, len(bytecode), 16):
                chunk = bytecode[i:i+16]
                hex_str = ' '.join(f'{b:02X}' for b in chunk)
                print(f"0x{i:04X}: {hex_str}")
        
    except AssemblerError as e:
        print(f"Assembly error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
