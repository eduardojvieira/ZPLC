---
slug: /operations
id: index
title: Operations
sidebar_label: Operations
description: Guidance on observability, firmware diagnostics, and system recovery.
tags: [operations]
---

# Operations

Operating ZPLC in an industrial environment requires understanding how to observe running logic, diagnose faults, and recover custom hardware gracefully. This section outlines standard operational procedures for ZPLC v1.5.0.

For a full list of low-level diagnostic string commands, consult [The ZPLC Shell](./shell.md) reference.

## Diagnostics and Recovery Workflow

When a deployment step fails or an MCU behaves unexpectedly, use this sequence to diagnose the root cause instead of blindly reflashing:

1. **Check the ZPLC Shell**: Connect via serial using a tool like PuTTY or Minicom (115200 baud). ZPLC provides a built-in Zephyr shell. Run `zplc status` to see the VM state.
2. **Review Task Violations**: Execute `zplc sched tasks`. A bounded VM execution fault is reported as a controlled logical fault; verify the physical safety response on the exact target before commissioning.
3. **Inspect Output Pins Physically**: Use a multimeter to confirm if the output matches the logic state shown in the ZPLC IDE Watch Tables. If the IDE shows TRUE but the pin is 0V, you may have a misconfigured `zplc.json` I/O map.
4. **Halt and Clear**: A restored program is loaded stopped. Use `zplc stop` to request safe logical outputs, inspect the fault, and use the profile-supported recovery procedure when you intentionally need to remove a saved artifact before a clean upload.

## IDE Observability

The ZPLC IDE provides deep introspection utilities for running systems:

- **Watch Tables**: Allow you to pin global variables, Timers, or individual struct members and stream their live values directly from the hardware.
- **Cycle Statistics**: Treat host/native simulator timing as diagnostic evidence, not a target timing qualification. Validate timing on the exact target before commissioning.
- **Force / Write**: You can manually override a sensor value (e.g., forcing a temperature reading to `100.0` from the IDE) to test logic branches safely before actual operation.

## Network Troubleshooting

If your `MQTT_PUBLISH` blocks or your Modbus TCP connection drops:
- Ensure the Zephyr board has acquired a DHCP address (visible via `zplc status` in the shell).
- Check the subnet alignment between the IDE workstation and the PLC target.
- Confirm that the `network_interface` parameter for your MCU supports your networking topology.

## Hardware Upgrades

ZPLC is built on Zephyr RTOS. Over time, base layers require patching.
- Firmware update, firmware flash, program deploy, and RUN are separate operations. Verify the board/profile recovery procedure before updating firmware.
- A valid persisted artifact is verified and restored stopped on boot; a human must issue `zplc start` after inspection.

## Operator Checklist

Before commissioning a machine running ZPLC, verify:
- Task Intervals in `zplc.json` have realistic timeframes (e.g. 10ms for fast reading, 500ms for slow temperature reading) to avoid CPU saturation.
- Source-level RETAIN declarations are currently rejected. Do not rely on future RETAIN recovery until end-to-end target/HIL evidence exists for the exact board profile.
- Hardware UART or Network sockets match the requirements configured in the Communication tabs for Modbus/MQTT.
- The Zephyr shell connects successfully via serial on 115200 baud.
