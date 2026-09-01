---
slug: /operations
id: index
title: Operations
sidebar_label: Operations
description: Observe, recover, and change ZPLC systems without crossing evidence or authority boundaries.
tags: [operations]
---

# Operations

ZPLC operations start with safe work and clear evidence. Do not infer physical
state from a host result or turn a deploy into a firmware recovery procedure.

## Routine sequence

1. Inspect runtime status, selected profile, diagnostics, and evidence source.
2. Preserve the artifact hash and trace before changing anything.
3. Keep physical actions under explicit human authority and the site procedure.
4. Use [Recovery Boundaries](./recovery.md) when a connection, program, or firmware path fails.

## What Studio can show

- Compiler diagnostics, test results, host simulation trace, and a connected runtime’s reported status.
- The selected board profile and its evidence tier.
- A deploy confirmation that identifies artifact and runtime compatibility.

## Before a physical action

- Confirm the machine is under the site’s approved safe-work procedure.
- Confirm the selected board, profile, runtime identity, ABI, and artifact hash.
- Keep flash, deploy, force, RUN/STOP, and recovery as separate human decisions.

## What still needs target/HIL evidence

- Electrical output state, timing/WCET, physical watchdog behavior, power-cut persistence, runner recovery, and production qualification.
- Any assertion that a board profile works beyond its recorded evidence tier.

## Escalation record

- Preserve diagnostics, trace, artifact identity, selected profile, and operator decision.
- Do not copy credentials or raw sensitive serial material into tickets or prompts.

For low-level diagnostic reference, see [the ZPLC Shell](./shell.md). Raw serial,
flash, force, RUN/STOP, and recovery are not AI or MCP operations.
