---
title: "Structured Text (ST) reference"
sidebar_label: "Structured Text"
description: "What of Structured Text works, from the executed conformance tests."
tags: [reference, generated]
---

# Structured Text (ST) reference

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-st. Do not edit. >>> */}

The status of every element on this page is read off the executed conformance tests, not written by hand: an element works when at least one conformance case that names it builds, runs and holds its expected values, and no case of it is on the list of known failures. CI runs the whole suite on every change. This page covers 87 elements: 75 work, 11 are rejected on purpose and 1 are not yet proven.

## Editor

Structured Text is written in the primary text editor of ZPLC, which shows the diagnostics of the build with their line and column and navigates from a diagnostic to its source.

![The Structured Text editor of ZPLC with the Blinky example open, showing the program and its variable declarations, in English](/img/editors/st-en.png)

The picture is a real screenshot of this editor, captured by automation from the current version of ZPLC with a small example program open.

## Elements

### Data types

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| BOOL | Works | 3 | CMP-025 |
| USINT, UINT | Works | 3 | CMP-012 |
| SINT, INT | Works | 14 | CMP-011 |
| DINT | Works | 8 | CMP-011, CMP-016 |
| UDINT | Works | 10 | CMP-012 |
| LINT, ULINT, LWORD | Works | 34 | CMP-015 |
| REAL | Works | 11 | CMP-013 |
| LREAL | Works | 21 | CMP-015 |
| TIME | Works | 6 | CMP-017 |
| DATE, TOD, DT | Works | 5 | CMP-017 |
| LTIME, LDATE, LTOD, LDT | Rejected with a message | 4 | CMP-003 |
| CHAR, WCHAR | Rejected with a message | 2 | CMP-003 |
| STRING, STRING\[n\] | Works | 4 | CMP-021 |
| WSTRING | Works | 2 | CMP-021 |
| BYTE, WORD, DWORD | Works | 8 | CMP-004, CMP-014 |
| Arrays, one to three dimensions, of BOOL, INT, DINT, REAL | Works | 2 | CMP-022 |
| Arrays with negative or constant bounds; arrays of structures, function blocks, strings, 64-bit types | Works | 7 | CMP-022 |
| Arrays of arrays | Rejected with a message, decision open | 1 | CMP-006 |
| Array initialisers | Works | 2 | CMP-022, CMP-025 |
| Array bounds checking | Works | 1 | CMP-023 |
| STRUCT | Works | 9 | CMP-019 |
| Enumerations | Works | 5 | CMP-020 |
| Enumerations with a base type; subranges | Rejected with a message, decision open | 2 | CMP-006 |
| Type aliases; several types in one TYPE block | Works | 2 | CMP-030 |
| REF\_TO, REF(), ^ | Works | 2 | CMP-024 |
| POINTER TO, ADR | Rejected with a message, decision open | 2 | CMP-006 |

### Literals

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| Decimal, real, exponent, TRUE, FALSE | Works | 4 | CMP-011, CMP-013 |
| T#, D#, TOD#, DT#, string literals | Works | 4 | CMP-017, CMP-021 |
| Compound and fractional time literals | Works | 4 | CMP-017 |
| Based literals 2#, 8#, 16#; digit separators | Works | 5 | CMP-031 |
| Typed literals such as INT#5 | Works | 1 | CMP-031 |

### Declarations and variables

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| VAR, VAR\_INPUT, VAR\_OUTPUT | Works | 3 | CMP-025 |
| VAR\_IN\_OUT | Works | 1 | CMP-028 |
| VAR\_TEMP | Works | 2 | CMP-027, CMP-030 |
| VAR\_GLOBAL | Works | 6 | CMP-025, CMP-042 |
| VAR\_GLOBAL CONSTANT | Works | 1 | CMP-026 |
| VAR CONSTANT | Works | 1 | CMP-026 |
| VAR\_EXTERNAL | Works | 1 | CMP-030 |
| VAR\_ACCESS, VAR\_CONFIG, PERSISTENT | Rejected with a message, decision open | 2 | CMP-006 |
| RETAIN, NON\_RETAIN | Works | 2 | CMP-029, RT-025 |
| AT %I, AT %Q (bit, byte, word, double word) | Works | 4 | CMP-047, IO-003 |
| AT %M | Works | 1 | CMP-044 |
| Several names in one declaration | Works | 1 | CMP-030 |
| Initial values | Works | 4 | CMP-025 |

### Program organisation units

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| PROGRAM (one per file) | Works | 2 | CMP-042 |
| FUNCTION | Works | 16 | CMP-027, CMP-035, CMP-036 |
| FUNCTION\_BLOCK with state and several instances | Works | 4 | CMP-038 |
| Function-block instances inside function blocks; arrays of instances | Works | 2 | CMP-038 |
| Function-block call with named inputs | Works | 3 | CMP-037 |
| Function-block call with =\> | Works | 2 | CMP-037 |
| Positional function-block call | Rejected with a message, decision open | 1 | CMP-006 |
| Methods, THIS | Works | 4 | CMP-041 |
| EXTENDS, OVERRIDE, FINAL, SUPER^ | Works | 6 | CMP-041 |
| Interfaces, IMPLEMENTS | Works | 8 | CMP-041 |
| PUBLIC, PRIVATE, PROTECTED, ABSTRACT | Works | 3 | CMP-041 |
| Properties, namespaces, ACTION blocks | Rejected with a message, decision open | 3 | CMP-006 |
| POUs and globals shared across files; libraries | Works | 7 | CMP-042, CMP-046 |

### Statements and operators

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| IF, WHILE, REPEAT, EXIT, CONTINUE | Works | 5 | CMP-039 |
| FOR | Works | 6 | CMP-039 |
| CASE | Works | 8 | CMP-040 |
| RETURN | Works | 4 | CMP-036 |
| Function call as a statement; empty statement | Works | 3 | CMP-035, CMP-032 |
| + - \* / MOD and comparisons | Works | 11 | CMP-011, CMP-012, CMP-013 |
| AND, OR, XOR, NOT | Works | 5 | CMP-014 |
| \*\*, &, bit access w.0 | Works | 3 | CMP-032 |
| Comments (\* \*) | Works | 1 | CMP-009 |
| Comments /\* \*/ | Works | 1 | CMP-032 |

### Conversions and standard functions

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| Implicit widening conversion | Works | 13 | CMP-005 |
| INT\_TO\_REAL, REAL\_TO\_INT, BOOL\_TO\_INT, INT\_TO\_BOOL, TRUNC, ROUND | Works | 12 | CMP-057 |
| All other X\_TO\_Y conversions | Works | 9 | CMP-057 |
| ABS, MAX, MIN, LIMIT, SEL, MUX, SQRT | Works | 13 | CMP-011, CMP-058 |
| Trigonometric, logarithmic and exponential functions | Works | 9 | CMP-058 |
| SHL, SHR, ROL, ROR and the word logic functions | Works | 7 | CMP-014, CMP-058 |
| String functions (14) | Works | 5 | CMP-021 |
| UPTIME, CYCLE\_TIME, WATCHDOG\_RESET | Works | 2 | CMP-058, RT-034 |
| Function forms of operators (ADD, MUL, GT, EQ, MOVE) | Rejected with a message, decision open | 1 | CMP-006 |

### Function blocks

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| TON | Works | 4 | CMP-057 |
| TOF | Works | 2 | CMP-057 |
| TP | Works | 4 | CMP-057 |
| CTU, CTD, CTUD | Works | 16 | CMP-058 |
| R\_TRIG, F\_TRIG, SR, RS | Works | 3 | CMP-058 |
| BLINK, PWM, PULSE, HYSTERESIS, DEADBAND, LAG\_FILTER, RAMP\_REAL, INTEGRAL, DERIVATIVE, PID\_Compact, FIFO, LIFO (not in the standard) | Works | 23 | CMP-058 |
| Communication and cloud blocks (12) | Not verified | 0 | COM-001, COM-002, COM-003, COM-004, COM-005, COM-006, COM-007, COM-008, COM-009 |

### Tasks and configuration

| Element | Status | Executed cases | Requirement |
| --- | --- | --- | --- |
| Cyclic tasks in zplc.json (interval, priority, programs) | Works | 5 | CMP-047, RT-015 |
| Output ownership check between programs; memory limit check | Works | 5 | CMP-047, CMP-043 |
| Event-triggered tasks | Rejected with a message, decision open | 1 | RT-015 |
| Textual CONFIGURATION, RESOURCE, TASK | Rejected with a message, decision open | 1 | CMP-006 |

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
| LTIME, LDATE, LTOD, LDT | Rejected with a message | Not supported: the build refuses it with a message that names the position. | CMP-003 |
| CHAR, WCHAR | Rejected with a message | Not supported: the build refuses it with a message that names the position. | CMP-003 |
| Arrays of arrays | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| Enumerations with a base type; subranges | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| POINTER TO, ADR | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| VAR\_ACCESS, VAR\_CONFIG, PERSISTENT | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| Positional function-block call | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| Properties, namespaces, ACTION blocks | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| Function forms of operators (ADD, MUL, GT, EQ, MOVE) | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |
| Communication and cloud blocks (12) | Not verified | No conformance case that runs covers it yet, so nothing is claimed about its behaviour. | COM-001, COM-002, COM-003, COM-004, COM-005, COM-006, COM-007, COM-008, COM-009 |
| Event-triggered tasks | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | RT-015 |
| Textual CONFIGURATION, RESOURCE, TASK | Rejected with a message, decision open | Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision. | CMP-006 |

## Related pages

- [Structured Text guide](../languages/st.md)
- [Function reference](./functions.md)
- [Function block reference](./function-blocks.md)

{/* <<< END GENERATED: reference/language-st <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
