---
title: "Ladder Diagram (LD) reference"
sidebar_label: "Ladder Diagram"
description: "What of Ladder Diagram works, from the executed conformance tests."
tags: [reference, generated]
---

# Ladder Diagram (LD) reference

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-ld. Do not edit. >>> */}

The status of every element on this page is read off the executed conformance tests, not written by hand: an element works when at least one conformance case that names it builds, runs and holds its expected values, and no case of it is on the list of known failures. CI runs the whole suite on every change. This page covers 7 elements: 5 work, 2 are rejected on purpose and 0 are not yet proven.

## Editor

Ladder Diagram is drawn in the rung editor of ZPLC: contacts, coils, branches and blocks, with undo and validation while you draw. The Structured Text that the build generates from the rungs is read-only output.

A real screenshot of this editor, captured by automation from the current version of ZPLC, is published here when the capture exists. Until then the page shows no image: it never shows a drawing or a mock-up of the editor.

## Elements

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| LD: normally open and closed contacts; normal, negated, set and reset coils | Works | 2 | LNG-022 |
| LD: parallel branches | Works | 2 | LNG-021 |
| LD: edge contacts and edge coils | Works | 3 | LNG-022 |
| LD: blocks in a rung | Works | 2 | LNG-021, LNG-022 |
| LD: jumps and labels | Rejected with a message, decision open | 2 | LNG-002 |
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
| LD: jumps and labels | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | LNG-002 |
| EN/ENO | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | LNG-002 |

## Related pages

- [Text and visual editors](../ide/editors.md)
- [Function Block Diagram reference](./language-fbd.md)
- [Function block reference](./function-blocks.md)

{/* <<< END GENERATED: reference/language-ld <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
