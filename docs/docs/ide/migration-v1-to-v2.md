---
slug: /ide/migration-v1-to-v2
id: migration-v1-to-v2
title: Migrate a v1 Project to v2
sidebar_label: Migrate v1 to v2
description: Preview, review, and explicitly save a folder-backed ZPLC v2 project.
tags: [ide, migration]
---

# Migrate a v1 Project to v2

ZPLC 2.0 shows you what a version 1 project becomes as a version 2 project before it changes anything. The folder stays as it is until you save; the save rewrites only `zplc.json` in that folder to schema version 2, and your programs are not touched.

## Migrate in the application

1. Open the version 1 project folder in ZPLC, or import its archive from the Welcome screen. The import dialog shows the same difference before it writes anything.
2. In the migration notice of the Explorer, choose **Review the difference**. The dialog lists the lines of `zplc.json` that the migration removes and adds.
3. Choose **Apply migration** (the same as **Save**) to write the reviewed version 2 configuration to the folder, or **Close** to leave it as it is.
4. Build the project and run its scenario again.

## Migrate from a terminal

To see what the migration would change without opening the application, and to write the version 2 project file where you choose, use the command line ([Use the command line](../guides/command-line.md)):

```bash
zplc-cli migrate-preview path/to/project
zplc-cli migrate path/to/project --output zplc.v2.json
```

`migrate-preview` writes nothing and prints `migrate-preview passed`; add `--json` for the list of changes. `migrate` writes the version 2 project file to `--output`, which cannot be the project file or a file in `src` or `tests`, and leaves the project folder as it was. Review the file, then copy it over `zplc.json` when you accept it.

## What changes

| Area | Version 2 behavior |
| --- | --- |
| Project model | An explicit Save writes `schemaVersion: 2` to the `zplc.json` of the folder. |
| Original folder | Unchanged during the preview. Save updates its `zplc.json`. |
| Preview | The application's view is a preview. It does not promise that every legacy construct is supported. |
| Evidence | Build, test and native simulation results apply to the saved project and are host evidence only. |

## Before you save

Back up the folder or commit it to version control, then review the difference. If a diagnostic reports unsupported source or configuration, resolve it before you adopt the migration. Do not edit the generated visual model JSON by hand to get around a diagnostic.

## What is verified

The migration gate covers the repository's golden version 1 projects: their saved version 2 form must compile and keep the tested observable behavior on the native runtime. It is not a claim of equivalence on a target, in electrical behavior, in timing or in hardware-in-the-loop runs.

| Part | Verified by | Level |
| --- | --- | --- |
| `migrate-preview` writes nothing, and `migrate` writes only the file named by `--output` and leaves the folder byte-identical | Unit tests of the command line, and both commands run on a copy of the bundled project `motor_start_stop` with its `schemaVersion` removed | Host |
| The application shows the difference before it writes, and applies it on **Apply migration** | Journey 31 in the real application | Host |
| The saved version 2 form keeps what the project does | A test exports the migration of the motor start/stop project and checks that its golden scenario gives the same observable on the native runtime | Host |
| The migrated project behaves the same on a board | Not claimed: no target, electrical or timing equivalence | None |

## Next step

Continue with the [compiler workflow](./compiler.md), and record a fresh test or simulation result for the saved project.
