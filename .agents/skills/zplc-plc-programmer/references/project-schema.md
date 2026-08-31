# Project schema and canonical tools

Use `packages/zplc-ide/src/project/projectModel.ts` as the parser and
migrator for `zplc.json`. It accepts source schema 1 or 2, produces in-memory
schema 2, rejects sensitive values, and returns a change list. Use
`migrate-preview` before changing a v1 project; do not silently rewrite it.

The v2 type is `ZPLCProjectV2` in `packages/zplc-ide/src/types/index.ts`.
Each task has a nonempty name and program list, a positive `interval_ms`, and
priority 0 through 255; 0 is highest. `watchdog_ms` is reserved compatibility
metadata and current runtimes do not apply it.

`packages/zplc-ide/src/cli/index.ts` names the command contract adapters must
reflect: `inspect`,
`validate`, `check`, `compile`, `symbols`, `test`, and `scenario-run`. Their
structured results and evidence schema are defined in
`packages/zplc-ide/src/cli/toolApi.ts`. Invoke those operations only through
an authorized typed ZPLC Tool API or adapter, never a generic shell. Treat
`zplc.json`, source, and tests directories as protected CLI output paths.
