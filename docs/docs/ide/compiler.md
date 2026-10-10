# Compiler Workflow

ZPLC uses a canonical compiler path for source and supported visual models.

## Quick path

1. Compile the folder-backed project.
2. Read diagnostics and the produced artifact identity.
3. Run temporal tests and native POSIX simulation against that artifact.
4. Only then consider the separate human hardware flow.

## Pipeline

```mermaid
flowchart LR
  ST[ST source] --> Compile[Canonical compiler]
  IL[IL source] --> Compile
  LD[LD model] --> Transpile[Validate and transpile]
  FBD[FBD model] --> Transpile
  SFC[SFC model] --> Transpile
  Transpile --> Compile
  Compile --> Artifact[.zplc artifact, diagnostics, metadata]
```

## What the compiler accepts

All languages share one backend, but each accepts only the constructs its editor,
transpiler, and compiler support. The languages do not have identical features
or identical debugging behavior. Check the compiler output and a scenario result
for your own project.

## Debug map

The compiler writes a debug map beside the artifact. Two builds of the same
project give the same bytecode and the same map, byte for byte: the map carries
no build time, and `compilerVersion` is the version of the compiler package.
Each statement has the range of all the instructions it generates, with its line
and column, so any program counter inside a statement resolves to that
statement. The end of a function and the helper routines after the cycle belong
to no statement.

## Artifact boundary

The artifact is verified before runtime loading. A successful host compile does
not prove a board can flash, restore, meet timing, or drive an output. Those
need a run on that board; see [deployment](./deployment.md).
