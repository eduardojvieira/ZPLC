---
slug: /contributing/roadmap
id: roadmap
title: Roadmap
sidebar_label: Roadmap
description: What ZPLC 2.0 has finished, what comes next and what comes later, with no dates.
tags: [contributing, roadmap]
---

# Roadmap

ZPLC 2.0 is built in phases. A phase is a gate, not a calendar slot: it closes
when its checks pass, so this page carries no dates. It tells you what exists,
what is being worked on and what has not started, so that you can pick work or
judge whether ZPLC fits your project today.

## Done

These items are merged and covered by a check that CI or a repeatable local
command runs.

- **CI on the 2.0 line with one list of expected failures.** A failing test must
  be listed with the requirement that will fix it, and the list can only shrink.
- **A conformance suite.** Structured Text programs are compiled, loaded into the
  real VM and their memory is asserted.
- **Studio stopgaps.** Closing a file or the window with unsaved work asks first,
  each text file keeps its own undo history, and a failed build shows the
  compiler's own message with its line and column.
- **A release pipeline.** One workflow builds the Linux, macOS and Windows
  installers, collects checksums and uploads them to a draft release.
- **Truthful public text.** Pages that stopped mid-sentence are completed in
  English and Spanish, and the README states what ZPLC does today.
- **A firmware test method on Linux.** The Zephyr suites run on `native_sim` in
  64 and 32 bits and on QEMU Cortex-M3 and M0, with a flash and RAM budget per
  board. See [Firmware testing](../development/firmware-testing.md).
- **One generated source for the binary contract**, and a draft counter that the
  compiler, the loader, the runtime and Studio compare.
- **Numeric and visual-language corrections** in the compiler: signed `INT`
  widths, signed comparisons, `REAL` arithmetic, `TIME` literals, and the
  Instruction List, Ladder and SFC defects that conformance cases exposed.

## Next

- **Close the rest of the verification foundation.** Sandbox closure for programs
  that read or write outside their regions, a fuzzer that runs the programs the
  loader accepts, opcode coverage for the VM, a render-test environment for
  Studio, and the cost of 64-bit arithmetic measured on the Raspberry Pi Pico.
- **Correct Structured Text across a whole project.** Types, structures,
  enumerations, several files, errors with their position, and an open, edit,
  build and simulate path with no hidden step.

## Later

| Phase | What it delivers |
|---|---|
| New shell and five languages | A rebuilt Studio view layer, and Instruction List, Ladder, FBD and SFC that compile correctly, debug and monitor. |
| Learn in simulation | A course that opens from the Welcome screen and grades honestly, in English and Spanish, with no hardware. |
| Runtime trust and the first board | The same scheduler semantics on the simulator and the target, safe outputs on a fault, retentive memory that survives a power cycle, and the first bench record on the Raspberry Pi Pico. |
| Communications and the second board | Modbus, MQTT, Sparkplug B and the cloud blocks repaired, and bench evidence on the ESP32-S3. |
| Complete language and complete course | The conformance matrix closed and the course finished on both tracks. |
| Distribution, documentation and accessibility | Every installer channel delivered or submitted, the documentation finished in two languages, and accessibility closed. |
| General availability | The release gates met on the tagged commit. |

## When you can use it

- **In simulation, to write Structured Text:** after the Structured Text
  correctness phase.
- **As a learner with no hardware:** after Learn in simulation.
- **On one board, the Raspberry Pi Pico:** after the runtime trust phase, with
  each claim pointing at its bench record.

Until a phase closes, the claims of the current prerelease stay as the
[release notes](../release-notes/index.md) and
[Hardware support](../reference/capabilities-evidence.md) state
them.
