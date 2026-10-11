---
slug: /reference
id: index
title: Reference
sidebar_label: Reference
description: "Look a fact up: the languages, the functions and function blocks, the project and scenario files, the command line, the runtime and the boards."
tags: [reference]
---

# Reference

Use this section to look a fact up. Most pages are generated from the source
they describe, so they cannot drift from it; each says which source it is read
from. To learn how to do something, start from the how-to guides instead.

## Languages

- [Structured Text reference](./language-st.md): what works, element by element, and what does not.
- [Instruction List](./language-il.md), [Ladder Diagram](./language-ld.md), [Function Block Diagram](./language-fbd.md) and [Sequential Function Chart](./language-sfc.md): the same, per language.

## Functions and function blocks

- [Functions](./functions.md) and [function blocks](./function-blocks.md): every name of the compiler registry, with its signature or pins and an example that is run by the documentation check.

## Projects and tools

- [Project file (`zplc.json`)](./project-file.md): every field.
- [Scenario file format](./scenario-file.md): events, expectations and limits.
- [Command line](./cli.md) and [MCP server](./mcp.md): every command, tool and resource.

## Runtime and firmware

- [Runtime API](./runtime-api.md): the C headers.
- [Runtime session protocol](./runtime-protocol.md), [Kconfig options](./kconfig.md) and [shell commands](./shell-commands.md).

## Boards

- [Hardware support](./capabilities-evidence.md): the levels of evidence and the level of every board.
- [Supported boards](./boards.md): the I/O channels, pins and footprint of each board, generated from the board manifest.
- [Zephyr workspace setup](./zephyr-workspace-setup.md): the inputs of a reproducible firmware build.
