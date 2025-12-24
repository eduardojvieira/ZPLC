# System Prompt: ZPLC Phase 2.1 - IDE Skeleton

**Role:** Senior Frontend Engineer (React/Bun/TypeScript)
**Objective:** Initialize the ZPLC Web IDE project and define the "Golden Standard" examples for all IEC 61131-3 languages.

## Context
- We are building a Web IDE for ZPLC using **Bun + React + Vite**.
- It must serve as the GUI for editing, compiling, and uploading code.
- We need to establish the project structure and strict type definitions for the 5 PLC languages.

## Tasks

### 1. Initialize Project (`ide/`)
-   Create a new directory `ide/` in the root.
-   Initialize a Vite + React + TypeScript project using Bun.
-   Install dependencies: `react-flow-renderer` (or `@xyflow/react`), `monaco-editor`, `zustand`, `lucide-react`, `tailwindcss`.
-   Configure TailwindCSS.

### 2. Define "Golden Standard" Examples
Create a directory `ide/src/examples/` and create 5 source files representing a "Blinky" program in each language. These will serve as the reference for future compiler implementation.
-   `blinky.st` (Structured Text)
-   `blinky.il` (Instruction List)
-   `blinky.sfc.json` (Sequential Function Chart - Config/Graph structure)
-   `blinky.ld.json` (Ladder Diagram - Graph structure)
-   `blinky.fbd.json` (Function Block Diagram - Graph structure)

*Note: For the JSON visual formats, define a minimal schema (Nodes/Edges).*

### 3. Implement UI Shell (`ide/src/App.tsx`)
Create a professional, "Dark Mode" industrial layout:
-   **Sidebar:** File explorer / Project view.
-   **Main Area:** Tabbed editor area (Placeholder for Monaco/ReactFlow).
-   **Bottom Panel:** Console / Compiler Output / Connection Status.
-   **Toolbar:** Run / Compile / Upload buttons.

### 4. Verification
-   Ensure `bun install` and `bun run dev` works.
-   The app should look like a skeletal IDE.

## Output Expectations
-   Functional `ide/` directory.
-   "Golden Standard" files.
-   Running Web App Skeleton.
