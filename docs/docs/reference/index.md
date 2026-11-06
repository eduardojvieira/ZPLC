---
slug: /reference
id: index
title: Reference
sidebar_label: Reference
description: 'Look a fact up: the languages, the functions and function blocks, the project and scenario files, the command line, the runtime and the boards.'
tags: [reference]
---

# Reference

Look a fact up here: a name, a field, a code, a pin. Most pages are generated from the source they describe, and each says which source, so they cannot drift from it. To learn how to do something, start from the [guides](../guides/simulate-and-debug.md) or from [Learn](../learn/index.md) instead.

## Find a page by what you need

| You need                                                              | Go to                                                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What a language element does, and whether the compiler accepts it      | [Structured Text](./language-st.md), [Instruction List](./language-il.md), [Ladder Diagram](./language-ld.md), [Function Block Diagram](./language-fbd.md), [Sequential Function Chart](./language-sfc.md) |
| The keys of the visual editors                                         | [Keyboard reference of the visual editors](./visual-editor-keyboard.md)                                                                                                                      |
| The signature of a function, or the pins of a function block           | [Functions](./functions.md) and [function blocks](./function-blocks.md)                                                                                                                      |
| A field of `zplc.json`                                                 | [Project file](./project-file.md)                                                                                                                                                            |
| How to write a scenario test                                           | [Scenario file format](./scenario-file.md)                                                                                                                                                   |
| A command of `zplc-cli`, or a tool of the MCP server                   | [Command line](./cli.md) and [MCP tools and resources](./mcp.md)                                                                                                                             |
| What a build error code means                                          | [Diagnostic codes](./diagnostic-codes.md)                                                                                                                                                    |
| A C function, a type or a header of the runtime                        | [Runtime API](./runtime-api.md)                                                                                                                                                              |
| A message of the session or device protocol                            | [Runtime session protocol](./runtime-protocol.md) and [Device link protocol](./device-protocol.md)                                                                                           |
| A firmware option                                                      | [Kconfig options](./kconfig.md)                                                                                                                                                              |
| A command of the firmware console                                      | [Shell commands](./shell-commands.md)                                                                                                                                                        |
| The pins, channels and memory of a board                               | [Supported boards](./boards.md)                                                                                                                                                              |
| How far a board has been shown to work                                 | [Hardware support](./capabilities-evidence.md)                                                                                                                                               |
| The inputs of a reproducible firmware build                            | [Zephyr workspace setup](./zephyr-workspace-setup.md)                                                                                                                                        |
| The parts and wiring of a learner board                                | [Learner kits](./learner-kits/index.md)                                                                                                                                                      |
| Which file is the authority for a kind of fact                         | [Source of truth](./source-of-truth.md)                                                                                                                                                      |

## Generated and hand-written pages

A generated page carries a `GENERATED` marker that names its generator, and it must never be edited by hand: change the source, then run `bun run docs:generate`. The hand-written pages of this section are this index, the [source of truth](./source-of-truth.md), the [learner kits](./learner-kits/index.md) index and the [hardware support](./capabilities-evidence.md) levels.
