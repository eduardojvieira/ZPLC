---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: Evidence-aware release posture for the ZPLC platform.
tags: [releases, changelog]
---

# Release Notes

ZPLC `v2.0.0-rc.3` is the current prerelease candidate. It is not GA, a safety
PLC certification, a production-qualified board release, or a completed HIL result.

## Current release posture

The rc.3 installers are unsigned: macOS and Windows warn before they run them,
and [Getting Started](../getting-started/index.md) shows how to continue. They
come from a preview build of commit `b379d82` and were uploaded by hand; the build
that would publish a release from the tag did not run to completion. The release
lists SHA-256 checksums and an SPDX software bill of materials.

The automated checks that ran for that commit are the C99 host tests, the
sanitizer and fuzz tests, the Zephyr Twister tests on `native_sim`, the packaged
desktop smoke tests, and the cross-build of the six board profiles.

No board has been tested on hardware: see [Hardware support](../reference/capabilities-evidence.md)
and [Safety and limitations](../safety-and-limitations.md). A hardware claim needs a traceable physical
test (HIL) for the Raspberry Pi Pico RP2040 and the ESP32-S3-DevKitC-1-N8R8:
build of the exact SHA, flash, identity and hash, program deploy, golden
scenario, reboot and persistence, safe outputs, and timing per profile.

## Evidence boundaries

- Host, simulation, cross-build and workflow evidence do not establish HIL, target
  timing, electrical behavior, board qualification or safety certification.
- Linux artifacts are reproducibly payload-checked, checksummed and attested; they
  are not described as natively signed.
- AI and MCP do not initiate flash, deploy, force, RUN/STOP, recovery, raw serial
  or shell actions.
- The release workflow creates the draft only after every platform build has finished (each
  build installs or mounts and launches its installer formats first), and the Linux payload
  reproducibility check is read in the release notes without blocking the run. These rules
  were authored and are checked by structural tests; no hosted release run has executed them yet.

Do not infer GA status, feature parity, timing performance or physical safety from
this page or from source presence.

## RC3 non-HIL verification

- Validate the canonical version with `bun scripts/release-version.ts --check`.
- Run release structural regressions with `node --test scripts/release-artifacts.test.mjs`.
- Run workflow pin regressions with `node --test scripts/workflow-action-pins.test.mjs`.
- Validate the evidence matrix with `python3 tools/hil/validate_release_evidence.py`.
- Build generated documentation and validate EN/ES parity before submitting a candidate.

## HIL exit criterion

- Use only the exact release SHA and record it in both board evidence records.
- Keep firmware flash, program deploy, and RUN/debug as distinct human operations.
- Preserve safe outputs on boot, fault, invalid program admission and recovery.
- Do not publish a production, timing or safety claim if either selected-board record is incomplete.
