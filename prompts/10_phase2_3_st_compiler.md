# System Prompt: ZPLC Phase 2.3 - Structured Text (ST) Compiler

**Role:** Compiler Engineer (TypeScript/Node)
**Objective:** Implement a "Proof of Concept" Structured Text (ST) compiler in TypeScript that converts ST source code into ZPLC Assembly.

## Context
- We have a working Assembler (`ide/src/assembler`).
- We have a "Golden" ST example: `ide/src/examples/blinky.st`.
- We need to bridge the gap: `ST -> AST -> ASM`.
- **Scope for v1:** Support ONLY the features used in `blinky.st`. Do not attempt full IEC 61131-3 compliance yet.

## Features to Support (The "Blinky" Subset)
1.  **Structure**: `PROGRAM ... END_PROGRAM`.
2.  **Variables**: `VAR ... END_VAR` block with types (`BOOL`, `TIME`, `TON`).
    -   *Crucial:* Calculate memory offsets automatically. `BOOL`=1 byte, `TIME`=4 bytes.
    -   `TON` is a struct (IN: BOOL, PT: TIME, Q: BOOL, ET: TIME).
3.  **IO Mapping**: `VAR_OUTPUT` with `AT %Q0.0`.
4.  **Logic**:
    -   Function Block calls: `Timer(IN := val, PT := val)`.
    -   If Statements: `IF ... THEN ... END_IF`.
    -   Assignments: `Var := Expression`.
    -   Expressions: Literals (`TRUE`, `T#500ms`), Variables, `NOT`.

## Tasks

### 1. Create Compiler Directory (`ide/src/compiler/`)
-   `lexer.ts`: Tokenize the input (Identify `IF`, `THEN`, `:=`, `id`, `number`, etc.).
-   `parser.ts`: Recursive descent parser producing a simple AST.
-   `symbol_table.ts`: Track variable names, types, and **memory addresses** (Work Memory vs I/O Memory).
-   `codegen.ts`: Traverse AST and emit ZPLC Assembly text (e.g., `LOAD16`, `JMP`).

### 2. Implement Compilation Pipeline
-   **Memory Layout:**
    -   Allocatable variables start at address `0x0000` (Work Memory).
    -   Direct variables (`%Q0.0`) map to Output Memory (`0x1000`).
-   **Code Generation:**
    -   `x := y` -> `LOAD y`, `STORE x`.
    -   `IF c THEN b END_IF` -> `LOAD c`, `JZ end_label`, `[block b]`, `end_label:`.
    -   `TON` call -> This is tricky. For v1, treat `TON` as a built-in macro that emits the logic for a timer, OR if simple enough, just map the memory and let the user write the logic.
    -   *Actually, for Phase 1, `TON` support might be complex. If it's too hard, hardcode the ASM generation for the `TON` block specifically or simplify the blinky example to just use a counter.* -> **DECISION:** Try to implement `TON` as a software macro in the compiler. Calling `BlinkTimer(...)` should generate instructions to update the timer state in memory.

### 3. Verify
-   Create `ide/src/compiler/compiler.test.ts`.
-   Test compiling `blinky.st`.
-   Verify the output ASM matches (logically) the logic in `blinky.il`.

## Output Expectations
-   `ide/src/compiler/index.ts` exporting `compileST(source: string): string`.
-   Helper function `compileToBinary(source: string): Uint8Array` (chains `compileST` -> `assembler.assemble`).
-   Tests proving `blinky.st` compiles to valid Assembly.
