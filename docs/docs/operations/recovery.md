---
slug: /operations/recovery
id: recovery
title: Recovery Boundaries
sidebar_label: Recovery
description: Recover a ZPLC session layer by layer, without mistaking host evidence for target or HIL proof.
tags: [operations, recovery]
---

# Recovery Boundaries

When something fails, recover the smallest layer first. Return the control logic to a safe state, inspect the connection and the artifact, and only then choose a program recovery or a firmware recovery. ZPLC has no universal hardware recovery procedure, and this page does not invent one.

## The short path

1. Stop commissioning and put the machine under the site's approved safe-work procedure.
2. Reconnect, inspect the runtime identity and status, and save the diagnostics.
3. Recompile and validate the `.zplc` artifact you intend to run. A person confirms the deploy.
4. For firmware work, follow the Zephyr recovery steps of the exact board profile.

## Pick the recovery

| Situation                 | Safe action                                                               | Evidence limit                                                       |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Runtime or program fault  | Keep the outputs in the runtime safe state, then inspect status and trace. | A host trace is not electrical proof.                                |
| Lost connection           | Reconnect and verify board, profile and ABI before any deploy.            | A serial identity is not HIL qualification.                          |
| Program replacement       | Compile, test and simulate, then use the deploy dialog and confirm it.    | A deploy changes control logic. It is not a firmware flash.          |
| Firmware failure          | Stop, and follow the exact board and runner recovery procedure.           | The catalogued profiles have no HIL evidence references.             |
| Persisted program concern | Reboot only under the site procedure, and inspect the restored state before RUN. | Power-cut and target persistence need target or HIL evidence. |

## Safe state and restart

The safe-state and restore behaviour of the runtime is backed by code and host tests. Before you energize machinery after a fault or a restart, check the real output state on the exact device, under the commissioning procedure. A person must authorize flash, deploy, force, RUN, STOP and recovery. AI and MCP have no controls for them.

## What to keep

Keep the compile hash, the diagnostics, the trace, the runtime identity, the selected profile and the person's deploy confirmation with the incident record. Leave credentials and raw sensitive serial output out of support tickets and AI prompts.

## Next

Read [Deployment](../ide/deployment.md) and the runner procedure of the board in [Flash the firmware](../guides/flash-firmware.md) before you change firmware.
