# ZPLC IDE: Web-Based PLC Engineering Environment

This directory contains the ZPLC IDE, a high-performance, web-based engineering tool for programming and debugging ZPLC-enabled industrial controllers.

## 🚀 Key Technologies
- **React + Vite**: Fast, modern frontend framework.
- **TypeScript**: Type-safe development for complex logic.
- **React Flow**: Powers the interactive LD, FBD, and SFC visual editors.
- **Monaco Editor**: Provides the Structured Text (ST) editing experience.
- **WebAssembly (WASM)**: Runs the ZPLC Core VM directly in the browser for instant simulation.
- **WebSerial API**: Enables direct, driver-less communication with Zephyr hardware targets.
- **Zustand**: Lightweight state management for project files and editor state.

## 📂 Architecture Overview

### 1. Visual Editors (`src/editors/`)
Each IEC 61131-3 language has a dedicated editor component:
- **Ladder Diagram (LD)**: Uses a custom grid-based layout for contacts, coils, and nested branches.
- **Function Block Diagram (FBD)**: Node-based programming via React Flow.
- **Sequential Function Chart (SFC)**: State-machine visualization and transitions.

### 2. The Transpiler Layer (`src/transpiler/`)
Visual logic is converted into Structured Text (ST) before final compilation. This ensures that the VM only needs to understand a single high-level IR, simplifying the instruction set.

### 3. Integrated Compiler (`src/compiler/`)
The ST compiler is written in TypeScript. It performs:
- Lexical & Syntactic Analysis.
- Semantic Validation (type checking).
- Bytecode Generation (`.zplc` format).

### 4. Runtime Adapters (`src/runtime/`)
The IDE uses an "Adapter Pattern" to bridge the UI to different execution environments:
- **WASMAdapter**: Loads `zplc_core.wasm` and runs it in a background loop for local simulation.
- **SerialAdapter**: Communicates with real hardware via the Zephyr Shell over WebSerial.

## 🛠️ Development Setup

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build production assets
bun run build
```

## 🏗️ Project Structure
- `/src/components`: UI elements (Toolbar, Sidebar, Watch Window).
- `/src/store`: Global IDE state (useIDEStore).
- `/src/models`: Core data structures for LD/FBD/SFC models.
- `/src/uploader`: WebSerial protocol implementation.
