# Phase 2.9: Compiler Integration & VM Testing

## Context
We have successfully implemented:
1.  **Visual Editors**: Logic can be designed in ST, LD, FBD, and SFC.
2.  **ST Compiler**: Converts Structured Text to ZPLC Assembly (`ide/src/compiler`).
3.  **Virtual Machine**: Runs ZPLC Bytecode (`apps/zephyr_app`).
4.  **Assembler**: Converts ASM to Bytecode.

## Problem
Currently, **only ST** can be compiled and run. The visual languages (LD, FBD, SFC) exist only as data models (JSON) and UI. There is no bridge to turn them into executable code.

## Objective
Implement a **"Transpile-to-ST" strategy** to enable compilation for all languages, and verify execution on the Simulator VM.

## Implementation Strategy

### 1. Implement Visual Transpilers
Create transpilers that convert the visual models into valid Structured Text source code. This leverages our robust ST compiler.
*   **Directory**: `ide/src/compiler/transpilers/`
*   **Files**: `ld.ts`, `fbd.ts`, `sfc.ts`

#### Logic Mapping
*   **LD (Ladder)**:
    *   Rungs -> Boolean expressions (e.g., `Coil := (Contact1 AND Contact2) OR Branch;`).
    *   Timers/FBs -> FB calls (e.g., `MyTimer(IN:=Con, PT:=T#5s);`).
*   **FBD (Function Block)**:
    *   Topological sort of blocks to determine execution order.
    *   Generate assignments and FB calls.
*   **SFC (Sequential Function Chart)**:
    *   State Machine pattern in ST (CASE statement or boolean logic).
    *   Generate `STEP` and `TRANSITION` logic.

### 2. IDE Integration ("Compile & Run")
*   **Store**: Update `useIDEStore.ts` or create `useCompiler.ts`.
    *   Action: `compileProject()` should detect the active POU's language.
    *   If ST: Compile directly.
    *   If Visual: Transpile to ST -> Compile.
*   **UI**: Add a "Run / Flash" button in the generic `EditorLayout` or `TopBar`.
    *   On click: Compile -> Generate `.zplc` binary -> Send to VM (or simulate).

### 3. Simulator Integration
*   Ensure the IDE can send the bytecode to the generic VM runner (or a web-based WASM version if we have one, otherwise just ensure binary generation works and verify with the local `zephyr_app` or specific tests).
*   *Note: If a web-WASM VM isn't set up, validation can be done by generating the bytecode and running it against the local C-based VM tests.*

## Verification Steps (The "Test")
Create a test suite (or manual verification checklist) to prove functionality:

1.  **ST Blinky**: Compile standard ST example -> Verify Bytecode -> Run.
2.  **LD Blinky**: Create Ladder version -> Transpile -> Compile -> Run.
3.  **FBD Blinky**: Create FBD version -> Transpile -> Compile -> Run.
4.  **SFC Blinky**: Create SFC version -> Transpile -> Compile -> Run.

## Deliverables
1.  `ide/src/compiler/transpilers/{ld,fbd,sfc}.ts`
2.  `ide/src/compiler/index.ts` (exporting a unified `compileProject` function)
3.  Updated UI with "Compile/Run" button.
4.  Proof of execution (Console logs or VM output).
