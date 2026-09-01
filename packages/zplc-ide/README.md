# ZPLC Studio 2.0

ZPLC Studio is the Electron desktop workbench for folder-backed PLC projects.
It shares compiler, test, simulation, evidence, and restricted-tool contracts
with the CLI and local MCP adapter.

## What is available in the candidate

- ST editing plus LD, FBD, and SFC visual-model editing.
- A canonical compile path, temporal tests, and native POSIX simulation.
- Explicit, human-controlled build, flash, deploy, and RUN/STOP boundaries.
- Optional AI candidate changes with review, tool evidence, and human save.
- A degraded WASM fallback only where native simulation is unavailable.

Host simulation, a package build, and a board cross-build do not establish HIL,
electrical behavior, target timing, or production qualification. See the
[capabilities and evidence guide](../../docs/docs/reference/capabilities-evidence.md).

## Development

```bash
bun install --frozen-lockfile
bun run electron:dev
bun run test
bun run lint
bun run build
```

## Boundaries

Examples are copied to a folder selected by the user; Studio does not keep a
temporary project mode. AI and MCP cannot flash, deploy to hardware, force values,
change RUN/STOP, recover devices, open raw serial, or invoke a shell.

The local stdio adapter is invoked with `bun src/mcp/index.ts --workspace <absolute-real-directory>`. Add `--repository <absolute-real-directory>` only for catalogue/build inspection. Add `--user-data <absolute-real-directory>` only to expose the current user's bounded Learn mastery record; without that explicit directory `zplc://course/progress` is unavailable. Runtime trace and snapshot resources are stateless deterministic native POSIX replays, never a live runtime or HIL result.
