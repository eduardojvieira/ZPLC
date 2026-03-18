---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: Version history and breaking changes.
tags: [releases, changelog]
---

# Release Notes

Release notes for v1.5 must only describe verified capabilities.

## Publication Rules

- link protocol, board, and IDE claims back to canonical docs
- separate supported scope from experimental scope
- remove any claim that does not have matching evidence at sign-off time

## v1.5.0 Release Foundation

This release foundation is about credibility, not marketing.

### Included only when verified

- supported boards listed in `firmware/app/boards/supported-boards.v1.5.0.json`
- end-to-end IDE workflow claims for `ST`, `IL`, `LD`, `FBD`, and `SFC`
- Modbus RTU, Modbus TCP, and MQTT behavior that has matching runtime, compiler, IDE, and docs evidence
- bilingual canonical documentation for the release-blocking page set

### Not allowed in final notes without evidence

- boards outside the supported-board manifest
- desktop validation claims without macOS, Linux, and Windows evidence records
- HIL claims without one serial-focused and one network-capable human validation record
- protocol features that still behave as `not supported`

### Operator expectation

If a capability cannot be tied back to release evidence, it must be removed from the final
v1.5 claim set or called experimental.
