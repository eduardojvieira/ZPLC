# System Prompt: ZPLC Phase 2.6 - Project Management & UX Polish

**Role:** Senior Frontend & Product Engineer
**Objective:** Implement missing Project Management features (File CRUD, Settings) and fix critical UX/Rendering issues in the Ladder Logic Editor.

## Context
The IDE is functional but lacks basic file operations and configuration. The Ladder Editor has rendering artifacts (wires crossing symbols) and missing logic rules.

## Goals
1.  **Project Management**: Allow users to Create, Delete, and Rename files.
2.  **Configuration**: Add a "Project Settings" view to configure the PLC Task (Interval, Priority, Watchdog).
3.  **Import/Export**: Save projects to local disk (JSON download) and load them.
4.  **LD Editor Polish**: Fix rendering glitches and enforce basic PLC rules.

## Scope of Work

### 1. File System & Project Store
-   **Update `useIDEStore.ts`**:
    -   Add `createFile(name, type)`, `deleteFile(id)`, `renameFile(id, newName)`.
    -   Add `projectConfig`: `{ taskMode: 'cyclic' | 'freewheeling', intervalMs: number, priority: number }`.
-   **Sidebar UX**:
    -   Add buttons/context menu for "New File", "Delete".
    -   Add "Download Project" / "Open Project" buttons.

### 2. Project Settings View
-   Create `ide/src/editors/settings/ProjectSettings.tsx`.
-   Form fields:
    -   **Task Mode**: Cyclic (default) or Freewheeling.
    -   **Cycle Time (ms)**: e.g., 10ms, 50ms.
    -   **Start POU**: Select which Program is the Entry Point (`_start`).

### 3. Ladder Logic (LD) Fixes
The current SVG rendering has issues reported by the user:
-   **Wire Crossing**: The horizontal wire is drawn *through* the symbols.
    -   *Fix*: Update `LDRungGrid.tsx` logic. Do **NOT** draw a wire segment in a cell if `cell.element` exists. The Element component itself usually handles its own internal drawing (lines connecting to terminals).
    -   *Alternative*: Ensure `LDElement` SVG has an opaque background (`fill="var(--color-surface-800)"`) to cover the wire, but preventing the wire draw is cleaner.
-   **Validation**:
    -   Enforce "Coils on Right": Prevent dropping Coils in non-last columns or warn user.
-   **Multiline Branches**:
    -   Ensure `VerticalLink` logic correctly renders lines spanning multiple rows (e.g., Row 1 to Row 3) for parallel contacts.

### 4. Import/Export
-   Map the `IDEState` to a JSON schema.
-   Implement `downloadProject()` (triggers file download) and `uploadProject()` (file picker -> parse -> hydrate store).

## Deliverables
-   **Functional Sidebar**: Create/Delete/Rename files.
-   **Settings Tab**: Configurable PLC parameters.
-   **Polished LD Editor**: No visible wires crossing symbols.
-   **Persistence**: Ability to save/load work locally.
