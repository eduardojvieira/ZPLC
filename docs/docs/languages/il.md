---
sidebar_position: 2
---

# Instruction List (IL)

Instruction List (IL) is the low-level textual IEC 61131-3 programming language supported by ZPLC. It resembles assembly language, operating on a single implicit accumulator register.

## Position of IL in ZPLC

In ZPLC, writing in Instruction List does not mean you are confined to an archaic or restricted execution environment. IL enjoys **first-class workflow support** equivalent to any modern language.

When you click "Compile", the ZPLC IDE takes your IL source code, parses it, and transpiles it directly into Structured Text (ST). From there, it is passed into the unified compiler backend to generate optimized `.zplc` bytecode.

```mermaid
flowchart LR
  IL[IL source] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[Shared ZPLC Compiler]
  Compile --> ZPLC[.zplc]
```

## Why That Matters

By converging IL into the same pipeline as ST and the visual languages, ZPLC ensures:
- You can freely use all Standard Library blocks (Timers, Counters, Math) within your IL routines.
- Instruction List snippets execute with the exact same deterministic performance profiles as Modern ST code.
- You can simulate and debug your IL code (using breakpoints, steppers, and watch variables) natively in the IDE.

## Example: IL Timer Logic

Here is an example demonstrating a standard Timer On-Delay (`TON`) in Instruction List. This logic relies on evaluating a "Start" condition and manipulating an output flag:

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

## Related Pages

- [Languages Overview](./index.md)
- [Structured Text (ST)](./st.md)
- [Standard Library](./stdlib.md)
- [Language Suites & Examples](./examples/v1-5-language-suite.md)
