---
slug: /operations/recovery
id: recovery
title: Recovery Boundaries
sidebar_label: Recovery
description: Recover a ZPLC session without confusing host evidence with target or HIL proof.
tags: [operations, recovery]
---

# Recovery Boundaries

Recover the smallest layer first: return control logic to a safe state, inspect
the connection and artifact, then deliberately choose program or firmware
recovery. ZPLC does not fabricate a universal hardware recovery procedure.

## Quick path

1. Stop commissioning and place the machine under the site’s approved safe-work procedure.
2. Reconnect, inspect the runtime identity and status, and save the diagnostic evidence.
3. Recompile and validate the intended `.zplc` artifact before a human confirms deploy.
4. Use the exact board profile’s Zephyr recovery instructions for firmware work.

## Recovery decision

| Situation | Safe action | Evidence limit |
| --- | --- | --- |
| Runtime or program fault | Keep outputs in the runtime safe state; inspect status and trace. | Host trace is not electrical proof. |
| Lost connection | Reconnect and verify board/profile/ABI before any deploy. | A serial identity is not HIL qualification. |
| Program replacement | Compile, test, simulate, then use the human-confirmed deploy flow. | Deploy changes control logic; it is not firmware flash. |
| Firmware failure | Stop and follow the exact board/runner recovery procedure. | Current profiles have no HIL evidence references. |
| Persisted program concern | Reboot only under the site procedure; inspect restored state before RUN. | Power-cut and target persistence claims require target/HIL evidence. |

## Safe state and restart

The runtime’s safe-state and restore behavior are code and host-test evidence.
Before energizing machinery after a fault or restart, verify the actual output
state on the exact device under the commissioning procedure. A human must
authorize flash, deploy, force, RUN, STOP, and recovery; AI and MCP do not
provide those controls.

## What to retain

Keep the compile hash, diagnostics, trace, runtime identity, selected profile,
and the person’s deploy confirmation with the incident record. Avoid placing
credentials or raw sensitive serial output in support tickets or AI prompts.

## Next step

Read [the deployment boundary](../ide/deployment.md) and the board’s documented
Zephyr runner procedure before changing firmware.
