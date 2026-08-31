---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: Evidence-aware release posture for the ZPLC platform.
tags: [releases, changelog]
---

# Release Notes

There is no released ZPLC v1.5.0 artifact recorded by this repository yet.
v1.5.0 remains a release target while desktop validation, hardware-in-the-loop
(HIL), and final sign-off are pending.

## Current release posture

| Area | Current public posture | Evidence boundary |
|---|---|---|
| C99 core and HAL | Source and automated tests exist | Host tests do not qualify a board or timing target |
| IDE and native simulation | Development surface exists | Desktop and hardware parity remain evidence-gated |
| IEC language paths | Repository paths exist | End-to-end release support requires per-language evidence |
| Board profiles | Catalogued in the board manifest | Presence is not a prebuilt, HIL, or production claim |
| Timing/determinism | Requires measurement by profile | No stable hard-real-time claim is published here |

The release evidence matrix is the review record for v1.5 scope:
[`specs/008-release-foundation/artifacts/release-evidence-matrix.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/008-release-foundation/artifacts/release-evidence-matrix.md).

## What repository automation verifies

- Host CMake/CTest checks exercise the C99 core on the development host.
- Compiler and IDE build, test, and lint checks exercise repository code.
- Generated documentation and EN/ES parity validators detect documentation drift.
- Structural board and evidence validators check manifests and recorded evidence.
- Release automation is configured to produce a candidate SPDX SBOM, SHA-256
  checksums, identity manifest, and installer attestations bound to the candidate SHA.

These are host and repository checks. They do not establish HIL, target timing,
or hardware qualification. The checksum and manifest establish the integrity and
identity of the candidate file, not artifact authenticity/signing or
reproducibility between runners. This local worktree is not release evidence:
the candidate SHA must run and be verified in the hosted workflow before an
SBOM or attestation can be claimed to exist.

## Still required before publication

- Desktop smoke evidence is required for each supported operating system.
- A traceable HIL run of the release SHA is required on representative hardware.
- Code signing/notarization, reproducibility evidence, HIL, and final release
  sign-off remain required after the hosted candidate workflow is verified.
- Final human release sign-off is required after reviewing the evidence.

## ZPLC 2.0

ZPLC 2.0 is an approved implementation RFC, not a public release or support
commitment. It moves Studio and orchestration forward incrementally while the
current core, compiler, POSIX/Zephyr runtimes, native protocol, and editors are
validated and evolved. Its gates and non-goals are recorded in
[`specs/010-zplc-2-0-foundation/spec.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).

Do not infer a release, board qualification, timing result, feature parity, or
safety property from this page or the presence of source code.
