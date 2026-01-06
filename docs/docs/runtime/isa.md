# ZPLC Virtual Machine - Instruction Set Architecture (ISA)

**Version:** 1.2.0 (Stable)
**Status:** Released
**Last Updated:** December 2025

---

## 1. Overview

The ZPLC Virtual Machine is a **stack-based bytecode interpreter** designed for deterministic execution of IEC 61131-3 programs. It prioritizes:

1. **Portability:** Runs on 8-bit MCUs to 64-bit servers
2. **Determinism:** Predictable execution time for real-time guarantees
3. **Simplicity:** Easy to implement, debug, and verify
4. **Compactness:** Minimal bytecode size for constrained devices

### 1.1 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Stack-based | Simpler codegen than register-based; no register allocation needed |
| Fixed-width opcodes | 1-byte opcode + optional operand; predictable decode |
| Little-endian | Matches ARM, x86, ESP32 - our primary targets |
| 32-bit aligned data | Performance on modern CPUs; simplifies memory access |

---

## 2. Memory Model

The VM operates on four distinct memory regions. The core **never** accesses hardware directly - all I/O goes through the HAL which updates the Process Images.

```
┌─────────────────────────────────────────────────────────────┐
│                    ZPLC Memory Layout                       │
├─────────────────────────────────────────────────────────────┤
│  0x0000 ┌──────────────────────┐                            │
│         │  Input Process Image │ ◄── HAL writes, VM reads   │
│         │        (IPI)         │     Updated at cycle start │
│  0x0FFF └──────────────────────┘                            │
│  0x1000 ┌──────────────────────┐                            │
│         │ Output Process Image │ ◄── VM writes, HAL reads   │
│         │        (OPI)         │     Flushed at cycle end   │
│  0x1FFF └──────────────────────┘                            │
│  0x2000 ┌──────────────────────┐                            │
│         │    Work Memory       │ ◄── Temporaries, locals    │
│         │   (Stack + Heap)     │     Cleared each cycle     │
│  0x3FFF └──────────────────────┘                            │
│  0x4000 ┌──────────────────────┐                            │
│         │  Retentive Memory    │ ◄── Survives power cycle   │
│         │      (RETAIN)        │     Backed by HAL persist  │
│  0x4FFF └──────────────────────┘                            │
│  0x5000 ┌──────────────────────┐                            │
│         │    Code Segment      │ ◄── Bytecode (read-only)   │
│         │                      │                            │
│         └──────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Memory Regions

| Region | Base Address | Size | Access | Description |
|--------|--------------|------|--------|-------------|
| IPI    | `0x0000`     | 4 KB | Read   | Input Process Image - mirrors physical inputs |
| OPI    | `0x1000`     | 4 KB | Write  | Output Process Image - mirrors physical outputs |
| WORK   | `0x2000`     | 8 KB | R/W    | Stack and heap for temporaries |
| RETAIN | `0x4000`     | 4 KB | R/W    | Retentive variables (battery-backed) |
| CODE   | `0x5000`     | 44 KB| Read   | Program bytecode |

**Note:** These are logical addresses within the VM. Actual memory allocation is implementation-defined.

### 2.2 The Evaluation Stack

The VM uses an evaluation stack for all operations. The stack:

- Grows upward from `WORK` base address
- Maximum depth: 256 entries (configurable)
- Each entry is 32 bits (4 bytes) for uniformity
- Smaller types (BOOL, SINT) are zero/sign-extended to 32 bits

```
Stack Pointer (SP) ──► ┌─────────────┐
                       │   Top - 0   │  ◄── Most recent push
                       ├─────────────┤
                       │   Top - 1   │
                       ├─────────────┤
                       │   Top - 2   │
                       ├─────────────┤
                       │     ...     │
                       └─────────────┘
```

### 2.3 Call Stack

Separate from the evaluation stack, used for CALL/RET:

- Maximum depth: 32 calls (prevents runaway recursion)
- Each frame stores: Return Address (16-bit) + Base Pointer (16-bit)

---

## 3. Data Types

IEC 61131-3 defines standard data types. We map them to type IDs for the VM.

### 3.1 Elementary Types

| IEC Type | Type ID | Size (bytes) | Range | Description |
|----------|---------|--------------|-------|-------------|
| BOOL     | `0x01`  | 1            | 0, 1  | Boolean |
| SINT     | `0x02`  | 1            | -128 to 127 | Signed 8-bit integer |
| USINT    | `0x03`  | 1            | 0 to 255 | Unsigned 8-bit integer |
| INT      | `0x04`  | 2            | -32768 to 32767 | Signed 16-bit integer |
| UINT     | `0x05`  | 2            | 0 to 65535 | Unsigned 16-bit integer |
| DINT     | `0x06`  | 4            | -2^31 to 2^31-1 | Signed 32-bit integer |
| UDINT    | `0x07`  | 4            | 0 to 2^32-1 | Unsigned 32-bit integer |
| LINT     | `0x08`  | 8            | -2^63 to 2^63-1 | Signed 64-bit integer |
| ULINT    | `0x09`  | 8            | 0 to 2^64-1 | Unsigned 64-bit integer |
| REAL     | `0x0A`  | 4            | IEEE 754 | 32-bit float |
| LREAL    | `0x0B`  | 8            | IEEE 754 | 64-bit float |
| TIME     | `0x0C`  | 4            | ms as DINT | Time duration |
| BYTE     | `0x10`  | 1            | 8 bits | Bit string |
| WORD     | `0x11`  | 2            | 16 bits | Bit string |
| DWORD    | `0x12`  | 4            | 32 bits | Bit string |
| LWORD    | `0x13`  | 8            | 64 bits | Bit string |
| STRING   | `0x14`  | Variable     | See below | Character string |

### 3.2 STRING Type Layout

IEC 61131-3 strings are fixed-capacity with dynamic length. ZPLC uses this memory layout:

```
┌───────────────┬───────────────┬──────────────────────┐
│ current_len   │ max_capacity  │      data[]          │
│   (2 bytes)   │   (2 bytes)   │  (max_capacity + 1)  │
└───────────────┴───────────────┴──────────────────────┘
     Offset 0        Offset 2         Offset 4
```

| Field | Size | Description |
|-------|------|-------------|
| `current_len` | 2 bytes | Current string length (0 to max_capacity) |
| `max_capacity` | 2 bytes | Maximum characters (default: 80, max: 255) |
| `data` | capacity+1 | Null-terminated character data |

**Total size:** 4 + max_capacity + 1 bytes

**Example:** A `STRING[80]` occupies 85 bytes (4 header + 80 chars + 1 null).

### 3.3 Type Categories

For opcode suffixes, types are grouped:

| Category | Code | Types |
|----------|------|-------|
| Boolean  | `B`  | BOOL |
| Integer  | `I`  | SINT, USINT, INT, UINT, DINT, UDINT, LINT, ULINT |
| Real     | `R`  | REAL, LREAL |
| Any      | `A`  | All types (generic operations) |

---

## 4. Instruction Set

### 4.1 Instruction Encoding

Instructions are variable-length for compactness:

```
┌──────────┬────────────────────────────────────┐
│  Opcode  │           Operand (optional)       │
│  1 byte  │     0, 1, 2, or 4 bytes            │
└──────────┴────────────────────────────────────┘
```

| Opcode Range | Operand Size | Description |
|--------------|--------------|-------------|
| `0x00-0x3F`  | 0 bytes      | Simple ops (NOP, ADD, RET, etc.) |
| `0x40-0x7F`  | 1 byte       | Ops with 8-bit immediate/offset |
| `0x80-0xBF`  | 2 bytes      | Ops with 16-bit address/offset |
| `0xC0-0xFF`  | 4 bytes      | Ops with 32-bit immediate |

### 4.2 Opcode Table

#### 4.2.1 System Operations (0x00-0x0F)

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x00` | NOP      | -       | -            | No operation |
| `0x01` | HALT     | -       | -            | Stop execution |
| `0x02` | BREAK    | -       | -            | Debugger breakpoint |
| `0x03` | GET_TICKS| -       | (→ ms)       | Push system tick counter (milliseconds) |
| `0x0F` | RESERVED | -       | -            | Reserved for future |

#### 4.2.2 Stack Operations (0x10-0x1F)

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x10` | DUP      | -       | (a → a a)    | Duplicate top |
| `0x11` | DROP     | -       | (a → )       | Discard top |
| `0x12` | SWAP     | -       | (a b → b a)  | Swap top two |
| `0x13` | OVER     | -       | (a b → a b a)| Copy second to top |
| `0x14` | ROT      | -       | (a b c → b c a) | Rotate top three |
| `0x15` | LOADI8   | -       | (addr → val) | Load 8-bit from address on stack |
| `0x16` | LOADI32  | -       | (addr → val) | Load 32-bit from address on stack |
| `0x17` | STOREI8  | -       | (addr val →) | Store 8-bit to address on stack |
| `0x18` | STOREI32 | -       | (addr val →) | Store 32-bit to address on stack |
| `0x19` | LOADI16  | -       | (addr → val) | Load 16-bit from address on stack |
| `0x1A` | STOREI16 | -       | (addr val →) | Store 16-bit to address on stack |
| `0x1B` | STRLEN   | -       | (str → len)  | Get string length |
| `0x1C` | STRCPY   | -       | (src dst →)  | Copy string (bounds-checked) |
| `0x1D` | STRCAT   | -       | (src dst →)  | Concatenate strings (bounds-checked) |
| `0x1E` | STRCMP   | -       | (s1 s2 → cmp)| Compare strings (-1, 0, 1) |
| `0x1F` | STRCLR   | -       | (str →)      | Clear string to empty |

**Indirect Memory Access (v1.2):** The `LOADI*` and `STOREI*` opcodes enable computed address access, essential for implementing arrays, FIFO/LIFO buffers, and other data structures. The address is taken from the stack rather than encoded in the instruction.

**String Operations (v1.2):** The string opcodes operate on the STRING memory layout (see Section 3.2). All operations are bounds-checked and will truncate rather than overflow. STRCPY and STRCAT respect the destination's `max_capacity` field.

#### 4.2.3 Load/Store Operations (0x20-0x3F)

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x80` | LOAD8    | addr16  | (→ val)      | Load 8-bit from address |
| `0x81` | LOAD16   | addr16  | (→ val)      | Load 16-bit from address |
| `0x82` | LOAD32   | addr16  | (→ val)      | Load 32-bit from address |
| `0x83` | LOAD64   | addr16  | (→ val_lo val_hi) | Load 64-bit (2 stack slots) |
| `0x84` | STORE8   | addr16  | (val →)      | Store 8-bit to address |
| `0x85` | STORE16  | addr16  | (val →)      | Store 16-bit to address |
| `0x86` | STORE32  | addr16  | (val →)      | Store 32-bit to address |
| `0x87` | STORE64  | addr16  | (val_lo val_hi →) | Store 64-bit |
| `0xC0` | PUSH32   | imm32   | (→ val)      | Push 32-bit immediate |
| `0x40` | PUSH8    | imm8    | (→ val)      | Push 8-bit immediate (sign-extended) |
| `0x41` | PICK     | n8      | (... → ... stack[sp-1-n]) | Copy nth stack element to top |
| `0x88` | PUSH16   | imm16   | (→ val)      | Push 16-bit immediate (sign-extended) |

#### 4.2.4 Arithmetic Operations (0x20-0x2F)

All arithmetic ops work on 32-bit integers by default. Type suffixes indicate variants.

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x20` | ADD      | -       | (a b → a+b)  | Integer addition |
| `0x21` | SUB      | -       | (a b → a-b)  | Integer subtraction |
| `0x22` | MUL      | -       | (a b → a*b)  | Integer multiplication |
| `0x23` | DIV      | -       | (a b → a/b)  | Integer division |
| `0x24` | MOD      | -       | (a b → a%b)  | Integer modulo |
| `0x25` | NEG      | -       | (a → -a)     | Integer negation |
| `0x26` | ABS      | -       | (a → |a|)    | Absolute value |
| `0x28` | ADDF     | -       | (a b → a+b)  | Float addition |
| `0x29` | SUBF     | -       | (a b → a-b)  | Float subtraction |
| `0x2A` | MULF     | -       | (a b → a*b)  | Float multiplication |
| `0x2B` | DIVF     | -       | (a b → a/b)  | Float division |
| `0x2C` | NEGF     | -       | (a → -a)     | Float negation |
| `0x2D` | ABSF     | -       | (a → |a|)    | Float absolute value |

#### 4.2.5 Logical/Bitwise Operations (0x30-0x3F)

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x30` | AND      | -       | (a b → a&b)  | Bitwise AND |
| `0x31` | OR       | -       | (a b → a\|b) | Bitwise OR |
| `0x32` | XOR      | -       | (a b → a^b)  | Bitwise XOR |
| `0x33` | NOT      | -       | (a → ~a)     | Bitwise NOT |
| `0x34` | SHL      | -       | (a n → a &lt;&lt; n) | Shift left |
| `0x35` | SHR      | -       | (a n → a &gt;&gt; n) | Shift right (logical) |
| `0x36` | SAR      | -       | (a n → a &gt;&gt; n) | Shift right (arithmetic) |

#### 4.2.6 Comparison Operations (0x38-0x3F)

Result is 1 (true) or 0 (false), pushed as 32-bit integer.

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x38` | EQ       | -       | (a b → a==b) | Equal |
| `0x39` | NE       | -       | (a b → a!=b) | Not equal |
| `0x3A` | LT       | -       | (a b → a &lt; b)  | Less than (signed) |
| `0x3B` | LE       | -       | (a b → a &lt;= b) | Less or equal (signed) |
| `0x3C` | GT       | -       | (a b → a &gt; b)  | Greater than (signed) |
| `0x3D` | GE       | -       | (a b → a &gt;= b) | Greater or equal (signed) |
| `0x3E` | LTU      | -       | (a b → a &lt; b)  | Less than (unsigned) |
| `0x3F` | GTU      | -       | (a b → a &gt; b)  | Greater than (unsigned) |

#### 4.2.7 Control Flow Operations (0x90-0x9F)

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0x90` | JMP      | addr16  | -            | Unconditional jump |
| `0x91` | JZ       | addr16  | (cond →)     | Jump if zero (false) |
| `0x92` | JNZ      | addr16  | (cond →)     | Jump if not zero (true) |
| `0x93` | CALL     | addr16  | -            | Call subroutine |
| `0x94` | RET      | -       | -            | Return from subroutine |
| `0x50` | JR       | off8    | -            | Relative jump (signed offset) |
| `0x51` | JRZ      | off8    | (cond →)     | Relative jump if zero |
| `0x52` | JRNZ     | off8    | (cond →)     | Relative jump if not zero |

#### 4.2.8 Type Conversion (0xA0-0xAF)

| Opcode | Mnemonic | Operand | Stack Effect | Description |
|--------|----------|---------|--------------|-------------|
| `0xA0` | I2F      | -       | (int → float)| Integer to float |
| `0xA1` | F2I      | -       | (float → int)| Float to integer (truncate) |
| `0xA2` | I2B      | -       | (int → bool) | Integer to boolean |
| `0xA3` | EXT8     | -       | (i8 → i32)   | Sign-extend 8-bit |
| `0xA4` | EXT16    | -       | (i16 → i32)  | Sign-extend 16-bit |
| `0xA5` | ZEXT8    | -       | (u8 → u32)   | Zero-extend 8-bit |
| `0xA6` | ZEXT16   | -       | (u16 → u32)  | Zero-extend 16-bit |

---

## 5. Binary File Format (`.zplc`)

The `.zplc` file is the compiled program package. It's designed for:
- Fast loading (sequential read, minimal parsing)
- Integrity verification (CRC32)
- Versioning and compatibility checking

### 5.1 File Structure

```
┌────────────────────────────────────────────┐
│              File Header (32 bytes)        │
├────────────────────────────────────────────┤
│           Segment Table (variable)         │
├────────────────────────────────────────────┤
│              Code Segment                  │
├────────────────────────────────────────────┤
│              Data Segment                  │
├────────────────────────────────────────────┤
│            Symbol Table (optional)         │
├────────────────────────────────────────────┤
│            Debug Info (optional)           │
└────────────────────────────────────────────┘
```

### 5.2 File Header (32 bytes)

All multi-byte values are **little-endian**.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0x00   | 4    | `magic` | Magic number: `0x434C505A` (reads as "ZPLC" in hex dump) |
| 0x04   | 2    | `version_major` | Major version (breaking changes) |
| 0x06   | 2    | `version_minor` | Minor version (compatible changes) |
| 0x08   | 4    | `flags` | Feature flags (see below) |
| 0x0C   | 4    | `crc32` | CRC32 of entire file (excluding this field) |
| 0x10   | 4    | `code_size` | Size of code segment in bytes |
| 0x14   | 4    | `data_size` | Size of data segment in bytes |
| 0x18   | 2    | `entry_point` | Code offset of main entry |
| 0x1A   | 2    | `segment_count` | Number of segments |
| 0x1C   | 4    | `reserved` | Reserved for future use (must be 0) |

**Total: 32 bytes**

### 5.3 Flags Field

| Bit | Name | Description |
|-----|------|-------------|
| 0   | `HAS_DEBUG` | Debug segment present |
| 1   | `HAS_SYMBOLS` | Symbol table present |
| 2   | `HAS_RETAIN` | Uses retentive memory |
| 3   | `SIGNED` | Cryptographic signature appended |
| 4-31| Reserved | Must be 0 |

### 5.4 Segment Table Entry (8 bytes each)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0x00   | 2    | `type` | Segment type (see below) |
| 0x02   | 2    | `flags` | Segment-specific flags |
| 0x04   | 4    | `size` | Segment size in bytes |

**Segment Types:**

| Value | Name | Description |
|-------|------|-------------|
| 0x01  | `SEG_CODE` | Executable bytecode |
| 0x02  | `SEG_DATA` | Initialized data (constants) |
| 0x03  | `SEG_BSS` | Uninitialized data (size only) |
| 0x04  | `SEG_RETAIN` | Retentive variable definitions |
| 0x05  | `SEG_IOMAP` | I/O mapping table |
| 0x10  | `SEG_SYMTAB` | Symbol table |
| 0x11  | `SEG_DEBUG` | Debug information |
| 0x20  | `SEG_TASK` | Task definitions |

### 5.5 Task Definition (16 bytes each)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0x00   | 2    | `id` | Task ID |
| 0x02   | 1    | `type` | 0=Cyclic, 1=Event, 2=Init |
| 0x03   | 1    | `priority` | 0=Highest, 255=Lowest |
| 0x04   | 4    | `interval_us` | Cycle time in microseconds |
| 0x08   | 2    | `entry_point` | Code offset |
| 0x0A   | 2    | `stack_size` | Required stack depth |
| 0x0C   | 4    | `reserved` | Must be 0 |

### 5.6 I/O Map Entry (8 bytes each)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0x00   | 2    | `var_addr` | Variable address in memory |
| 0x02   | 1    | `var_type` | Data type ID |
| 0x03   | 1    | `direction` | 0=Input, 1=Output |
| 0x04   | 2    | `channel` | Physical channel number |
| 0x06   | 2    | `flags` | Bit offset, invert, etc. |

---

## 6. Execution Model

### 6.1 Scan Cycle

```
┌─────────────────────────────────────────────────────────┐
│                    PLC Scan Cycle                       │
├─────────────────────────────────────────────────────────┤
│  1. INPUT LATCH                                         │
│     └── HAL reads physical inputs → IPI                 │
│                                                         │
│  2. TASK EXECUTION (by priority)                        │
│     ├── Task 0 (highest priority)                       │
│     ├── Task 1                                          │
│     └── Task N                                          │
│                                                         │
│  3. OUTPUT FLUSH                                        │
│     └── OPI → HAL writes physical outputs               │
│                                                         │
│  4. HOUSEKEEPING                                        │
│     ├── Comm handling (Modbus, MQTT)                    │
│     ├── Debug protocol                                  │
│     └── Retain memory flush (if dirty)                  │
│                                                         │
│  5. CYCLE TIMING                                        │
│     └── Wait until next cycle (if time remains)         │
└─────────────────────────────────────────────────────────┘
```

### 6.2 VM State

```c
typedef struct {
    uint16_t pc;              /* Program Counter */
    uint16_t sp;              /* Stack Pointer */
    uint16_t bp;              /* Base Pointer (for locals) */
    uint8_t  call_depth;      /* Current call nesting */
    uint8_t  flags;           /* Status flags: Z, C, O, ... */
    uint32_t stack[256];      /* Evaluation stack */
    uint16_t call_stack[32];  /* Return addresses */
} zplc_vm_state_t;
```

### 6.3 Error Handling

The VM detects and reports:

| Error Code | Name | Description |
|------------|------|-------------|
| 0x00       | OK | No error |
| 0x01       | STACK_OVERFLOW | Evaluation stack full |
| 0x02       | STACK_UNDERFLOW | Pop from empty stack |
| 0x03       | DIV_BY_ZERO | Division/modulo by zero |
| 0x04       | INVALID_OPCODE | Unknown instruction |
| 0x05       | OUT_OF_BOUNDS | Memory access violation |
| 0x06       | CALL_OVERFLOW | Call stack full |
| 0x07       | INVALID_JUMP | Jump to invalid address |
| 0x08       | WATCHDOG | Execution time exceeded |

---

## 7. Example Programs

### 7.1 Simple Addition: `C := A + B`

Assuming:
- `A` is at address `0x0000` (IPI)
- `B` is at address `0x0002` (IPI)
- `C` is at address `0x1000` (OPI)

```asm
; Load A (16-bit from IPI)
LOAD16  0x0000      ; 81 00 00    Stack: [A]

; Load B (16-bit from IPI)
LOAD16  0x0002      ; 81 02 00    Stack: [A, B]

; Add them
ADD                 ; 20           Stack: [A+B]

; Store to C (16-bit to OPI)
STORE16 0x1000      ; 85 00 10    Stack: []
```

**Bytecode:** `81 00 00 81 02 00 20 85 00 10` (10 bytes)

### 7.2 Conditional: `IF A > 10 THEN B := 1 END_IF`

```asm
        LOAD16  0x0000      ; Load A
        PUSH8   10          ; Push constant 10
        GT                  ; A > 10?
        JZ      skip        ; Jump if false
        PUSH8   1           ; Push 1
        STORE16 0x1000      ; B := 1
skip:   ...
```

---

## 8. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0     | 2024 | Initial specification (62 opcodes) |
| 1.1     | 2025 | Added GET_TICKS opcode (63 total), multitask support |
| 1.2     | 2025 | Added indirect memory opcodes (LOADI*, STOREI*) and STRING opcodes (STRLEN, STRCPY, STRCAT, STRCMP, STRCLR). |
| 1.2.1   | 2025 | Added PICK opcode (0x41) for deep stack access. Total: **75 opcodes** |

---

## Appendix A: Opcode Quick Reference

```
00 NOP       10 DUP       20 ADD       30 AND       
01 HALT      11 DROP      21 SUB       31 OR        
02 BREAK     12 SWAP      22 MUL       32 XOR       
03 GET_TICKS 13 OVER      23 DIV       33 NOT       
             14 ROT       24 MOD       34 SHL       
             15 LOADI8    25 NEG       35 SHR       
             16 LOADI32   26 ABS       36 SAR       
             17 STOREI8                             
             18 STOREI32                            
             19 LOADI16                             
             1A STOREI16                            
             1B STRLEN                              
             1C STRCPY                              
             1D STRCAT                              
             1E STRCMP                              
             1F STRCLR                              
                                                    
38 EQ        40 PUSH8     50 JR        80 LOAD8     
39 NE        41 PICK      51 JRZ       81 LOAD16    90 JMP       
3A LT        52 JRNZ      82 LOAD32    91 JZ        
3B LE                     83 LOAD64    92 JNZ       
3C GT                     84 STORE8    93 CALL      
3D GE        28 ADDF      85 STORE16   94 RET       
3E LTU       29 SUBF      86 STORE32               
3F GTU       2A MULF      87 STORE64               
             2B DIVF      88 PUSH16                
             2C NEGF                               
             2D ABSF      C0 PUSH32                
                                                    
A0 I2F       A3 EXT8      A5 ZEXT8                 
A1 F2I       A4 EXT16     A6 ZEXT16                
A2 I2B                                              
```
