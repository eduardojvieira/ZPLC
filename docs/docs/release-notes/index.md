---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: Evidence-aware release posture for the ZPLC platform.
tags: [releases, changelog]
---

# Release Notes

ZPLC `v2.0.0-rc.1` is the current prerelease candidate. It is not a GA release,
HIL result, board qualification, or safety certification.

## Current release posture

| Area | Current public posture | Evidence boundary |
|---|---|---|
| C99 core and HAL | Source and automated tests exist | Host tests do not qualify a board or timing target |
| IDE and native simulation | Supervised native simulation and Studio candidate exist | Host behavior does not establish desktop or hardware parity |
| IEC language paths | Repository paths exist | End-to-end release support requires per-language evidence |
| Board profiles | Catalogued in the board manifest | Presence is not a prebuilt, HIL, or production claim |
| Timing/determinism | Requires measurement by profile | No stable hard-real-time claim is published here |

The release evidence matrix remains the review record for the current catalog/evidence baseline:
[`specs/008-release-foundation/artifacts/release-evidence-matrix.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/008-release-foundation/artifacts/release-evidence-matrix.md).

## What repository automation verifies

- Host CMake/CTest checks exercise the C99 core on the development host.
- Compiler and IDE build, test, and lint checks exercise repository code.
- Generated documentation and EN/ES parity validators detect documentation drift.
- Structural board and evidence validators check manifests and recorded evidence.
- Release automation is configured to produce a candidate SPDX SBOM, SHA-256
  checksums, and identity manifest bound to the candidate SHA.

These are host and repository checks. They do not establish HIL, target timing,
or hardware qualification. The checksum and manifest establish the integrity and
identity of the candidate file, not artifact authenticity/signing or
reproducibility between runners. This local worktree is not release evidence:
the candidate SHA must run and be verified in the hosted workflow before an
SBOM or attestation can be claimed to exist.

## Still required before GA

- Desktop smoke evidence is required for each supported operating system.
- A traceable HIL run of the release SHA is required on representative hardware.
- Code signing/notarization, reproducibility evidence, HIL, and final release
  sign-off remain required after the hosted candidate workflow is verified.
- Final human release sign-off is required after reviewing the evidence.

## ZPLC 2.0 RC scope

`v2.0.0-rc.1` is the first public prerelease candidate for the incremental ZPLC
2.0 work: trust-boundary hardening, canonical project/compiler/tool contracts,
supervised host simulation, the Studio workbench, and restricted AI/MCP/Lab/Learn
foundations. The remaining gates and non-goals are recorded in
[`specs/010-zplc-2-0-foundation/spec.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).

Do not infer GA status, board qualification, timing result, feature parity, or
safety property from this page or the presence of source code.
