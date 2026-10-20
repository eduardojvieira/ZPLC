---
slug: /ide/migration-v1-to-v2
id: migration-v1-to-v2
title: Migrate a v1 Project to v2
sidebar_label: Migrate v1 to v2
description: Preview, review, and explicitly save a folder-backed ZPLC v2 project.
tags: [ide, migration]
---

# Migrate a v1 Project to v2

ZPLC 2.0 previews a v1 project as v2 and shows the resulting diff. The source
folder stays unchanged until you explicitly save; that save updates its
`zplc.json` in the selected workspace to schema v2.

## Quick path

1. Open the existing project folder in ZPLC, or import its archive from the Welcome screen: the import dialog
   shows the same difference before it writes anything.
2. Choose **Review the difference** in the migration notice of the Explorer. The dialog lists the lines of
   `zplc.json` that migrating removes and adds; only `zplc.json` changes, and your programs are not touched.
3. Choose **Apply migration** (the same as **Save**) to write the reviewed v2 configuration to that workspace, or
   **Close** to leave the folder as it is.
4. Compile and run the project’s scenario again after saving.

## From a terminal

To see what the migration would change without opening the ZPLC application, and to write the
version 2 project file where you choose, use the command line
([Use the command line](../guides/command-line.md)):

```bash
zplc-cli migrate-preview path/to/project
zplc-cli migrate path/to/project --output zplc.v2.json
```

`migrate-preview` writes nothing and prints `migrate-preview passed`; add `--json` for
the list of changes. `migrate` writes the version 2 project file to `--output`, which
cannot be the project file or a file in `src` or `tests`, and leaves the project folder
as it was. Review the file, then copy it over `zplc.json` when you accept it.

## What changes

| Area | v2 behavior |
| --- | --- |
| Project model | An explicit Save writes `schemaVersion: 2` to the workspace’s `zplc.json`. |
| Original folder | Stays unchanged during preview; Save updates the selected workspace’s original `zplc.json`. |
| Preview | The ZPLC view is a preview; it is not a promise that every legacy construct is supported. |
| Evidence | Compile, test, and POSIX simulation results apply to the saved workspace and are host evidence only. |

## Golden scope

The migration gate covers the repository’s golden v1 projects: their saved v2
form must compile and preserve the tested observable behavior in the native POSIX
runtime. This is not a target, electrical, timing, or HIL equivalence claim.

## If the migration is not acceptable

Back up the project folder or commit it to version control before saving, then
review the diff. Use diagnostics to resolve unsupported source or configuration
before adopting the migration. Do not hand-edit generated visual model JSON to
bypass a diagnostic.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| `migrate-preview` writes nothing, and `migrate` writes only the file named by `--output` and leaves the folder byte-identical | Unit tests of the command line, and the two commands above run on a copy of the bundled project `motor_start_stop` with its `schemaVersion` removed | Host |
| ZPLC shows the difference before it writes, and applies it on **Apply migration** | Journey 31 in the real application | Host |
| The saved version 2 form keeps what the project does | A test exports the migration of the motor start/stop project and checks that its golden scenario gives the same observable on the native runtime | Host |
| The migrated project behaves the same on a board | Not claimed: no target, electrical or timing equivalence | None |

## Next step

Continue with [the compiler workflow](./compiler.md) and record a fresh test or
simulation result for the saved project.
