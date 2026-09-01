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
