---
slug: /ide
id: index
title: IDE & Tooling
sidebar_label: IDE Overview
description: Capabilities of the ZPLC Web IDE and debugging tools.
tags: [ide, tooling, debugging]
---

# IDE & Tooling

The ZPLC IDE is the engineering surface that must prove the v1.5 workflow claims.

## Capabilities

- **Multi-language authoring**: text workflows for `ST` and `IL`; visual workflows for
  `LD`, `FBD`, and `SFC`
- **Integrated compilation**: shared compiler contract for all claimed language paths
- **Simulation and debugging**: breakpoint, watch, force-value, and execution-state flows
- **Project configuration**: supported-board-aware target, network, and communication setup

## Desktop and Web Workflows

The release claim for v1.5 depends on the desktop workflow being validated on real
macOS, Linux, and Windows environments. The web path remains useful for simulation, but
does not replace human desktop evidence.

## Simulation and Debugging

- **WASM Simulation**: the runtime executes `.zplc` in-browser for fast iteration
- **Live variable inspection**: watch values and current execution state
- **Force value flow**: validate interaction between simulated/runtime state and the UI
- **Breakpoints and step control**: part of the release claim, not optional polish

## Architecture for Contributors

The active IDE implementation lives in `packages/zplc-ide` and integrates with
`packages/zplc-compiler`. The release evidence for language workflows and desktop smoke
validation must stay aligned with those packages.
