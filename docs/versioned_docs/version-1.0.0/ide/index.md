---
slug: /ide
id: index
title: IDE & Tooling
sidebar_label: IDE Overview
description: Capabilities of the ZPLC Web IDE and debugging tools.
tags: [ide, tooling, debugging]
---

# IDE & Tooling

The ZPLC Integrated Development Environment (IDE) is a modern web application designed to bring software engineering best practices to PLC programming.

## Capabilities

*   **Browser-Based**: Runs entirely in the browser using React and Vite, with zero local installation required to start writing logic.
*   **Rich Editing**: Powered by Monaco Editor, providing syntax highlighting, autocompletion, and error checking for Structured Text.
*   **Integrated Compiler**: The compiler is built into the IDE (via WebAssembly or backend service), allowing for instant feedback on code changes.
*   **Project Management**: Organize your PLC programs, variables, and tasks within a structured project format.

## Desktop and Web Workflows

ZPLC supports two primary workflows:

1.  **Web Workflow**: The IDE can be accessed via a hosted URL. Projects can be saved locally to the browser or synchronized with a cloud backend.
2.  **Desktop Workflow**: For local development and direct hardware connection via serial ports, the IDE can be run locally (e.g., using Electron or a local Node.js server).

## Simulation and Debugging

A core feature of the IDE is the ability to simulate the PLC logic before deploying it to physical hardware.

*   **WASM Simulation**: The actual C99 Core VM is compiled to WebAssembly, allowing the IDE to run the `.zplc` bytecode directly in the browser with cycle-accurate behavior.
*   **Live Variable Monitoring**: View the state of inputs, outputs, and internal variables in real-time during simulation.

## Architecture for Contributors

The IDE is built using `packages/ide`. It relies heavily on `zustand` for state management and communicates with the target hardware or simulator via defined service interfaces. The compiler is located in `packages/compiler`.