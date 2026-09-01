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

1. Open the existing project folder in Studio.
2. Review the migration notice and its diff.
3. Choose **Save** to write the reviewed v2 configuration to that workspace.
4. Compile and run the project’s scenario again after saving.

## What changes

| Area | v2 behavior |
| --- | --- |
| Project model | An explicit Save writes `schemaVersion: 2` to the workspace’s `zplc.json`. |
| Original folder | Stays unchanged during preview; Save updates the selected workspace’s original `zplc.json`. |
| Preview | The Studio view is a preview; it is not a promise that every legacy construct is supported. |
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

## Next step

Continue with [the compiler workflow](./compiler.md) and record a fresh test or
simulation result for the saved project.
