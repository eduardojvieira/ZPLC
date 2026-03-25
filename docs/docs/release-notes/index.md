---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: Version history and breaking changes.
tags: [releases, changelog]
---

# Release Notes

Release notes for v1.5 describe verified capabilities, release-facing constraints, and the evidence-backed public scope.

## Release posture

ZPLC v1.5.0 aligns runtime, IDE, supported boards, and bilingual documentation under one truthful release contract instead of publishing aspirational scope.

## What ships in v1.5.0

The release documents and ships:

- canonical English and Spanish documentation for quickstart, architecture, runtime, IDE, languages, boards, Zephyr setup, operations, and release notes
- generated supported-board reference from `firmware/app/boards/supported-boards.v1.5.0.json`
- generated runtime API reference from public headers in `firmware/lib/zplc_core/include/`
- release-facing workflows tied back to IDE/compiler exports and runtime headers
- automated validation for docs manifest coverage, bilingual slug parity, generated-reference freshness, and release evidence/source drift

## Evidence-backed inclusions

- supported boards listed in `firmware/app/boards/supported-boards.v1.5.0.json`
- repo-declared and automated-tested workflow coverage for `ST`, `IL`, `LD`, `FBD`, and `SFC`
- Modbus RTU, Modbus TCP, and MQTT surfaces that match across runtime, compiler, IDE, and docs
- bilingual canonical documentation for the release-blocking page set

## Release governance records

The release evidence matrix remains the internal audit trail for human-owned and shared validation records, including:

- desktop validation across macOS, Linux, and Windows
- human HIL proof for at least one serial-focused board and one network-capable board
- release-owner sign-off for ownership and evidence completeness

These records do not expand the public claim set on their own; they document validation ownership and follow-up history.

As of this scope freeze, the desktop smoke records, representative HIL records, and release-owner sign-off are still pending. Public v1.5 wording must not imply those gates are already closed.

## Not allowed in final notes without evidence

- boards outside the supported-board manifest
- desktop validation claims without macOS, Linux, and Windows evidence records
- HIL claims without one serial-focused and one network-capable human validation record
- protocol features that still behave as `not supported`

## Operational reading guide

Use these notes together with the canonical docs manifest, the source-of-truth map, and the
release evidence matrix:

- [`/docs/reference/v1-5-canonical-docs-manifest`](/reference/v1-5-canonical-docs-manifest)
- [`/docs/reference/source-of-truth`](/reference/source-of-truth)
- `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

If a capability cannot be tied back to those artifacts, remove it from the public v1.5 claim set
or label it clearly as pending or experimental.
