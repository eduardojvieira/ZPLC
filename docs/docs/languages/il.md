---
sidebar_position: 2
---

# Instruction List (IL)

Instruction List (IL) is a low-level textual IEC 61131-3-style workflow in ZPLC. It uses an implicit accumulator model and follows the repository's IL parser/transpiler path.

## Compilation path

The IDE parses IL and transpiles it to Structured Text (ST), then sends that generated ST through the compiler to produce `.zplc` bytecode.

```mermaid
flowchart LR
  IL[IL source] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[ZPLC compiler]
  Compile --> ZPLC[.zplc]
```

This is a source-to-generated-ST workflow. Validate the generated result, diagnostics, and target capability profile; it does not establish an arbitrary IL/ST round trip or identical feature coverage with ST.

## Runtime and debugging limits

IL uses the common compiler destination, but execution cost, standard-library availability, stepping, watches, breakpoints, and hardware behavior depend on the active runtime and profile. POSIX simulation is host-side logical evidence only. Use target or HIL evidence for claims about a physical device.

## Example: IL timer logic

This example evaluates `Start`, calls `TON`, and writes an output flag:

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

## Related pages

- [Languages Overview](./index.md)
- [Structured Text (ST)](./st.md)
- [Standard Library](./stdlib.md)
- [Language Suites & Examples](./examples/v1-5-language-suite.md)
