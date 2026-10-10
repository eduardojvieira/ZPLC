---
slug: /operations/shell
id: shell
title: The ZPLC Shell
sidebar_label: ZPLC Shell
description: Reference for the built-in Zephyr shell commands in ZPLC.
tags: [operations, debugging, shell]
---

# The ZPLC Shell

ZPLC adds a `zplc` command set to the Zephyr shell on the board's interactive UART (usually 115200 baud).

From a terminal you can inspect memory, check the network, read execution errors and control the virtual machine without the desktop IDE.

## Accessing the Shell

Connect a serial terminal program (such as PuTTY, screen, or Minicom) to the virtual COM port of your Zephyr board.

Start every command with `zplc`.

---

## Runtime Control (`zplc`)

- `zplc load <size>` - Prepares the runtime to receive a `.zplc` program of the given size in bytes. It refuses while the runtime is faulted; run `zplc reset` first.
- `zplc data <hex>` - Sends the next chunk of the program, in hexadecimal. Use it only after `zplc load`.
- `zplc start` - Starts the scheduler.
- `zplc stop` - Stops the scheduler.
- `zplc status` - Shows the runtime state.
- `zplc reset` - Resets the virtual machine.
- `zplc version` - Shows the version.

---

## Core VM & Debugging (`zplc dbg`)

The `dbg` commands give you direct access to the execution state, memory and breakpoints.

### Breakpoints (`bp`)
- `zplc dbg bp list` - Lists the active breakpoints.
- `zplc dbg bp add <pc>` - Adds a breakpoint at the given program counter (PC) address.
- `zplc dbg bp remove <pc>` - Removes the breakpoint at the given PC address.
- `zplc dbg bp clear` - Clears all breakpoints.

### Forcing Variables (`force`)
- `zplc dbg force list` - Lists the forced memory addresses.
- `zplc dbg force set <addr> <hexbytes>` - Forces a memory address to hold the given bytes, overriding the program's own assignments.
- `zplc dbg force clear <addr>` - Removes the force on one address.
- `zplc dbg force clear_all` - Removes all forces, so the program controls every address again.

### Execution Control
- `zplc dbg pause` - Pauses the scheduler between scans. The physical outputs go to their safe state; the output image and the force table are kept.
- `zplc dbg resume` - Resumes. A scan that stopped at a breakpoint continues from where it stopped, and the first scan commit drives the outputs again from the kept image.
- `zplc dbg step` - Finishes the scan that stopped at a breakpoint, or runs one whole scan, and pauses at the next cycle boundary or at the next breakpoint. The image shows the stepped scan; the outputs are safe.

`zplc stop` is not a pause: it also zeroes the output image, clears the force table and returns every task to its entry point. See [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop).

### Memory Introspection
- `zplc dbg info` - Shows the virtual machine state and the current PC.
- `zplc dbg mpeek addr:len[,addr:len...]` - Reads one or more blocks of memory at the given hexadecimal addresses.
- `zplc dbg poke <addr> <value>` - Writes a value to a memory address.
- `zplc dbg mem <ipi|opi|work|retain> [offset]` - Dumps one memory region to the console, starting at the optional offset.
- `zplc dbg watch <addr> [type]` - Not implemented. The command only prints a message; use `mpeek`, or the Watch tab in Studio.

### Ticks, Tasks and Timers
- `zplc dbg ticks` - Prints the system tick count in milliseconds.
- `zplc dbg task <task_id>` - Shows the definition and limits of one task.
- `zplc dbg timer <addr>` - Not implemented. The command only prints a message.

---

## Scheduler (`zplc sched`)

The scheduler decides when each task runs. These commands are available when the firmware is built with `CONFIG_ZPLC_SCHEDULER`. Use them to inspect task timing or to upload a program by hand.

- `zplc sched status` - Shows the scheduler state, such as `RUNNING` or `HALTED`.
- `zplc sched tasks` - Lists the configured tasks with their priority and cycle-time measurements.
- `zplc sched load <size>` - Prepares the runtime to receive a `.zplc` program of the given size in bytes.
- `zplc sched data <hex>` - Sends the next chunk of the program, in hexadecimal, without going through Studio.

---

## Configuration & Persistence (`zplc config`)

These commands manage the settings that ZPLC keeps in the board's non-volatile storage.

- `zplc config get` - Shows the current configuration.
- `zplc config set <key> <val>` - Changes a setting, such as an interval or a network address.
- `zplc config save` - Writes the current settings to non-volatile storage.
- `zplc config reset` - Deletes the saved settings; the defaults apply after the next reboot.

---

## Hardware Integration (`zplc hil` / `adc`)

The `adc` commands exist only when the firmware is built with `CONFIG_ADC`.

- `zplc hil mode <mode>` - Changes the hardware-in-the-loop (HIL) mode.
- `zplc hil status` - Shows the HIL status.
- `zplc hil reset` - Resets the virtual machine.
- `zplc hil watch <id> <addr>` - Registers a HIL watch.
- `zplc adc temp` - Reads the processor's internal temperature, if the board supports it.
- `zplc adc read <channel>` - Reads one ADC channel.

---

## Networking (`zplc net` / `wifi`)

For boards with network hardware, such as the ESP32-S3 or the STM32F7 boards.

- `zplc net status` - Shows the IPv4 address, the gateway and the MAC address.
- `zplc wifi connect` - Connects to Wi-Fi with the credentials stored by `zplc config`.

---

## MQTT and Communication (`zplc mqtt` / `comm`)

- `zplc mqtt status` - Shows the MQTT client status, including the broker and the client ID.
- `zplc mqtt reset_backoff` - Resets the reconnect delay to its initial value.
- `zplc comm map` - Shows the communication bindings and the Modbus server mappings.
- `zplc comm set modbus <index> <address>` - Overrides one Modbus server mapping.
- `zplc comm clear modbus <index>` - Removes the override of one Modbus server mapping.

---

## Certificates / Security (`zplc cert`)

A secured MQTT broker, such as AWS IoT Core, needs TLS certificates stored on the board.

- `zplc cert status` - Shows whether the CA certificate, the client certificate and the private key are installed, and their sizes.
- `zplc cert begin <ca|client|key> <size>` - Starts an upload of the given size.
- `zplc cert chunk <hex>` - Sends the next chunk of the upload, in hexadecimal.
- `zplc cert commit` - Writes the uploaded data to storage.
- `zplc cert erase <ca|client|key>` - Erases the stored certificate or key.

---

## Time Services (`zplc ntp`)

ZPLC can synchronize the clock over SNTP.

- `zplc ntp status` - Shows the synchronization state and the offset from Unix time.
- `zplc ntp enable` / `zplc ntp disable` - Turns the SNTP service on or off.
- `zplc ntp server <hostname>` - Sets the time server.
- `zplc ntp sync` - Requests the time immediately.

---

## System Base (`zplc sys`)

These commands are available when the firmware is built with `CONFIG_ZPLC_SCHEDULER`.

- `zplc sys info` - Shows the system information, including build and hardware details. `--json` also reports the `draft_counter` of the image and, under `memory`, `code_size` and `max_artifact_size`, the largest program the board accepts (`CONFIG_ZPLC_CODE_SIZE_MAX`); a program built for another draft is refused (see [Contributing](../contributing/index.md#draft-contract-counter)).
- `zplc sys reboot` - Reboots the board with a software reset.
