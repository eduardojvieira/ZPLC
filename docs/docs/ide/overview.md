# ZPLC Web IDE Overview

The ZPLC IDE is a modern, web-based engineering environment designed for industrial automation professionals. It enables the development, simulation, and deployment of PLC programs using IEC 61131-3 standard languages.

{/* IDE screenshot placeholder - will be added in future release */}

## Key Features

- **Multi-Language Support**: Work with Ladder Diagrams (LD), Function Block Diagrams (FBD), and Structured Text (ST).
- **Offline-First**: Built with modern web technologies that allow working without an active internet connection.
- **Hardware Agnostic**: Compile your logic once and deploy to any ZPLC-compatible runtime (Zephyr, POSIX, Windows).
- **Real-time Monitoring**: Connect to your hardware and monitor variables live with the debug protocol.
- **WASM Simulation**: Test your logic directly in the browser using the integrated WebAssembly runtime.

## Workflow

1. **Design**: Create your logic using the visual or text-based editors.
2. **Compile**: The IDE transpiles your logic into optimized `.zplc` bytecode.
3. **Simulate**: Run the bytecode in the browser to verify timing and logic.
4. **Deploy**: Upload the package to your target hardware via Serial or Network.
