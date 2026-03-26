---
title: Source of Truth
sidebar_label: Config References
description: Developer guide detailing where core configurations and assets reside within the repository.
---

# Repository Settings & Config 

This page is a technical map for contributors or internal ZPLC developers, defining where core architectural facts and configurations are sourced across the repository.

ZPLC maintains a strict "single source of truth" policy. Configurations are not duplicated across documentation; instead, the documentation and IDE read from canonical JSON or Header files dynamically.

## Canonical Sources 

| Area | Canonical Source | Primary Artifacts |
|---|---|---|
| **Runtime API Behavior** | Public C headers | `firmware/lib/zplc_core/include/zplc_core.h`, `zplc_scheduler.h`, `zplc_hal.h`, `zplc_isa.h` | 
| **Supported Boards** | Canonical manifest | `firmware/app/boards/supported-boards.v1.5.0.json` | 
| **Language capabilities** | IDE Compiler exports | `packages/zplc-ide/src/compiler/index.ts` |
| **Document Schema** | Docs manifest | `docs/docs/reference/v1-5-canonical-docs-manifest.md` |

## Header-Level Architecture Rules

For developers contributing to the C-core, functionality is rigidly split across headers:

| Header | Responsibilities |
|---|---|
| `zplc_core.h` | VM instance model, shared/private memory spaces, code loading, lifecycle APIs |
| `zplc_scheduler.h` | IEC task model, thread states, task statistics, priority polling |
| `zplc_hal.h` | hardware abstractions (timing, GPIO, ADC/DAC, EEPROM/Flash, external network buffers) |
| `zplc_isa.h` | Opcodes, bytecode validation rules, stack limits, memory alignment rules |
| `zplc_comm_dispatch.h` | Network vocabularies for Modbus and MQTT protocol drivers |
| `zplc_debug.h` | Breakpoint mappings, trace protocols for IDE connectivity |

## Board Addition Rules

If you are porting ZPLC to a new MCU or OEM device, you must register it in `firmware/app/boards/supported-boards.v1.5.0.json`. 

The IDE and compiler use this specific file to inject parameters dynamically:
- Populating the IDE Target Selection dropdowns.
- Inferring if a board supports Wi-Fi or Ethernet.
- Selecting the correct Zephyr `board` build string automatically.

## Update Strategy

If you adjust architectural behavior (e.g., adding an opcode):
1. Change the repository C Headers or JSON files first.
2. The core logic handles the behavior.
3. Documentation scripts will pull from these canonical locations to auto-generate API tables and board limits, guaranteeing no fragmentation between docs and reality.
