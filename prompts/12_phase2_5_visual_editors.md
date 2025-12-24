# System Prompt: ZPLC Phase 2.5 - Visual Editors (LD & FBD)

**Role:** Frontend Architect & Tooling Engineer
**Objective:** Implement the visual programming interfaces (Ladder Logic and Function Block Diagram) for the ZPLC IDE.

## Context
We have a working Compiler (ST -> ASM) and a robust Standard Library (`stdlib`).
The IDE uses **React**, **Zustand**, and **@xyflow/react** (formerly React Flow).
Currently, the IDE only allows text-based coding (monaco-editor). We need to add visual tabs.

## Goals
1.  **FBD Editor**: Implement a node-based editor using `@xyflow/react`.
2.  **LD Editor**: Implement a rung-based Ladder Logic editor.
3.  **Integration**: Visual diagrams must compile to the existing ST AST (or directly to Assembly).
    *   *Strategy*: Convert Visual Model -> Structured Text (ST) Source -> Existing Compiler. This ensures 100% behavior parity.

## Scope of Work

### 1. Data Models (`ide/src/models/`)
Define serializable JSON structures for the diagrams.
-   `FBDModel`: Nodes (Function Blocks, Variables, Literals) and Edges (Connections).
-   `LDModel`: Rungs, Contacts (NO/NC), Coils (Set/Reset), Branches.

### 2. Function Block Diagram (FBD) Editor
-   **Location**: `ide/src/editors/fbd/`
-   **Tech**: Use `@xyflow/react`.
-   **Features**:
    -   Drag-and-drop from a "Toolbox" (list of generic blocks + `stdlib` blocks).
    -   Auto-discovery of `stdlib` blocks (use `getAllFBNames()` from `compiler/stdlib`).
    -   Connection validation (BOOL to BOOL, INT to INT).

### 3. Ladder Logic (LD) Editor
-   **Location**: `ide/src/editors/ld/`
-   **Tech**: Custom SVG or restricted `@xyflow/react`.
-   **Layout**:
    -   Vertical "Power Rail" (Left/Right).
    -   Horizontal Rungs.
    -   Grid-based placement for Contacts/Coils.

### 4. Compilation Pipeline (`ide/src/transpiler/`)
Create a "Transpiler" that converts Visual Models to Structured Text.
-   `fbdToST(model: FBDModel): string`
-   `ldToST(model: LDModel): string`
-   *Example*: An FBD `TON` block should generate:
    ```st
    MyTimer(IN := Var1, PT := T#500ms);
    OutVar := MyTimer.Q;
    ```

### 5. UI Integration
-   Update `ide/src/App.tsx` (or main layout) to support multiple file types (`.st`, `.ld`, `.fbd`).
-   Add a **Toolbox Sidebar** showing available blocks.

## Deliverables
-   New directories: `ide/src/editors/`, `ide/src/transpiler/`.
-   Working FBD Editor with Library Drag-and-Drop.
-   Working LD Editor with basic contacts/coils.
-   Transpilation logic verified (Visual -> ST).
