---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text (ST) is the canonical semantic baseline for ZPLC.

## Canonical Role in v1.5

For v1.5.0:

- `ST` is the direct path into the shared compiler backend
- `IL`, `LD`, `FBD`, and `SFC` are release-facing workflow paths when they converge into the same backend contract
- the runtime still executes `.zplc`, not source-language-specific code

Use the [v1.5 Language Suite](./examples/v1-5-language-suite.md) as the shared parity
reference when validating language claims.

## Why ST matters architecturally

`packages/zplc-ide/src/compiler/index.ts` treats ST differently from the other language paths:

- `ST` bypasses the transpilation stage
- the other languages normalize into ST before compilation

That makes ST the best place to understand the public automation semantics that the runtime is expected to execute.

## Typical usage in ZPLC

ST is the natural fit for:

- textual control logic
- arithmetic and data manipulation
- calling stdlib functions and function blocks directly
- action bodies that originate from higher-level visual flows

## Minimal canonical example

```st
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR
Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
```

## What this page should and should not claim

This page is safe ground for:

- ST as the direct compiler input path
- ST as the semantic baseline for the other languages
- ST examples that match the shared language workflow tests
- stdlib usage that is backed by the compiler stdlib registry

This page should **not** pretend ST has special runtime privileges. It compiles into the same
bytecode contract as the other language paths.

## Common ST building blocks in the current repo

The compiler and stdlib surfaces show ST being used with:

- variables and task-oriented program bodies
- timers such as `TON`, `TOF`, and `TP`
- counters such as `CTU`, `CTD`, and `CTUD`
- string functions such as `LEN`, `CONCAT`, `LEFT`, `RIGHT`, and `MID`
- communication FB calls where the runtime/compiler contract supports them

## Standard library entry point

See [Standard Library](./stdlib.md) for the built-in functions and function blocks grounded in
`packages/zplc-compiler/src/compiler/stdlib/index.ts`.
