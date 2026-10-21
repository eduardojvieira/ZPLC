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

Every subcommand, with its arguments and the Kconfig symbol that enables it, is in the generated [shell command reference](../reference/shell-commands.md).

From a terminal you can inspect memory, check the network, read execution errors and control the virtual machine without the ZPLC desktop application.

## Accessing the Shell

Connect a serial terminal program (such as PuTTY, screen, or Minicom) to the virtual COM port of your Zephyr board.

Start every command with `zplc`.

---

## Runtime Control (`zplc`)

- `zplc load <size>` - Prepares the runtime to receive a `.zplc` program of the given size in bytes. It refuses while the runtime is faulted; run `zplc reset` first.
- `zplc data <hex>` - Sends the next chunk of the program, in hexadecimal. Use it only after `zplc load`.
- `zplc start` - Starts the scheduler.
- `zplc stop` - Stops the scheduler.
- `zplc status` - Shows the runtime state. While MQTT is enabled over TLS with certificate verification off, it also shows `WARNING: MQTT tls-verify: OFF` (`"warnings":["mqtt_tls_verify_off"]` in `--json`).
- `zplc reset` - Reloads the loaded program from the program store and leaves the scheduler stopped. The store is the only resident copy of the program, so an upload in progress is cancelled. With no program loaded it only stops the scheduler and clears its tasks.
- `zplc version` - Shows which build this is: the version, the commit the image was built from (and whether the working tree had uncommitted changes), the board, the bytecode ABI, the contract draft and the build options with their hash. It prints no build date, so two builds of one commit are the same image. The same text is `zplc sys build`.

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
- `zplc dbg watch <addr> [type]` - Reads one value from a PLC memory region and prints it in the type you name: `bool`, `i8`, `i16`, `i32`, `u8` (the default), `u16`, `u32` or `f32`. It is a snapshot, not a stream: the Watch tab of the ZPLC application polls the same memory.

Every command of the `zplc` set that takes an address works inside the four PLC regions (input image, output image, work and retain) and refuses an address outside them. Reading or writing any other address of the device is the `devmem` command of the Zephyr shell, which release firmware does not have: see [Raw memory](#raw-memory-diagnostic-firmware-only).

Reads (`mpeek`, `mem`, `info`) come from the snapshot the scan published at its last commit, so a value is whole and
from one scan, and a read never waits for a scan. A `poke` is queued and applied at the input latch of the next scan
through the force-aware interface: a forced address keeps its forced value. While the runtime is stopped there is no
scan and the write is applied at once.

### Ticks, Tasks and Timers

- `zplc dbg ticks` - Prints the system tick count in milliseconds.
- `zplc dbg task <task_id>` - Shows the definition and limits of one task.
- `zplc dbg timer <addr>` - Reads the 16-byte instance of a `TON`, `TOF` or `TP` at the address and prints `IN`, `Q`, `PT` and `ET` (in milliseconds) and whether the timer is running.

---

## Scheduler (`zplc sched`)

The scheduler decides when each task runs. These commands are available when the firmware is built with `CONFIG_ZPLC_SCHEDULER`. Use them to inspect task timing or to upload a program by hand.

- `zplc sched status` - Shows the scheduler state, such as `RUNNING` or `HALTED`.
- `zplc sched tasks` - Lists the configured tasks with their priority and cycle-time measurements.
- `zplc sched load <size>` - Prepares the runtime to receive a `.zplc` program of the given size in bytes.
- `zplc sched data <hex>` - Sends the next chunk of the program, in hexadecimal, without going through the ZPLC application.

---

## Configuration & Persistence (`zplc config`)

These commands manage the settings that ZPLC keeps in the board's non-volatile storage.

- `zplc config get` - Shows the current configuration. A password, a key or a user name is shown as `(set)` or `(not set)`; no command and no log line prints its value.
- `zplc config set <key> <val>` - Changes a setting, such as an interval or a network address. The change is in memory until it is saved.
- `zplc config save` - Writes every setting that `config get` reports, and the Modbus mapping overrides, to the non-volatile store the program is kept in. It prints `OK: Config saved` only after every entry was written; if one was not, it prints `ERROR: Failed to save config: <code>` and exits with that code (`-134` means that this firmware keeps no stored settings).
- `zplc config reset` - Puts the default settings in memory and saves them, so they apply after the next reboot too. It reports an error when the defaults could not be saved.

The settings of a device that was never configured are the defaults: MQTT is off, there is no broker, and MQTT uses TLS with the broker's certificate verified (see [Secure defaults](../runtime/connectivity.md#secure-defaults)).

`zplc config set mqtt_security 1` turns certificate verification off. A release image refuses it (`ERROR: this firmware cannot turn TLS certificate verification off`); an image built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y` accepts it, prints a warning, and shows `tls-verify: OFF` in `zplc mqtt status` and in `zplc status` for as long as it stays set.

### Raw memory (diagnostic firmware only)

The Zephyr shell has a `devmem` command that reads and writes any address of the device, not only the PLC regions. Release firmware does not build it (`CONFIG_DEVMEM_SHELL=n`). The diagnostic image does:

```bash
west build -b <board> firmware/app -- -DEXTRA_CONF_FILE=diagnostic.conf
```

`diagnostic.conf` sets `CONFIG_ZPLC_SHELL_RAW_MEMORY=y` together with `CONFIG_DEVMEM_SHELL=y`, and the application build stops with an error when only one of them is set, so the command cannot appear in a release image by accident. Use a diagnostic image on a bench, never on a controller that is connected to a plant.

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
- `zplc wifi connect` - Connects to Wi-Fi with the credentials stored by `zplc config set wifi_ssid`, `wifi_pass` and `wifi_security` (it never stores them). A board with an SSID stored also joins by itself at boot and again after a drop, in a background work item that never delays a scan: it waits 2 s after the first failure, doubling up to 60 s. `zplc status --json` reports the link as `wifi.state` (`unconfigured`, `connecting`, `connected`, `retrying`, or `unsupported` on a board without Wi-Fi) and `wifi.ip`. Neither the SSID nor the password is logged.

---

## MQTT and Communication (`zplc mqtt` / `comm`)

- `zplc mqtt status` - Shows the MQTT client status, including the broker and the client ID, and `tls-verify`: `on` (TLS, the broker's certificate is checked), `OFF` (TLS, it is not, with a warning line) or `n/a` (plain TCP, no TLS). `--json` adds `"tls_verify"`.
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
- `zplc sys build` - Shows the identity of the firmware image, as `zplc version` does. `--json` prints it as one object with `version`, `commit`, `dirty`, `board`, `abi_major`, `abi_minor`, `draft_counter`, `options_hash` and `options`. `commit` is `unknown` when the image was built from a source archive with no git history. It is a command of its own because the handshake of the ZPLC application accepts exactly the keys of `zplc sys info --json`.
- `zplc sys io` - Shows the identity of the board I/O description the image was built from. `--json` prints it as one object with `schema`, `board_id`, `hash`, `channels`, `input_bytes` and `output_bytes`. The ZPLC application compares the hash with the description it holds for the board and refuses a program that uses I/O on firmware that reports another one or none, or that touches an address the board has no channel for (see [Supported Boards](../reference/boards.md)). It is a command of its own for the same reason as `zplc sys build`: the keys of `zplc sys info --json` do not change.
- `zplc sys reboot` - Reboots the board with a software reset.
