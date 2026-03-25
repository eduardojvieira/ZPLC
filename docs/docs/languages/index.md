---
slug: /languages
id: index
title: Languages & Programming Model
sidebar_label: Languages Overview
description: Release-aligned overview of the IEC 61131-3 language workflows, support boundaries, and standard library surfaces in ZPLC.
tags: [languages, iec61131-3]
---

# Languages & Programming Model

ZPLC v1.5.0 documents five IEC 61131-3 language paths in the IDE:

- `ST`
- `IL`
- `LD`
- `FBD`
- `SFC`

## IEC 61131-3 Alignment

The standard defines five languages:
1. Structured Text (ST)
2. Instruction List (IL)
3. Ladder Diagram (LD)
4. Function Block Diagram (FBD)
5. Sequential Function Chart (SFC)

ZPLC uses **one canonical compile path**.

`ST` is the semantic baseline, and the other language surfaces normalize into the same
compiler/runtime contract before `.zplc` bytecode is produced.

That behavior is visible in `packages/zplc-ide/src/compiler/index.ts`:

- `ST` compiles directly
- `IL` is parsed and transpiled to ST first
- `LD`, `FBD`, and `SFC` are model-backed editors that also transpile to ST first

## Workflow Contract for Claimed Languages

The IDE exports the same workflow support flags for all five claimed languages:

- authoring
- compile
- simulate
- deploy
- debug

That declared support matrix is defined in `LANGUAGE_WORKFLOW_SUPPORT`, and
`packages/zplc-ide/src/compiler/languageWorkflow.test.ts` verifies the declared contract and
compiles canonical sources for all five language paths.

## Positioning of each language path

| Language | Position in ZPLC | Authoring surface | Execution reality |
|---|---|---|---|
| `ST` | semantic baseline | text editor | compiles directly to `.zplc` |
| `IL` | textual low-level workflow | text editor | parsed and transpiled before bytecode generation |
| `LD` | visual relay-style workflow | model-backed editor | transpiled before bytecode generation |
| `FBD` | visual dataflow workflow | model-backed editor | transpiled before bytecode generation |
| `SFC` | sequential/state-oriented workflow | model-backed editor | transpiled before bytecode generation |

The important architectural point is that the runtime executes `.zplc`, not a different VM per language.

## Discoverability and canonical examples

The release-facing example set lives in [v1.5 Language Suite](./examples/v1-5-language-suite.md).

Use it as the shared reference when checking whether a language claim is still honest.

Language-specific release-facing pages:

- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Standard Library](./stdlib.md)
- [v1.5 Language Suite](./examples/v1-5-language-suite.md)

## Bytecode Model

The `.zplc` format is a stack-based bytecode contract defined by the public runtime ISA.

If you need the binary and memory layout details, continue with:

- [Runtime ISA](../runtime/isa.md)
- [Runtime API](../reference/runtime-api.md)

## Standard Library

The compiler stdlib registry in `packages/zplc-compiler/src/compiler/stdlib/index.ts`
defines the built-in functions and function blocks that the language surfaces rely on.

Major categories currently exposed there include:

- Timers (`TON`, `TOF`, `TP`)
- Counters (`CTU`, `CTD`, `CTUD`)
- Edge and bistable blocks (`R_TRIG`, `F_TRIG`, `RS`, `SR`)
- String functions (`LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`)
- Math, scaling, and system functions
- Communication function blocks for Modbus and MQTT/cloud wrapper flows

See [Standard Library](./stdlib.md) for the release-facing summary.

## Support boundary for v1.5.0

The repo declares and tests workflow support for all five languages.

Final human sign-off for end-to-end language parity is still tracked separately under
`REL-002` in the release evidence matrix.
