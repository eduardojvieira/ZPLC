# System Prompt: ZPLC Phase 2.4 - IEC 61131-3 Standard Library

**Role:** PLC Library Architect
**Objective:** Implement a comprehensive IEC 61131-3 Standard Library for the ZPLC Compiler, ensuring feature parity with commercial PLCs.

## Context
The ZPLC compiler (`ide/src/compiler`) currently has hardcoded support for `TON`. We need to scale this to support the full set of standard function blocks and functions.
The Compiler generates Assembly (`.asm`) directly.

## Goals
1.  **Modular Architecture**: Refactor the monolithic `codegen.ts` to support pluggable Function Blocks.
2.  **Implementation**: Implement the recommended set of IEC 61131-3 blocks.
3.  **Documentation**: Create professional documentation for the library.

## Scope of Work

### 1. Architectural Refactor
-   Create `ide/src/compiler/stdlib/` directory.
-   Create a registry/interface for Function Blocks (e.g., `FunctionBlockDefinition`).
-   Move existing `TON` logic from `codegen.ts` into `ide/src/compiler/stdlib/timer.ts`.
-   Update `codegen.ts` to allow dynamic lookup of FB generators.

### 2. Block Implementation Details
Implement the following standard blocks. Each must generate optimized ZPLC Assembly.

#### A. Bitwise / Bistables
-   **R_TRIG** (Rising Edge Detector): Q = CLK and not CLK_OLD.
-   **F_TRIG** (Falling Edge Detector): Q = not CLK and CLK_OLD.
-   **RS** (Reset Dominant Latch): R1 overrides S.
-   **SR** (Set Dominant Latch): S1 overrides R.

#### B. Timers
-   **TP** (Pulse Timer): Generates a pulse of length PT.
-   **TON** (On-Delay): (Already exists, refactor).
-   **TOF** (Off-Delay): Delays setting Q to FALSE by PT.

#### C. Counters
-   **CTU** (Count Up): Increment CV on CU rising edge.
-   **CTD** (Count Down): Decrement CV on CD rising edge.
-   **CTUD** (Count Up/Down): Combined functionality.

#### D. Math & Selection Functions (Inline Functions)
These are *Functions* (no memory state), unlike Function Blocks.
-   **MAX**, **MIN**: Return larger/smaller of two values.
-   **LIMIT**: Clamp value between Min and Max.
-   **SEL**: Binary selection (G ? IN1 : IN0).
-   **MUX**: Multiplexer (Select K constant from inputs).

### 3. Documentation
-   Create `docs/STDLIB.md`.
-   For each block, document:
    -   **Interface**: VAR_INPUT, VAR_OUTPUT.
    -   **Description**: Timing diagrams or logic explanation.
    -   **ZPLC Implementation Note**: Any specifics about memory usage.

### 4. Verification
-   Create `ide/src/compiler/stdlib.test.ts`.
-   Write unit tests compiling minimal ST snippets that use these blocks (e.g., `Trigger(CLK := x);`).
-   Verify generated assembly structure (do not need full runtime simulation for every single edge case, but verify the opcodes are correct).

## Deliverables
-   Modified `ide/src/compiler/codegen.ts`.
-   New `ide/src/compiler/stdlib/` containing implementations.
-   `docs/STDLIB.md`.
-   Tests passing.
