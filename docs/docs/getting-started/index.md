---
slug: /getting-started
id: index
title: Getting Started
sidebar_label: Getting Started
description: Quickstart guide for ZPLC.
tags: [quickstart]
---

# Getting Started

Use this path to validate ZPLC v1.5 from a clean checkout without guessing what is
actually supported.

## 1. Install prerequisites

```bash
bun install
```

Ensure your Zephyr toolchain, `west`, and any required serial/network hardware are ready
before you attempt the full release workflow.

## 2. Build the core surfaces

```bash
just release-validate
bun --cwd docs run build
```

This validates the release truth sources, supported-board manifest, docs parity, and
release evidence structure.

## 3. Compile and simulate a project

- Open a sample project in the IDE
- Compile it to `.zplc`
- Run it in simulation
- Inspect watch values and breakpoints if you are validating the debug path

## 4. Deploy only to supported targets

For v1.5, supported boards are the boards published from
`firmware/app/boards/supported-boards.v1.5.0.json` and mirrored in the reference docs.

## 5. Record evidence when validation is human-owned

Desktop smoke runs and hardware-in-the-loop checks are not complete until they are backed
by evidence records under `specs/008-release-foundation/artifacts/`.
