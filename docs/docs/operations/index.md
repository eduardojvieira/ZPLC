---
slug: /operations
id: index
title: Operations
sidebar_label: Operations
description: Guidance on upgrading, observability, and diagnostics.
tags: [operations]
---

# Operations

Operations for v1.5 focus on release evidence, diagnostics, controlled recovery, and truthful scope management across runtime, IDE, hardware, and docs.

## Operating model for v1.5.0

Treat ZPLC v1.5.0 as a coordinated release train. Documentation, supported boards,
IDE workflows, and runtime behavior must all point back to the same source-backed claim set.

## Before sign-off

Run the release-facing non-build checks before approving documentation or public messaging:

- `python3 tools/hil/validate_supported_boards.py`
- `python3 tools/hil/validate_release_evidence.py`
- `bun run generate:v1.5-docs`
- `bun run validate:v1.5-docs`
- targeted automated tests that back the workflow or runtime area being changed

If any of these fail, stop the sign-off flow and repair the source of truth first.

## Human-owned evidence gates

The release evidence matrix still marks several gates as pending. Operators and release owners
must keep human evidence aligned with the published claim set:

- desktop smoke evidence for macOS, Linux, and Windows
- one serial-focused board validation record
- one network-capable board validation record
- human confirmation that release notes describe only verified scope

Use `specs/008-release-foundation/artifacts/release-evidence-matrix.md` as the canonical list of gates and statuses.

## Diagnostics and recovery workflow

When a validation or deployment step fails, use this sequence instead of patching docs by intuition:

1. identify the broken claim surface (`runtime-api`, boards, release notes, landing copy, or workflow docs)
2. trace it back to its canonical source using [`/docs/reference/source-of-truth`](../reference/source-of-truth.md)
3. fix the source artifact or generator, not just the rendered markdown
4. regenerate references if the source is generated
5. rerun the non-build validation checks and record the outcome

## Scope correction rules

Never leave unsupported or weakly-supported claims in public release surfaces.

- If a board is not present in `firmware/app/boards/supported-boards.v1.5.0.json`, remove it from docs and website copy.
- If a release gate is pending in the evidence matrix, describe it as pending — never complete.
- If generated references are stale or semantically broken, block sign-off until the generator is fixed and outputs are regenerated.
- If an operations or release-notes page is too shallow to guide a reviewer, deepen it or remove it from the release-blocking surface.

## Operator checklist

- confirm the canonical manifest still matches the release-blocking page set
- confirm English and Spanish remain aligned for release-blocking pages
- confirm generated runtime and board references are fresh and trustworthy
- confirm landing-page claims still match supported boards, runtime headers, and release evidence
- confirm pending human gates are called out explicitly in release notes
