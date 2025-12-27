# Phase 6: IDE Project Management Overhaul

## Context
The current ZPLC IDE uses a simple in-memory project model where files are flat and pre-loaded. The user wants to upgrade this to a professional **File-System-Based** workflow similar to VS Code or CODESYS, allowing:
1.  **Empty Startup**: Open the IDE with no project.
2.  **Folder Access**: Open a local directory using the **File System Access API**.
3.  **Project Structure**: Organize code into Programs, Function Blocks, Functions, and Globals.
4.  **Task Configuration**: Configure multiple tasks (Cyclic/Event) and assign Programs to them.

## Objectives

### 1. File System Access
- Implement `window.showDirectoryPicker()` to open local folders.
- Store the `FileSystemDirectoryHandle` in the store.
- Create a recursive file tree reader to populate the workspace.
- **Constraint**: If half of the API is missing (e.g. Firefox), provide a "Virtual Project" fallback (in-memory).

### 2. Project Structure (Standardized)
Define a standard folder layout for ZPLC projects:
```text
/my-project/
  ├── zplc.json          (Project Configuration & Task Map)
  ├── src/
  │   ├── main.st        (Default Program)
  │   ├── utils.st       (Functions)
  │   ├── globals.gv     (Global Variables)
  │   └── ...
  └── .gitignore
```

### 3. Updated Store (`useIDEStore.ts`)
- **Remove** `loadDefaultProject` auto-loading behavior.
- **Add** `projectHandle`: The directory handle.
- **Update** `files` to support a directory tree structure (or keep it flat with `path` attributes, but ensure the UI renders a tree).
- **Add** `saveFile(fileId)`: Writes content back to disk using the file handle.

### 4. UI Changes
- **Welcome Screen**: A new "Start Page" component shown when `currentProjectId` is null.
    - [Open Folder] button.
    - [New Project] button (creates folder structure).
- **Sidebar**:
    - render a **Tree View** (Folders/Files) instead of a flat list.
    - Context Menu: "New Program", "New Function Block", "New GVL".
- **Task Configuration Editor**:
    - A dedicated UI to edit `zplc.json`.
    - **Tasks Table**: Create tasks (Name, Interval, Priority).
    - **POU Assignment**: Assign programs (PRG) to tasks.

## Implementation Steps

### Step 1: Storage & Types
1.  Update `types/index.ts`:
    *   Refine `ProjectConfig` to map strictly to `zplc.json`.
    *   Add `POUType` ('PRG', 'FB', 'FUN', 'GVL').
    *   Add `TaskDef` interface.
2.  Update `useIDEStore.ts`:
    *   Add `directoryHandle` state.
    *   Add `openProjectFromFolder()` action.
    *   Add `saveProjectFile()` action.

### Step 2: Welcome Screen
1.  Create `src/components/WelcomeScreen.tsx`.
2.  Modify `App.tsx` to conditionally render `WelcomeScreen` if no project is open.

### Step 3: File System Logic
1.  Create `src/utils/fileSystem.ts`.
    *   `openDirectory()`: Calls browser picker.
    *   `readDirectoryRecursive()`: Returns file tree.
    *   `writeFile()`: Writes content.

### Step 4: Task Configuration UI
1.  Create `src/editors/TaskConfigEditor.tsx`.
    *   Allow adding/removing tasks.
    *   Allow dragging Programs into Tasks.

### Step 5: Compiler Update (Brief)
*   Ensure the compiler knows how to read the new `zplc.json` to determine the entry points (Tasks -> Programs). Currently it might just look for `startPOU`. It needs to support multiple entry points.

## Verification
- Open IDE -> Sees Welcome Screen.
- Click "New Project" -> Prompts for folder -> Creates `zplc.json` and `src/`.
- Edit a file -> Save -> Verify content exists on disk.
- Task Config -> Add "FastTask" (10ms) -> Assign `MainPRG`.
