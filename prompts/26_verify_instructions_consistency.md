# Protocol: Verify Runtime & IDE Instruction Consistency

## 1. Context & Objective
The ZPLC ecosystem consists of two separate implementations of the instruction set:
1.  **C Runtime (Core)**: The "source of truth", implementing instructions in `zplc_core.c` via opcodes (e.g., `OP_ADD`, `OP_TON`, `OP_GT`).
2.  **IDE (TypeScript)**: The visual environment, which includes:
    *   **Block Registry**: Definitions of logic blocks (inputs/outputs) for FBD/LD.
    *   **Toolbox**: The UI component listing available blocks.
    *   **Transpiler**: Logic to convert visual blocks into ST/ASM.
    *   **Validation**: Type checking for block connections.

**The Goal**: Ensure that **every** instruction available in the Runtime is correctly exposed in the IDE, and vice-versa. No "orphan" opcodes or "ghost" blocks.

## 2. Verification Protocol

### Phase 1: Audit

1.  **Runtime Audit**:
    *   Scan `src/core/zplc_core.c` (switch case `zplc_core_run_cycle`) and `include/zplc_isa.h` to list all supported Opcodes.
    *   Scan `src/libs/` (if implemented) for Function/FunctionBlock definitions.
    *   **Output**: List of Runtime Instructions (e.g., `ADD`, `SEL`, `TON`, `R_TRIG`).

2.  **IDE Audit**:
    *   Scan `ide/src/editors/fbd/FBDToolbox.tsx` (and LD equivalent) to see what is drag-and-droppable.
    *   Scan `ide/src/compiler/transpiler.ts` to see what is compilable.
    *   **Output**: List of IDE Blocks.

3.  **Gap Analysis**:
    *   Compare the two lists.
    *   **Missing in IDE**: Opcodes implemented in C but not draggable in FBD.
    *   **Missing in Runtime**: Blocks in Toolbox that don't have a backend implementation (will cause compilation error or runtime crash).

### Phase 2: Implementation of "Kitchen Sink" Test

To prove consistency, create a **"Kitchen Sink" Test Project** in `tests/integration/consistency_check`:
1.  **Project Content**: A single ZPLC project that uses **one instance of every valid instruction**.
    *   Arithmetic: ADD, SUB, MUL, DIV.
    *   Logic: AND, OR, XOR, NOT.
    *   Comparison: GT, LT, EQ...
    *   Standard Lib: TON, TOF, CTU, R_TRIG...
    *   Select: SEL, MUX, LIMIT...
2.  **Execution**:
    *   Compile the project using the IDE Compiler.
    *   Run it on the Simulator or C Runtime.
    *   **Success Criteria**: No compilation errors, VM executes without Hard Fault (Unknown Opcode).

## 3. Automation (Agent Task)

The agent should check the following specific files for sync:

| Component | File Path | Key Check |
| :--- | :--- | :--- |
| **ISA Definitions** | `include/zplc_isa.h` | Enum `ZPLC_Opcode` |
| **VM Implementation** | `src/core/zplc_core.c` | `switch (op)` cases |
| **IDE Definitions** | `ide/src/types/index.ts` | Enum or Type Union |
| **FBD Registry** | `ide/src/editors/fbd/registry.ts` | Input/Output metadata |
| **ST Transpiler** | `ide/src/compiler/transpilers/st.ts` | Function call mapping |

## 4. Deliverables

1.  **Consistency Report**: A markdown table showing status of each instruction (Runtime: ✅, IDE-Toolbox: ✅, IDE-compiler: ✅).
2.  **Fixes**: Code changes to add missing blocks to IDE or implement missing opcodes in Runtime.
3.  **Test Project**: `kitchen_sink.zplc`.
