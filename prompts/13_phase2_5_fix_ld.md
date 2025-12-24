# System Prompt: ZPLC Phase 2.5.1 - Fix Ladder Logic Editor

**Role:** Frontend Engineer (Canvas/SVG Interaction Specialist)
**Objective:** Overhaul the Ladder Logic (LD) Editor to be fully interactive, supporting drag-and-drop, connection logic, and proper grid alignment.

## Current State Analysis
-   **FBD Editor**: Working well (Reference `ide/src/editors/fbd`).
-   **LD Editor**: Currently a static viewer (`ide/src/editors/ld`). No drag-and-drop, no toolbox, strictly linear rendering without grid logic.

## Goals
1.  **Interactive Grid System**: Implement a cell-based grid for placing Contact/Coil elements.
2.  **Drag-and-Drop**: Move elements from a Toolbox to the Grid.
3.  **Connection Logic**: Draw valid wires between elements on the grid.
4.  **Parallel Branches**: Allow creating OR branches (parallel rungs).

## Specific Tasks

### 1. Data Model Update (`ide/src/models/ld.ts`)
The current linear list of elements is insufficient for grid-based editing.
-   Refactor `LDRung` to support a 2D Grid or Graph structure.
    -   *Option A*: A specialized grid model `(row, col)`.
    -   *Option B*: Use `@xyflow/react` but constrained to a grid snap.
-   **Decision**: Use **Custom Grid** implementation using SVG. It is often cleaner for Ladder Logic than a generic flow graph because Rungs are strictly structural.

### 2. Implement Components
-   **`LDToolbox.tsx`**: Drag source for:
    -   Contacts: NO (`| |`), NC (`|/|`), Rising/Falling Edge.
    -   Coils: Standard (`( )`), Set/Reset, Negated.
    -   Function Blocks (from `stdlib` registry).
    -   Branching tools (Vertical shorts).
-   **`LDRungGrid.tsx`**:
    -   Render a CSS Grid or SVG Grid.
    -   Handle Drop events.
    -   Render "Ghost" indicators when dragging over valid cells.
-   **`LDEditor.tsx`**:
    -   Integrate Toolbox and RungGrid.
    -   Handle selection and deletion.

### 3. Rendering Logic (`LDRungView.tsx`)
-   Draw Power Rails (Left/Right) automatically.
-   Draw horizontal wires between filled cells.
-   Draw vertical lines for branches.
-   *Algorithm*: Scan the grid row-by-row. If cell[i] is empty, draw a wire if it connects two non-empty components.

### 4. Transpiler Update
-   Update `ide/src/transpiler/ldToST.ts` to walk the new Grid structure and generate ST code.

## Deliverables
-   Replaced `ide/src/editors/ld/` contents with the interactive implementation.
-   Functional Drag-and-Drop from Toolbox.
-   Video recording of creating a self-holding circuit (Start/Stop).
