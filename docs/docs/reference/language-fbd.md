---
title: "Function Block Diagram (FBD) reference"
sidebar_label: "Function Block Diagram"
description: "What of Function Block Diagram works, from the executed conformance tests."
tags: [reference, generated]
---

# Function Block Diagram (FBD) reference

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-fbd. Do not edit. >>> */}

The status of every element on this page is read off the executed conformance tests, not written by hand: an element works when at least one conformance case that names it builds, runs and holds its expected values, and no case of it is on the list of known failures. CI runs the whole suite on every change. This page covers 5 elements: 2 work, 3 are rejected on purpose and 0 are not yet proven.

## Editor

Function Block Diagram is drawn in the diagram editor of ZPLC: blocks with typed pins and connections, with undo and validation while you draw. The Structured Text that the build generates from the diagram is read-only output.

![The Function Block Diagram editor of ZPLC with the Blinky example open, showing its blocks and connections, in English](/img/editors/fbd-en.png#gh-light-mode-only)

![The Function Block Diagram editor of ZPLC with the Blinky example open, showing its blocks and connections, in English](/img/editors/fbd-en-dark.png#gh-dark-mode-only)

The picture is a real screenshot of this editor, captured by automation from the current version of ZPLC with a small example program open.

## Elements

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| FBD: gates, comparison, arithmetic, selection, timers, counters, triggers, bistables | Works | 5 | LNG-023 |
| FBD: unwired inputs | Rejected with a message | 2 | LNG-023 |
| FBD: feedback loops | Rejected with a message | 1 | LNG-023 |
| EN/ENO | Rejected with a message, decision open | 1 | LNG-002 |
| User function blocks and functions in LD and FBD | Works | 3 | LNG-008 |

## I/O addressing

A variable is bound to a place of the process image with `AT`, or with an entry of `io` in the [project file](./project-file.md). An address is written `%`, the area, the size and the position; the short form `%I0.0` is `%IX0.0`, and addresses are not case sensitive. The same addresses are used in every language: Instruction List writes them in its declarations and the graphical languages declare them in the variable table of the program.

| Address | Holds | Area | Byte offset | Region base |
| --- | --- | --- | --- | --- |
| `%IX<byte>.<bit>` | one bit | inputs | `<byte>` | `0x0000` (4096 bytes) |
| `%IB<n>` | a byte | inputs | `n` | `0x0000` (4096 bytes) |
| `%IW<n>` | a 16-bit word | inputs | `2 * n` | `0x0000` (4096 bytes) |
| `%ID<n>` | a 32-bit double word | inputs | `4 * n` | `0x0000` (4096 bytes) |
| `%QX<byte>.<bit>` | one bit | outputs | `<byte>` | `0x1000` (4096 bytes) |
| `%QB<n>` | a byte | outputs | `n` | `0x1000` (4096 bytes) |
| `%QW<n>` | a 16-bit word | outputs | `2 * n` | `0x1000` (4096 bytes) |
| `%QD<n>` | a 32-bit double word | outputs | `4 * n` | `0x1000` (4096 bytes) |
| `%MX<byte>.<bit>` | one bit | memory (work region) | `<byte>` | `0x2000` (8192 bytes) |
| `%MB<n>` | a byte | memory (work region) | `n` | `0x2000` (8192 bytes) |
| `%MW<n>` | a 16-bit word | memory (work region) | `2 * n` | `0x2000` (8192 bytes) |
| `%MD<n>` | a 32-bit double word | memory (work region) | `4 * n` | `0x2000` (8192 bytes) |

## Not supported

These elements do not work today. Each is rejected with a located message or is not yet proven; none of them is silently accepted.

| Element | Status | What happens | Requirement |
| --- | --- | --- | --- |
| FBD: unwired inputs | Rejected with a message | Not supported: the build refuses it with a message that names the position. | LNG-023 |
| FBD: feedback loops | Rejected with a message | Not supported: the build refuses it with a message that names the position. | LNG-023 |
| EN/ENO | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | LNG-002 |

## Related pages

- [Text and visual editors](../ide/editors.md)
- [Ladder Diagram reference](./language-ld.md)
- [Function reference](./functions.md)
- [Function block reference](./function-blocks.md)

{/* <<< END GENERATED: reference/language-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
