---
slug: /contributing/roadmap
id: roadmap
title: Roadmap
sidebar_label: Roadmap
description: What ZPLC 2.0 has finished, what comes next and what comes later, with no dates.
tags: [contributing, roadmap]
---

# Roadmap

This page says what ZPLC 2.0 has finished, what stands between it and the release, and what is not planned for it. A step is a gate, not a calendar slot: it closes when its checks pass, so the page carries no dates. Use it to pick work, or to judge whether ZPLC fits your project today.

## Finished

Each item is merged and backed by a check that CI or a repeatable local command runs.

- **Five languages.** Structured Text, Instruction List, Ladder Diagram, Function Block Diagram and Sequential Function Chart compile for the same runtime, each with its own editor, online values and breakpoints. The [conformance matrix](../reference/capabilities-evidence.md) records which elements work, which are rejected on purpose and which are not proven.
- **Simulation and debugging.** The simulator is the native runtime itself, bundled with the application. It supports pause, one-cycle step, watch, force, a live I/O faceplate and scenario tests that also run from `zplc-cli` in CI.
- **Learn.** A course of 68 lessons in 12 modules, in English and Spanish, with a Ladder path from zero whose lessons open on reading pages with figures and labs you can try. See [Learn](../learn/index.md).
- **Boards.** Seven board profiles cross-build with a flash and RAM budget each, and a port conformance suite checks the hardware abstraction layer. The level of every board is `cross-build`; see [Hardware support](../reference/capabilities-evidence.md).
- **A firmware test method on Linux.** The Zephyr suites run on `native_sim` and on QEMU Cortex-M targets. See [Firmware testing](../development/firmware-testing.md).
- **One generated source for the binary contract**, with a draft counter that the compiler, the loader, the runtime and the application compare.
- **A release pipeline.** One workflow builds the Linux, macOS and Windows installers, collects checksums and uploads them to a draft release, and a rehearsal mode runs it end to end without publishing.
- **AI help inside the workspace.** An MCP server lets an assistant read, edit, build and test a project. It never flashes, deploys, forces, starts or stops anything.
- **Truthful public text.** Documentation checks fail the build on a name, path, count or capability that nothing backs.

## Before 2.0 ships

- **Bench records.** A person follows the recorded procedure on the Raspberry Pi Pico and on the ESP32-S3-DevKitC-1, and files a record with the image it ran. Until then every board stays at `cross-build`, and no page may claim more. See [Hardware in the loop](../development/hardware-in-the-loop.md).
- **Distribution channels.** The installers are unsigned. A Homebrew tap, a Microsoft Store entry and similar channels need accounts that the project has not set up, so [Getting Started](../getting-started/index.md) names no channel that does not exist.
- **The documentation rewrite**, in English and Spanish, with every docs check green.
- **The release gates** on the tagged commit.

## Not planned for 2.0

- A safety assessment. No part of ZPLC has been assessed against a safety standard; see [Safety and limitations](../safety-and-limitations.md).
- Production qualification of a board.
- Timing guarantees. No scan time or jitter has been measured on a board, so no page states one.

## When you can use it

| You want to                              | Today                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Write and simulate a program             | Yes, in the desktop application on Windows, macOS and Linux (host and native simulation levels). |
| Learn PLC programming with no hardware   | Yes, with the Learn course.                                                                     |
| Build the runtime for a board            | Yes, at `cross-build`: the image builds and fits, and nothing more is claimed.                   |
| Rely on a board in the field             | Not yet. Wait for a bench record of your board, and read the safety page first.                 |

The current prerelease keeps the claims that the [release notes](../release-notes/index.md) state.
