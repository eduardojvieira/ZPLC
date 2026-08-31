---
id: intro
title: Runtime introduction
sidebar_label: Runtime overview
description: Portable ZPLC runtime, verified artifacts, and evidence boundaries.
tags: [runtime, embedded, vm]
---

# ZPLC runtime

ZPLC is a portable C99 PLC runtime behind a hardware-abstraction layer (HAL).
Studio, the native host runtime, and Zephyr profiles use verified `.zplc`
artifacts and the same runtime contracts. It is not a certified safety PLC.

## Quick path

1. Compile the project into a `.zplc` artifact.
2. Verify and load/deploy that artifact. A successful load remains logically
   stopped/READY.
3. Inspect the target and explicitly issue the human `zplc start` command to
   run it.

Firmware build, firmware flash, PLC-program deploy, and RUN/debug are separate
operations. A program load never implies an operational start.

## Runtime surfaces

| Surface | Role | Evidence boundary |
| --- | --- | --- |
| Core and loader | C99 VM, ISA, memory model, and `.zplc` verification | Host/unit evidence does not qualify hardware behavior. |
| POSIX native simulation | Headless/local runtime for compile, test, trace, and replay workflows | Host behavior; not target or HIL timing evidence. |
| Zephyr profiles | Firmware runtime and HAL adapters for named board revisions | Capability and qualification vary by profile. |
| WASM | Fallback surface | Fails closed or is unavailable until an artifact is verified. |

## Contracts and references

- [Runtime API](../reference/runtime-api.md) defines the public runtime surface.
- [Persistence](./persistence.md) explains verified program-store behavior and
  its profile limits.
- [Scheduler](./scheduler.md) describes runtime scheduling semantics and
  current evidence boundaries.
- [Source of truth](../reference/source-of-truth.md) identifies canonical
  versions and release contracts.
- [Board reference](../reference/boards.md) lists profiles, capabilities, and
  their evidence tier.

## Safety and evidence boundaries

- Target timing, electrical output behavior, power-cut recovery, and HIL
  results require evidence for the exact board profile.
- The `RETAIN` region and HAL primitives exist, but source-level RETAIN
  declarations are currently rejected and target retention is not qualified.
- Restore publishes the artifact as logically stopped/READY. Output behavior
  before execution is target-profile-specific and requires recorded evidence.
- The runtime does not claim safety-PLC certification.

Use the board reference and the selected profile's recovery procedure before
commissioning or performing a physical operation.
