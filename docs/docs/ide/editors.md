# Visual and Text Editors

The IDE exposes both text-first and model-first authoring surfaces.

That matters because the release claim is about **workflow support**, not just file extensions.

## Text editors

The text-first surfaces cover:

- `ST` files
- `IL` files

These editors feed directly into the compiler path defined in `packages/zplc-ide/src/compiler/index.ts`.

## Model-backed editors

The model-first surfaces cover:

- `LD`
- `FBD`
- `SFC`

The IDE keeps dedicated model parsers for those languages and transpiles them into ST before bytecode generation.

## Editor architecture

```mermaid
flowchart LR
  User[User edits file or model]
  Model[LD/FBD/SFC model or ST/IL text]
  Validate[IDE validation + project symbols]
  Transpile[Optional transpilation to ST]
  Compile[Shared compiler backend]

  User --> Model
  Model --> Validate
  Validate --> Transpile
  Transpile --> Compile
```

## Ladder Diagram (LD)

`LD` authoring is model-based and then normalized through the transpiler path.

In practice, the editor has to preserve three things:

- rung topology
- symbol bindings
- a deterministic mapping into the shared compile contract

`languageWorkflow.test.ts` includes a canonical LD model that proves this path compiles through the shared backend.

## Function Block Diagram (FBD)

`FBD` is the clearest example of the IDE/compiler split.

- the editor owns block placement and wiring
- the transpiler owns conversion into a compiler-friendly ST form
- the runtime still executes `.zplc`, not a separate FBD backend

This is also why communication and stdlib blocks must ultimately agree with the compiler/runtime contract.

## Sequential Function Chart (SFC)

`SFC` is represented as a state-oriented model with steps, transitions, and action bodies.

The release-facing architectural point is simple:

- SFC authoring is supported in the IDE
- SFC behavior is normalized before execution
- the runtime remains bytecode-oriented, not SFC-native

## Shared editor responsibilities

All editors must stay aligned with the same project model:

- symbol access from project files and task assignments
- compileability into the shared backend
- debug-map compatibility where the workflow claims it
- runtime-aware behavior when switching between simulation and hardware sessions

## Practical reading order

If you are evaluating the IDE honestly for v1.5, read these pages together:

1. this page for authoring surfaces
2. [Compiler Workflow](./compiler.md) for normalization and bytecode generation
3. [Languages Overview](/languages) for support boundaries
4. [Deployment & Runtime Sessions](./deployment.md) for simulation/hardware execution paths
