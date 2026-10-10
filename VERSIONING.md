# Versioning

ZPLC product versions, project schemas, bytecode ABIs, and runtime protocols
are independent compatibility axes. A product release does not automatically
change any of the others.

| Axis | Current documented direction | Compatibility rule |
|---|---|---|
| Product | Root `package.json` `version` | The root semantic version is the only consumed product version. `bun run check:versions` requires the compiler, HIL, and IDE manifests to match it. |
| Project schema | Schema 2 is current | Schema v1 remains supported only through an explicit, previewable migration to v2, tested with golden projects. |
| `.zplc` ABI | ABI 1.0 is retained initially | Change only for a required artifact incompatibility. |
| Native runtime protocol | 1.0 | Additive capabilities remain compatible; breaking wire changes require a major bump. |

The CMake product version uses the numeric `major.minor.patch` prefix because
`project(VERSION)` cannot represent prereleases. The full root semver is passed
to the core as `ZPLC_CORE_VERSION_STR`, including a prerelease suffix when one
is present. Release inputs support stable and prerelease versions; build
metadata (`+...`) is intentionally rejected. Direct, non-CMake C-core
compilation reports `unversioned` rather than a stale release number.

Product versioning does not change the `.zplc` ABI, project schema, or native
runtime protocol. Those axes require their own explicit compatibility decision.

Electron reports its packaged manifest version through `app.getVersion()`;
`check:versions` keeps that derived manifest aligned with the root source.

## Release versions

- The version has one source, the `version` of the root `package.json`. `bun scripts/release-version.ts <version>`
  writes it to the manifests that must match and to the compiler version of the debug map;
  `bun run check:versions` fails when any of them differs. The firmware, the native runtime and the standalone CLI
  report that same string.
- A prerelease is `rc.<n>`. After `2.0.0-rc.3` the sequence continues with `2.0.0-rc.4`, because an `alpha`,
  `beta` or `preview` name sorts below `rc.3` under semantic versioning. `scripts/release/resolve-release.ts`
  refuses any other prerelease name, and a release candidate below `2.0.0-rc.3`.
- The title of a prerelease says how complete it is. The sentence is written when the version is bumped, in
  `scripts/release/release-status.json`.
- `CHANGELOG.md` holds only tagged versions: entries wait under `## Unreleased` and take a dated version heading
  when the release is cut. `scripts/release/changelog.ts` checks it.
- The product name and the application identifier are recorded in `scripts/release/identity.json` and checked
  against `electron-builder.yml` and the Studio `package.json`. They are permanent after the first Store or signed
  release, so they change only by decision D-03 of the owner.
- Each firmware image embeds its version, the commit it was built from, whether tracked files differed from it, its
  board, the bytecode ABI and draft counter, and the `CONFIG_ZPLC_*` options with their hash. `zplc version` and
  `zplc sys build [--json]` report them, and the native runtime reports them in its handshake as `build`.

RELEASING.md is the checklist of a release.
