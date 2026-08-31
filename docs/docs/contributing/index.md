---
slug: /contributing
id: index
title: Contributing
sidebar_label: Contributing
description: How to contribute to ZPLC with clear safety and evidence boundaries.
tags: [contributing, open-source]
---

# Contributing

Contributions target `master` and must leave the repository more trustworthy
than they found it.

## Quick path

1. Read [AGENTS.md](https://github.com/eduardojvieira/ZPLC/blob/master/AGENTS.md), the [engineering constitution](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md), [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md), and the [ZPLC 2.0 Foundation RFC](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).
2. Find the closest active spec and keep the work unit focused.
3. Add or strengthen focused tests for behavioral changes, then run the checks
   appropriate to the changed layer.
4. Update English and Spanish public docs together when a user-visible claim,
   workflow, or limitation changes.

## Contribution rules

| Area | Required practice |
|---|---|
| Runtime and hardware | Preserve C99/HAL boundaries, safe/off failure behavior, and recovery semantics. |
| Trust boundaries | Validate bytecode, IPC, paths, and external input before mutation. |
| Electron | Keep the renderer unprivileged and IPC narrow and validated. |
| Evidence | Label host, QEMU, target build, HIL, and manual results accurately. |
| Dependencies | Add one only with a concrete need and architectural justification. |
| Physical operations | Keep build, flash, deploy, and run/debug separate; do not automate physical control through AI or MCP. |

Do not publish, flash hardware, deploy a PLC program, or actuate equipment
without explicit authorization. See [CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md)
for the repository-level checklist.
