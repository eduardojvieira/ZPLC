---
title: "Instruction List (IL) reference"
sidebar_label: "Instruction List"
description: "What of Instruction List works, from the executed conformance tests."
tags: [reference, generated]
---

# Instruction List (IL) reference

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-il. Do not edit. >>> */}

The status of every element on this page is read off the executed conformance tests, not written by hand: an element works when at least one conformance case that names it builds, runs and holds its expected values, and no case of it is on the list of known failures. CI runs the whole suite on every change. This page covers 5 elements: 4 work, 1 are rejected on purpose and 0 are not yet proven.

## Editor

Instruction List is written in a text editor. The source is parsed and translated to Structured Text before it is compiled, so the data types, functions and function blocks are those of Structured Text.

![The Instruction List editor of ZPLC with the Blinky example open, showing the program and its variable declarations, in English](/img/editors/il-en.png)

The picture is a real screenshot of this editor, captured by automation from the current version of ZPLC with a small example program open.

## Elements

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| The 34 implemented operators on a DINT or BOOL accumulator, including function-block calls CAL, CALC and CALCN with named parameters and the returns RET, RETC and RETCN | Works | 5 | LNG-019, LNG-020 |
| Unknown mnemonic | Rejected with a message | 1 | LNG-017 |
| JMP, JMPC, JMPCN, labels | Works | 3 | LNG-018 |
| Parenthesised operations | Works | 3 | LNG-019 |
| Typed accumulator; calls of functions (function-block calls exist, above); shifts | Works | 3 | LNG-019 |

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
| Unknown mnemonic | Rejected with a message | Not supported: the build refuses it with a message that names the position. | LNG-017 |

## Related pages

- [Instruction List guide](../languages/il.md)
- [Structured Text reference](./language-st.md)

{/* <<< END GENERATED: reference/language-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
