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
contract, and `shared/spawnAllowList.test.ts` shows the argument vectors
(requirement IDE-017). It is not packaged-application evidence.

## Work that does not block the window

Compile, safety check, scenario tests and the candidate review run in a process of
their own, started for each request from a fixed list and stopped when the
request ends. The main process only sends the request and waits, so a long compile
or run cannot make the window unresponsive. **Cancel scenarios** in the Tests panel
asks the worker to stop; a worker that is busy in a compile and does not answer is
killed after a short grace period, and a deadline kills a worker that never
finishes. Killing the worker also ends the native runtime that it started. A
cancelled run is shown as cancelled and is recorded as cancelled in the execution
log; nothing of it is kept as a build.

Evidence level: host. `electron/toolWorkerHost.test.ts` runs real child processes:
a worker stuck in a busy loop is killed and is really gone while the caller keeps
running, and the real worker compiles a project and cancels a run of scenarios on
the native runtime. Journey 35 of `bun run test:journeys` cancels a long run in the
real application, sees the window answer throughout and finds no process of the
run left (requirement IDE-012). The packaged probes below also build the project and
run its scenarios in the packaged application, which starts the worker from its
archive and the native runtime from its resources.

## Security properties, shown by behaviour

The renderer is unprivileged, and these are what the running application does, not
what its source says:

- an inline script, and an inline event handler, that a page injects are blocked by
  the content security policy (`script-src 'self'` in a packaged build), and a
  request to another origin is refused by `connect-src`;
- a permission other than serial (notifications, location, camera, microphone,
  clipboard read, MIDI) is refused, while serial stays available to the Studio
  document;
- `window.open`, a link that opens a new window and navigation to another origin are
  refused, and the window keeps its document, its folder and its IPC afterwards;
- a project operation given a path with `..`, an absolute path or a drive path, a
  link to a file or to a folder that leaves the project, an over-size write, or the
  folder id of another window is refused, and nothing outside the project changes.

Evidence level: host. Journey 38 of `bun run test:journeys` makes these probes on
the development host (which serves its own scripts inline for hot reload, so the
inline-script probe is not made there). To make all of them on a packaged
application on Linux, build an unpacked package and run the probes against it:

```bash
bun run --cwd packages/zplc-ide build:assets
bun run --cwd packages/zplc-ide build
bun run --cwd packages/zplc-ide electron:compile
(cd packages/zplc-ide && bunx electron-builder --linux --dir)
ZPLC_PACKAGED_DIST="$PWD/packages/zplc-ide/dist-electron" bun run test:journeys
```

The packaged archive has no folder dialog, so the probes reach the project through a
recent-projects list written to the application's user-data directory first. They
cover Linux only: the packaged application on macOS and Windows is not probed
(requirement IDE-016 asks for all three).

## One project of record

Build, Test, Simulate and the candidate review all act on the folder that the
window shows, and on nothing else. The main process owns that folder: the native
folder dialog gives the window one folder and one opaque id for it. A build, a
safety check or a test run names the workspace and that id, and the main process
refuses the call when the id is not the window's folder now, or when the workspace
belongs to another folder (a workspace made for an earlier project, or a
`zplc.json` chosen from elsewhere). Opening another folder therefore makes every
earlier workspace unusable, with no linking step in between.

Evidence level: host. `electron/workspaceTestGateway.test.ts`,
`electron/ipcRegistry.test.ts` and `electron/security.test.ts` cover the rule, and
journey 34 of `bun run test:journeys` sends crafted build, safety-check and test
messages through the bridge of the real application after another folder was
opened and sees each of them refused (requirement IDE-002).

## Project configuration

`zplc.json` names project metadata, target, tasks, and sources. A board choice
is checked against the catalogued profile during an operation; it does not
automatically import a capability model or certify a wiring configuration.

Examples are copied to a destination folder chosen by the user. There is no
virtual or memory project mode. See [migration](./migration-v1-to-v2.md) for
how to bring a version 1 project into a folder.
