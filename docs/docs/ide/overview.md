# Studio Architecture and Project Model

Studio presents a folder-backed project to editors and tools; the renderer does
not own privileged filesystem, shell, or device access.

## Quick path

Open a project folder, inspect its target and tasks, edit a source file, then
compile through the Tool API. Export a reviewed v2 folder rather than relying on
an implicit legacy rewrite.

## Boundaries

| Layer | Responsibility |
| --- | --- |
| Renderer | Workbench, visual models, diagnostics, evidence presentation. |
| Preload/main | Validated, narrow filesystem and supervised runtime operations. |
| Compiler | Canonical source/visual-model compilation to `.zplc`. |
| Runtime adapters | Native POSIX simulation or a connected compatible runtime. |

## Project configuration

`zplc.json` names project metadata, target, tasks, and sources. A board choice
is checked against the catalogued profile during an operation; it does not
automatically import a capability model or certify a wiring configuration.

Examples are copied to a destination folder chosen by the user. There is no
virtual or memory project mode. See [migration](./migration-v1-to-v2.md) for
