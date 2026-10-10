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

## How the layers talk

The renderer reaches the main process only through the preload, and only through
the channels that `packages/zplc-ide/electron/ipcContract.ts` names. That module
is the one definition: the main process, the preload and the renderer all take
their channel names from it, so there is no second copy to drift.

- **One handler per channel.** The main process answers each channel of the
  contract with exactly one handler, and refuses to start if a channel has none or
  a handler has no channel.
- **Sender and message first.** Every call is checked before its handler runs: the
  sender must be the trusted Studio document of the window, and the arguments must
  fit the schema of that channel. Anything else is denied with one fixed message.
- **A narrow preload.** The preload exposes one method per operation and nothing
  generic (no `send`, no raw channel access, no path of the machine). It is built
  as a single script that requires nothing but `electron`.
- **Fixed processes.** The processes started for compile, test and firmware
  build (the native runtime, `west build`, the toolchain probes) come from a closed
  list of fixed argument vectors, are started without a shell and never take a
  command or an argument from the renderer.

Evidence level: host. `electron/ipcRegistry.test.ts` runs the real handler table
and registry against stand-ins for Electron and the stores, `electron/preload.test.ts`
runs the real preload against a stand-in and compares what it invokes with the
contract, and `electron/spawnAllowList.test.ts` shows the argument vectors
(requirement IDE-017). It is not packaged-application evidence.

## Project configuration

`zplc.json` names project metadata, target, tasks, and sources. A board choice
is checked against the catalogued profile during an operation; it does not
automatically import a capability model or certify a wiring configuration.

Examples are copied to a destination folder chosen by the user. There is no
virtual or memory project mode. See [migration](./migration-v1-to-v2.md) for
how to bring a version 1 project into a folder.
