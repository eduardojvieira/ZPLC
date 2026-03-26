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
2. **Review Task Violations**: Execute `zplc sched tasks`. If a task has locked up the CPU, it will be marked explicitly, allowing you to trace the overload back to a specific IEC program.
3. **Inspect Output Pins Physically**: Use a multimeter to confirm if the output matches the logic state shown in the ZPLC IDE Watch Tables. If the IDE shows TRUE but the pin is 0V, you may have a misconfigured `zplc.json` I/O map.
4. **Halt and Clear**: If a program continuously crashes the MCU, interrupt the boot cycle via the shell with `zplc stop` and execute `zplc persist clear` to wipe the internal `.zplc` bytecode from the NVS (Non-Volatile Storage), allowing a clean upload.

## IDE Observability

The ZPLC IDE provides deep introspection utilities for running systems:

- **Watch Tables**: Allow you to pin global variables, Timers, or individual struct members and stream their live values directly from the hardware.
- **Cycle Statistics**: The IDE bottom bar displays the Maximum Cycle Time (latency) of the underlying RTOS. If this value approaches your Task Interval, your machine is mathematically overloaded. 
- **Force / Write**: You can manually override a sensor value (e.g., forcing a temperature reading to `100.0` from the IDE) to test logic branches safely before actual operation.

## Network Troubleshooting

If your `MQTT_PUBLISH` blocks or your Modbus TCP connection drops:
- Ensure the Zephyr board has acquired a DHCP address (visible via `zplc status` in the shell).
- Check the subnet alignment between the IDE workstation and the PLC target.
- Confirm that the `network_interface` parameter for your MCU supports your networking topology.

## Hardware Upgrades

ZPLC is built on Zephyr RTOS. Over time, base layers require patching.
- Upgrading the `libzplc_core` engine does **not** erase the `.zplc` bytecode stored in NVS. 
- You can update the C firmware via `west flash` safely. 
- Upon reboot, the new ZPLC engine will seamlessly load and execute the existing automation logic.

## Operator Checklist

Before commissioning a machine running ZPLC, verify:
- Task Intervals in `zplc.json` have realistic timeframes (e.g. 10ms for fast reading, 500ms for slow temperature reading) to avoid CPU saturation.
- Retain Memory limits have not been exceeded for critical machine state variables.
- Hardware UART or Network sockets match the requirements configured in the Communication tabs for Modbus/MQTT.
- The Zephyr shell connects successfully via serial on 115200 baud.
