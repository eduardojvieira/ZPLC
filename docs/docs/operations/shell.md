---
slug: /operations/shell
id: shell
title: The ZPLC Shell
sidebar_label: ZPLC Shell
description: Comprehensive reference for the built-in Zephyr shell commands in ZPLC.
tags: [operations, debugging, shell]
---

# The ZPLC Shell

ZPLC integrates directly with the Zephyr RTOS shell over the primary interactive UART interface (usually 115200 baud).

The shell provides a powerful, low-level interface for inspecting memory, managing networking, debugging execution errors, and controlling the virtual machine directly from the terminal without needing the desktop IDE.

## Accessing the Shell

To access the shell, connect a serial terminal program (such as PuTTY, screen, or Minicom) to the virtual COM port representing your Zephyr board.

Provide standard commands by prefixing them with the `zplc` subsystem identifier.

---

## Core VM & Debugging (`zplc dbg`)

The `dbg` subsystem gives you raw access to the execution state, memory segments, and breakpoints.

### Breakpoints (`bp`)
- `zplc dbg bp list` - Lists all currently active instruction breakpoints.
- `zplc dbg bp add <pc>` - Adds a breakpoint at the given program counter (PC) address.
- `zplc dbg bp remove <pc>` - Removes a breakpoint at the given PC address.
- `zplc dbg bp clear` - Clears all active breakpoints.

### Forcing Variables (`force`)
- `zplc dbg force list` - Lists all currently forced memory addresses.
- `zplc dbg force set <addr> <hexbytes>` - Forces a specific memory address to hold a continuous hex value overriding logical assignments.
- `zplc dbg force clear <addr>` - Removes the force overlay on a specific address.
- `zplc dbg force clear_all` - Clears all forced variables, restoring full logic control.

### Execution Control
- `zplc dbg pause` - Pauses the execution of the Virtual Machine mid-cycle.
- `zplc dbg resume` - Resumes suspended execution.
- `zplc dbg step` - Executes exactly one IEC logic cycle frame and pauses automatically.

### Memory Introspection
- `zplc dbg info` - Displays global VM state, memory allocations, and current PC.
- `zplc dbg mpeek addr:len[,addr:len...]` - Reads chunks of consecutive memory by hex address dynamically.
- `zplc dbg poke <addr> <value>` - Writes raw hex payload to a specified VM address buffer.
- `zplc dbg mem <addr> <len>` - Dumps a specified block of memory to the console.
- `zplc dbg watch <addr> <len>` - Streams continuous updates of memory chunk states.

### Core Timers
- `zplc dbg ticks` - Prints current operating system tick count via the hardware timer mechanism.
- `zplc dbg task <task_id>` - Dumps detailed IEC task structural limits.
- `zplc dbg timer <timer_id>` - Displays the state of standard IEC Timers (`TON`, `TOF`, `TP`).

---

## Scheduler (`zplc sched`)

The scheduler manages how and when the IEC programs loop. Use these commands to diagnose latency issues or manually upload bytecode.

- `zplc sched status` - Shows the active scheduler state (e.g. `RUNNING`, `HALTED`).
- `zplc sched tasks` - Lists all configured tasks, priority indices, and their internal CPU load (cycle time) metrics.
- `zplc sched load <size>` - Signals the bootloader to expect a `.zplc` bytecode payload of the specified bytes.
- `zplc sched data <hex>` - Manually writes bytecode frames into the NVS storage bypassing IDE mechanisms.

---

## Configuration & Persistence (`zplc config`)

The Zephyr NVS settings storage backing ZPLC parameters can be managed manually.

- `zplc config get` - Shows the current live configuration tree.
- `zplc config set <key> <val>` - Modifies a configuration entry (e.g. intervals, network addresses).
- `zplc config save` - Persists volatile settings deeply into the EEPROM/Flash.
- `zplc config reset` - Destroys the settings layer, restoring pure defaults upon reboot.

---

## Hardware Integration (`zplc hil` / `adc`)

- `zplc hil mode <mode>` - Changes the debug/HIL operational modality constraint.
- `zplc hil status` - Shows underlying HIL metrics.
- `zplc hil reset` - Issues a hard-reset on the Virtual Machine.
- `zplc hil watch <id> <addr>` - Registers HIL tracking probes.
- `zplc adc temp` - Reads native processor internal temperature if supported natively.
- `zplc adc read <channel>` - Triggers a raw analog read on an ADC multiplexer channel.

---

## Networking (`zplc net` / `wifi`)

For network-capable targets (e.g. `ESP32`, `STM32F7`), managing TCP stacks is critical.

- `zplc net status` - Displays live IPv4 assignments, gateway links, and MAC addresses.
- `zplc wifi connect` - Attempts linking using credential payloads stored in `zplc config`.

---

## Certificates / Security (`zplc cert`)

When integrating MQTT payloads to secured brokers (like AWS IoT core), root certificates are mandated.

- `zplc cert status` - Shows the presence and byte length of installed CA, certs, and private keys.
- `zplc cert begin <ca|client|key> <size>` - Initializes an upload buffer for TLS provisioning.
- `zplc cert chunk <hex>` - Deposits segmented cryptographic bundles to the staging buffer.
- `zplc cert commit` - Flashes the staged cryptographic key securely to the partition.
- `zplc cert erase <ca|client|key>` - Wipes sensitive TLS material structurally.

---

## Time Services (`zplc ntp`)

ZPLC provides native SNTP hooks for time-critical logical operations.

- `zplc ntp status` - Checks current Unix Epoch synchronization offset.
- `zplc ntp enable` / `zplc ntp disable` - Toggles the SNTP background service.
- `zplc ntp server <hostname>` - Overwrites the upstream time provider.
- `zplc ntp sync` - Forces an immediate NTP time request.

---

## System Base (`zplc sys`)

- `zplc sys info` - Dumps Zephyr OS metrics, build configurations, and physical HW boundaries.
- `zplc sys reboot` - Initiates a rigid microcontroller system software reset simulating a power cycle.
