# Task: Implement Complex Branching in Ladder Diagram (LD) Editor

## Context
The current ZPLC IDE includes a Ladder Diagram (LD) editor. The rendering logic in `LDRungGrid.tsx` is currently limited to basic grid cells and simple "vertical links" that are drawn as dashed lines. This implementation cannot support complex, nested, or series-parallel branching topologies common in industrial PLC programming (as seen in the reference image).

## Objective
Refactor the LD rendering and interaction logic to support arbitrary branching depths and topologies. The visual output must look like standard Ladder Logic (solid lines, clear split/join points).

## Relevant Files
-   **renderer**: `ide/src/editors/ld/LDRungGrid.tsx` (Needs major overhaul)
-   **model**: `ide/src/models/ld.ts` (Review `verticalLinks` and `grid` structure. Extend if necessary, but prefer backward compatibility.)
-   **toolbox**: `ide/src/editors/ld/LDToolbox.tsx` (May need a "Branch" tool)

## Requirements

### 1. Visual Rendering
-   **Solid Lines**: Replace dashed vertical links with solid vertical rails that connect cleanly to horizontal wires.
-   **Connections**: Draw "corners" where a horizontal line splits into a vertical branch or joins back.
-   **Nesting**: Ensure that a branch *inside* another branch renders correctly (e.g., the outer branch expands vertically to wrap the inner one).
-   **Grid Expansion**: The grid must dynamically size (add rows) to accommodate the height of parallel branches.

### 2. Interaction (Drag-and-Drop / Creation)
-   Implement a way to **create a branch**:
    -   *Option A*: Drag a generic "Branch" tool from the toolbox onto a contact to wrap it.
    -   *Option B*: Select multiple elements and click a "Parallel" button.
-   Support **drag-and-drop** of elements *into* a specific branch level.

### 3. Data Model
-   Evaluate if the current `verticalLinks` (col, fromRow, toRow) approach is sufficient.
    -   *Challenge*: How to differentiate between two separate branches that happen to start/end at the same columns versus one nested inside another?
    -   *Recommendation*: You may need to introduce an explicit `LDBranch` structure or a recursive cell definition if the flat grid + links model is too limiting.

## Reference Image Analysis
Refer to the "SolisPLC" style image provided by the user (if available in context). Note:
-   **Condition 1 & 2** are in series on the main rung.
-   **Condition 3 & 6** form a parallel branch under Condition 1 & 2.
-   **Condition 7** forms a *sub-branch* under Condition 3.
-   **Condition 8, 9, 10** form a third parallel path.
-   All paths re-join before "Energize1".

## Verification Steps
1.  **Create**: Build a rung with a coil.
2.  **Branch**: Add a parallel branch around the start.
3.  **Nest**: Add a sub-branch inside the parallel path.
4.  **Observe**: Check that lines are solid, connected, and do not overlap/cross incorrectly.
5.  **Output**: Confirm the JSON model saves the structure correctly.
