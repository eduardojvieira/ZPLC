# AI Agents Infrastructure

ZPLC is designed to be fully compatible with modern agentic AI workflows. We provide a standardized infrastructure of roles and skills to ensure that AI coding assistants (like Antigravity or OpenCode) can work safely and efficiently on the codebase.

## 1. Agent Personas

We define specific technical personas in the root `agents.md` file. These roles ensure that AI agents adopt the correct mindset for industrial automation development.

### FirmwareEngineer
*   **Expertise**: ANSI C99, Zephyr Kernel, Static Memory Management.
*   **Core Rule**: NEVER use dynamic memory allocation (`malloc`/`free`).
*   **Standard**: Strict C99 with zero warnings (`-Werror`).

### QA_Industrial
*   **Expertise**: MISRA C:2012, Ztest (Zephyr Testing), Code Coverage.
*   **Core Rule**: New features REQUIRE unit tests before implementation.

### ArchitectureKeeper
*   **Expertise**: Real-time Scheduling, VM Instruction Set Architecture (ISA).
*   **Core Rule**: Enforce separation of Core VM logic from the Hardware Abstraction Layer (HAL).

## 2. Agent Skills

Skills are modular, machine-readable instructions located in `.agent/skills/`. Each skill provides the agent with specific capabilities using standardized command templates.

### Zephyr Build (`zephyr-build`)
Enables agents to compile the firmware for various targets.
*   **Targets**: QEMU (`mps2/an385`), Raspberry Pi Pico.
*   **Command**: `west build -b <board> firmware/app --pristine`

### Code Analysis (`code-analysis`)
Enforces industrial quality standards via static analysis.
*   **Tool**: `cppcheck` with MISRA-like strictness.
*   **Policy**: Zero warnings allowed. Any tool output is considered a failure.

### Module Scaffolding (`zplc-module`)
Standardizes the creation of new PLC function blocks.
*   **Enforcement**: Correct naming conventions (`zplc_` prefix), static state initialization, and `zplc_result_t` (or `int`) error propagation.

## 3. How to use with AI Agents

When starting a session with an AI coding assistant, you can point it to these resources:

> "Read `agents.md` and adopt the `FirmwareEngineer` persona. Use the `zephyr-build` skill to verify your changes."

This ensures the agent follows ZPLC's "Essentialism" philosophy: less code, more robustness, zero technical debt.
