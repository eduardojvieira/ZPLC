---
sidebar_position: 2
---

# Instruction List (IL)

Instruction List (IL) is the low-level textual IEC 61131-3 path documented by ZPLC.

## Position of IL in ZPLC

IL is a **supported workflow path**, not a separate execution backend.

The real compiler flow is visible in `packages/zplc-ide/src/compiler/index.ts`:

- `parseIL(...)` parses IL source
- `transpileILToST(...)` normalizes it into ST
- the shared backend then compiles the resulting program to `.zplc`

```mermaid
flowchart LR
  IL[IL source] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[shared compiler backend]
  Compile --> ZPLC[.zplc]
```

## Why that matters

This is the honest public contract for v1.5.0:

- IL authoring is supported in the IDE
- IL compiles through the shared backend
- IL participates in simulation, deployment, and debug claims through the same workflow contract
- the runtime executes `.zplc`, not "raw IL"

## Canonical workflow example

```iecst
PROGRAM WorkflowIL
VAR
    Start : BOOL := TRUE;
    Timer : TON;
END_VAR
VAR_OUTPUT
    Out1 AT %Q0.0 : BOOL;
END_VAR

    LD Start
    ST Timer.IN
    CAL Timer(
        PT := T#250ms
    )
    LD Timer.Q
    ST Out1
END_PROGRAM
```

That example is also used in the canonical [v1.5 Language Suite](./examples/v1-5-language-suite.md).

## What this page should not overclaim

Do not describe IL as if it owned an isolated runtime or a separate product architecture.

The release-facing truth is simpler and better:

- IL is a first-class IDE workflow path
- IL converges into the same compiler/runtime contract as the other languages
- end-to-end parity still depends on the same release evidence gates as the rest of the language stack

## Related pages

- [Languages Overview](./index.md)
- [Structured Text (ST)](./st.md)
- [Standard Library](./stdlib.md)
- [v1.5 Language Suite](./examples/v1-5-language-suite.md)
