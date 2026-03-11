# AI Assistant Entry Point

This file serves as the primary entry point for AI assistants, agents, and automated tools interacting with the ZPLC repository. It outlines the structure, purpose, and rules for operating within this codebase.

## Purpose

ZPLC (Zephyr PLC) is a deterministic, portable, and secure IEC 61131-3 compatible runtime for modern industrial automation. It is designed to run on resource-constrained microcontrollers (e.g., STM32, ESP32, Raspberry Pi Pico) using Zephyr RTOS, while providing a modern web-based IDE for development.

## AI Assistant Guidelines

When interacting with this repository, please adhere to the following guidelines:

1.  **Context is Key**: Before making changes, understand the context of the files you are modifying. Read the `README.md` and explore the `docs/` directory for a high-level understanding.
2.  **Follow the Constitution**: Adhere strictly to the principles outlined in `.specify/memory/constitution.md`. This includes maintaining high industrial quality, prioritizing test-driven development (TDD), and ensuring no memory leaks in the C core.
3.  **Respect the Architecture**: Maintain the separation of concerns between the core VM (`firmware/lib/zplc_core/src/core/`), the Hardware Abstraction Layer (HAL), and the IDE. Do not bypass the HAL for hardware interactions.
4.  **Documentation Standards**: When updating documentation, follow the structure established in `docs/docs/`. Ensure that both English and Spanish (`docs/i18n/es/`) versions are updated in parallel to maintain parity.
5.  **No Unapproved Dependencies**: Do not introduce new dependencies (npm/bun, Zephyr modules) without explicit justification and architectural review.
6.  **Code Style**: Follow the existing code style. Use `clang-tidy` for C code and `eslint` for TypeScript. Treat warnings as errors.

## Key Directories

*   `firmware/`: Contains the Zephyr RTOS based C runtime core and HAL implementations.
*   `packages/`: Contains the web-based IDE, compiler, and shared TypeScript libraries.
*   `docs/`: Contains the Docusaurus-based documentation (canonical source of truth).
*   `.specify/`: Contains project management, specifications, and agent configuration files.
*   `tools/`: Contains auxiliary scripts and hardware-in-the-loop (HIL) testing utilities.

## Agent Personas

When working on specific tasks, consider adopting one of the following personas (defined in `.specify/memory/constitution.md`):

*   **FirmwareEngineer**: Focus on the C core, HAL, and Zephyr integration. Prioritize memory safety and determinism.
*   **IDE_Craftsman**: Focus on the TypeScript/React web IDE. Prioritize performance, UI/UX, and strict typing.
*   **QA_Industrial**: Focus on testing, CI/CD, and hardware validation.
*   **ArchitectureKeeper**: Focus on maintaining system integrity, enforcing rules, and reviewing architectural decisions.

By following these guidelines, you will help maintain the high standards required for an industrial automation platform.
