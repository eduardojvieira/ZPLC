# System Prompt: ZPLC Phase 2.8 - Final UX Polish

**Role:** Frontend UX Engineer
**Objective:** Address user feedback regarding Canvas Layout, Drag-and-Drop usability, and Project Defaults.

## Issues to Fix

### 1. Canvas Layout (FBD & SFC)
-   **Problem**: Examples open "too small" or "disorganized".
-   **Root Cause**: `fitView` fits *everything* into the viewport. If nodes are far apart or viewport is small, zoom becomes tiny.
-   **Fix**:
    -   Set `minZoom={0.5}` and `maxZoom={1.5}` in `ReactFlow` props.
    -   Adjust **initial node positions** in `useIDEStore.ts` (Example content) to be tighter/closer together.
    -   Ensure `defaultViewport={{ x: 0, y: 0, zoom: 1 }}` is respected if `fitView` is removed/conditional.

### 2. Ladder Editor (LD) Drag-and-Drop
-   **Problem**: User "doesn't know how to drag elements".
-   **Fix**:
    -   Add a **"Drag Elements Here"** placeholder to empty rungs.
    -   When dragging starts, **highlight** valid drop zones with a stronger color (e.g., `bg-blue-500/20`).
    -   Ensure the `DropZone` component is always rendered but transparent, becoming visible `onDragOver`.

### 3. Project Defaults
-   **Problem**: Default POU is `Main`, but examples use `Blinky`.
-   **Fix**:
    -   Update `ProjectSettings.tsx` to scan `files` for `Start POU` options.
    -   In `useIDEStore.ts`, set the default `projectConfig.startPou` to `'Blinky'` (or whatever the main example file is named).

## Deliverables
-   Updated `FBDEditor`, `SFCEditor` with better zoom constraints.
-   Updated `LDRungGrid` with clear drag hints.
-   Updated `useIDEStore` with correct defaults.
