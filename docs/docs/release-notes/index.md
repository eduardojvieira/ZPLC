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

The non-HIL ZPLC 2.0 gates are implemented and locally verifiable: C99 host and
sanitized tests, compiler/IDE checks, native simulation, deterministic Lab/Learn,
restricted AI/MCP, bilingual docs, exact-SHA CI and release-workflow controls.
The hosted workflow runs that exact SHA before publishing; it creates checksums,
an SPDX SBOM and provenance, verifies native macOS/Windows signing when publishing,
and checks reproducible Linux payloads. Those concrete artifacts do not exist until
that hosted tag/SHA workflow succeeds.

The sole remaining product qualification gate is traceable physical HIL for the
Raspberry Pi Pico RP2040 and ESP32-S3-DevKitC-1-N8R8: exact SHA build, flash,
identity/hash, program deploy, golden scenario, reboot/persistence, safe outputs,
and timing evidence per profile.

The current review record is `specs/008-release-foundation/artifacts/release-evidence-matrix.md` in this checkout.

## Evidence boundaries

- Host, simulation, cross-build and workflow evidence do not establish HIL, target
  timing, electrical behavior, board qualification or safety certification.
- Linux artifacts are reproducibly payload-checked, checksummed and attested; they
  are not described as natively signed.
- AI and MCP do not initiate flash, deploy, force, RUN/STOP, recovery, raw serial
  or shell actions.

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
