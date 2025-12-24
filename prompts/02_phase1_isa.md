# System Prompt: ZPLC Phase 1 - ISA & Binary Format Definition

**Role:** Systems Architect / Embedded C Engineer
**Objective:** Define the ZPLC Virtual Machine Instruction Set Architecture (ISA) and the `.zplc` binary format.

## Context
We are building **ZPLC**, a portable IEC 61131-3 runtime.
Phase 0 (Build System & HAL) is complete.
Now we need to define the "Contract" between the Compiler (IDE) and the Runtime (VM).

## Tasks

### 1. Create `docs/ISA.md`
Write a detailed specification for the ZPLC Virtual Machine. It must cover:
- **Memory Model:** Define the 4 memory areas:
    - `Input Process Image (IPI)`: Read-only for logic, updated by HAL.
    - `Output Process Image (OPI)`: Write-only for logic, flushed to HAL.
    - `Work Memory (STACK/HEAP)`: Temporary data.
    - `Retentive Memory (RETAIN)`: Persistent across functionality.
- **Data Types:** Map IEC 61131-3 types to primitive IDs (BOOL=0x01, SINT=0x02, etc.).
- **Instruction Set (Opcodes):**
    - Define a **Stack-Based** VM (easier for V1 than register-based).
    - Categories:
        - `Stack Ops`: PUSH, POP, DUP, SWAP.
        - `Math`: ADD, SUB, MUL, DIV (for different types).
        - `Logic`: AND, OR, XOR, NOT.
        - `Comparison`: EQ, NE, GT, LT.
        - `Control Flow`: JMP, JZ (Jump if Zero), JNZ, CALL, RET.
        - `Data Access`: LOAD (from memory), STORE (to memory).
- **Binary Format (`.zplc`):**
    - Header structure (Magic, Version, CRC).
    - Segment headers (Code, Data, Relocation tables).

### 2. Implement C Headers (`include/zplc_isa.h`)
Translate the `ISA.md` into strict C99 header definitions.
- `typedef enum zplc_opcode_t`: All opcode values (e.g., `OP_NOP = 0x00`).
- `typedef enum zplc_data_type_t`: Type IDs.
- `typedef struct zplc_file_header_t`: The binary file header.
- `typedef struct zplc_instruction_t`: The in-memory representation of an instruction (Opcode + Operand).

### 3. Verify Alignment
But a simple test `tests/test_isa.c` that checks:
- `sizeof(zplc_file_header_t)` is consistent (use `#pragma pack(1)` or similar if needed for cross-platform safety).
- Print the Opcode values to ensure they don't overlap.

## Output Expectations
- `docs/ISA.md` is a readable, comprehensive reference.
- `include/zplc_isa.h` compiles effectively.
- `tests/test_isa.c` passes.
