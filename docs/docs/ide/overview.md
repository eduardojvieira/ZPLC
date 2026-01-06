# ZPLC IDE Overview

The ZPLC IDE is a modern engineering environment available as a **Desktop Application** (recommended) and a **Web Application**. It enables the development, simulation, and deployment of PLC programs using IEC 61131-3 standard languages.

## Editions

| Feature | Desktop App (Electron) | Web App (Browser) |
|---|---|---|
| **Platform** | macOS, Windows, Linux | Chrome, Edge |
| **Connectivity** | Native Serial & Network | WebSerial API (Chrome/Edge only) |
| **File System** | Direct File Access | Browser Sandboxed |
| **Offline** | Fully Offline | Offline capable (PWA) |
| **Updates** | Auto-updater | Instant web updates |

## Key Features

- **Multi-Language Support**: Work with Ladder Diagrams (LD), Function Block Diagrams (FBD), Structured Text (ST), and Instruction List (IL).
- **Integrated Compiler**: Fast, local compilation to `.zplc` bytecode.
- **Hardware Agnostic**: Compile your logic once and deploy to any ZPLC-compatible runtime (Zephyr, POSIX, Windows).
- **Real-time Monitoring**: Watch window, live variable forcing, and cycle time analysis.
- **WASM Simulation**: Test your logic instantly on your PC using the integrated WebAssembly runtime.
- **Project Management**: Create multi-task configurations with custom cycle times.

## Workflow

1.  **Design**: Create your logic using the visual or text-based editors.
2.  **Configure**: Set up tasks and global variables in `zplc.json`.
3.  **Compile**: The IDE transpiles your logic into optimized `.zplc` bytecode.
4.  **Simulate**: Run the bytecode in the simulator to verify timing and logic.
5.  **Deploy**: Upload the package to your target hardware via Serial (USB).
