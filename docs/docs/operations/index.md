---
slug: /operations
id: index
title: Operations
sidebar_label: Operations
description: Observe, recover and change a ZPLC system without crossing an evidence or authority boundary.
tags: [operations]
---

# Operations

This page is the checklist for working on a ZPLC system that is already running: what to look at first, what to keep, and which actions stay with a person. Do not infer the physical state of a machine from a host result, and do not treat a program deploy as a firmware recovery.

## A routine sequence

1. Inspect the runtime status, the selected board profile, the diagnostics and where the evidence comes from.
2. Keep the hash of the artifact and the trace before you change anything.
3. Leave every physical action to a person, under the site's safe-work procedure.
4. When a connection, a program or the firmware fails, go to [Recovery boundaries](./recovery.md).

## What ZPLC shows you

- Compiler diagnostics, test results, the trace of a host simulation and the status a connected runtime reports.
- The selected board profile and its evidence level.
- A deploy confirmation that identifies the artifact and whether the runtime is compatible with it.

The device shell shows the same status from a terminal: see [Use the device shell](./shell.md).

## Before a physical action

- Confirm the machine is under the site's approved safe-work procedure.
- Confirm the selected board, the profile, the runtime identity, the ABI and the artifact hash.
- Treat flash, deploy, force, RUN, STOP and recovery as separate human decisions.

## What still needs target or HIL evidence

- The electrical state of an output, timing and WCET, the physical watchdog, persistence across a power cut, runner recovery and production qualification.
- Any statement that a board profile does more than its recorded evidence level.

[Hardware support](../reference/capabilities-evidence.md) defines the levels, and [Safety and limitations](../safety-and-limitations.md) says what ZPLC is not.

## When you escalate

- Attach the diagnostics, the trace, the artifact identity, the selected profile and the decision of the operator.
- Leave credentials and raw sensitive serial output out of tickets and prompts.

Raw serial, flash, force, RUN, STOP and recovery are never AI or MCP operations.
