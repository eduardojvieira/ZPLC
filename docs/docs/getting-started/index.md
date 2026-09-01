---
slug: /getting-started
id: index
title: Getting Started
sidebar_label: Getting Started
description: Create a folder-backed ZPLC project, validate it on the host, and understand the hardware boundary.
tags: [quickstart]
---

# Getting Started

Start with a project folder, compile, test, and simulate it. Treat hardware as a
separate human-controlled step with evidence appropriate to the exact board.

## Quick path

1. Install the desktop candidate or run Studio from source.
2. Create a project or copy an example to a folder you choose.
3. Compile and run its temporal test or native POSIX scenario.
4. Review the evidence scope before considering hardware.

## From source

```bash
bun install --frozen-lockfile
bun run --cwd=packages/zplc-ide electron:dev
```

## First project

A project has `zplc.json`, source/model files, and task declarations. Choose a
catalogued target only when you need its build profile; it is not an assurance
that a physical board is qualified.

Use Studio’s example dialog to copy a starter into a destination folder. For a
legacy folder, use [migration to v2](../ide/migration-v1-to-v2.md).

## Validate on the host

Compile the project, run the supplied test/scenario, and inspect trace and
diagnostics. Native POSIX is host evidence. It does not prove physical I/O,
target timing, persistence after power loss, flash, or HIL behavior.

## Move to hardware deliberately

Use the exact Zephyr profile to build firmware, then use the distinct human
flash, program deploy, and RUN/debug actions. Current six profiles are
