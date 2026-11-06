---
slug: /operations/shell
id: shell
title: Use the device shell
sidebar_label: Device shell
description: Inspect, debug and configure a ZPLC board from a serial terminal with the zplc shell commands, grouped by task.
tags: [operations, debugging, shell]
---

# Use the device shell

The firmware adds a `zplc` command set to the Zephyr shell on the board's console UART. Use it to read the state of a board, debug a program and set the device configuration from a terminal, without the ZPLC application. This page groups the commands by what you want to do. [Shell commands](../reference/shell-commands.md) is the generated table of every subcommand, with its arguments and the Kconfig symbol that enables it, so look there for a command this page does not mention.

## Open the shell

Connect a serial terminal (PuTTY, `screen`, Minicom) to the virtual COM port of the board, usually at 115200 baud, and start each command with `zplc`. A desktop simulation has no shell. It speaks the [session protocol](../reference/runtime-protocol.md).

:::note Evidence level: target build
The commands are read from the firmware command table, which the reference page is generated from. No session on a real board is recorded.
:::

## Check what the board is

- `zplc version` prints the version, the commit the image was built from (and whether the tree had uncommitted changes), the board, the bytecode ABI, the contract draft and the build options with their hash. It prints no build date, so two builds of one commit are the same image. `zplc sys build` prints the same text, and with `--json` it prints it as one object.
- `zplc status` shows the runtime state. While MQTT runs over TLS with certificate verification off, it also shows `WARNING: MQTT tls-verify: OFF` (`"warnings":["mqtt_tls_verify_off"]` with `--json`).
- `zplc sys info` shows the system, build and hardware details. With `--json` it also reports the draft counter and the largest program the board accepts (`CONFIG_ZPLC_CODE_SIZE_MAX`). A program built for another draft is refused ([Contributing](../contributing/index.md#draft-contract-counter)).
- `zplc sys io` shows the identity of the board I/O description the image was built from. The ZPLC application compares its hash with the description it holds and refuses a program that uses I/O the board does not have ([Boards](../reference/boards.md)).
- `zplc sys reset` tells why the processor was last reset and which fault it left.

## Control the runtime

- `zplc start` and `zplc stop` start and stop the scheduler. Stop is not a pause: it also zeroes the output image, clears the force table and returns every task to its entry point ([Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop)).
- `zplc reset` reloads the program from the program store and leaves the scheduler stopped. The store holds the only resident copy, so an upload in progress is cancelled. With no program loaded it only stops the scheduler and clears its tasks.
- `zplc sys reboot` reboots the board with a software reset.
- `zplc sched status` and `zplc sched tasks` show the scheduler state and the configured tasks, with their priority and cycle-time measurements, when the firmware is built with `CONFIG_ZPLC_SCHEDULER`.

## Load a program by hand

The application normally does this for you. By hand, `zplc load <size>` prepares the runtime to receive a `.zplc` file of that many bytes, and `zplc data <hex>` sends the next chunk in hexadecimal. It refuses to start while the runtime is faulted: run `zplc reset` first. `zplc sched load` and `zplc sched data` are the same pair under the scheduler.

## Debug a program

`zplc dbg` gives direct access to the execution state, the memory and the breakpoints.

- **Breakpoints.** `zplc dbg bp add <pc>`, `bp remove <pc>`, `bp list` and `bp clear`.
- **Pause and step.** `zplc dbg pause` stops the scheduler between scans, puts the physical outputs in their safe state and keeps the output image and the force table. `zplc dbg resume` continues a scan that stopped at a breakpoint, and the first scan commit drives the outputs again from the kept image. `zplc dbg step` finishes that scan, or runs one whole scan, and pauses at the next cycle boundary or the next breakpoint.
- **Forces.** `zplc dbg force set <addr> <hexbytes>` overrides the program's own assignments to an address. `force list` shows them, `force clear <addr>` removes one and `force clear_all` removes all.
- **Memory.** `zplc dbg mpeek addr:len[,addr:len...]` reads blocks, `zplc dbg poke <addr> <value>` writes, `zplc dbg mem <ipi|opi|work|retain> [offset]` dumps a region and `zplc dbg info` shows the machine state and the current PC. `zplc dbg watch <addr> [type]` prints one value as `bool`, `i8`, `i16`, `i32`, `u8` (the default), `u16`, `u32` or `f32`. It is a snapshot, not a stream.
- **Timers and tasks.** `zplc dbg ticks` prints the tick count in milliseconds, `zplc dbg task <task_id>` shows one task and `zplc dbg timer <addr>` decodes the `TON`, `TOF` or `TP` instance at an address into `IN`, `Q`, `PT` and `ET`.

Every command that takes an address works inside the four PLC regions (input image, output image, work and retain) and refuses any other address. Reads come from the snapshot the last scan published, so a value is whole and from one scan, and a read never waits for a scan. A `poke` is queued and applied at the input latch of the next scan through the force-aware interface, so a forced address keeps its forced value. While the runtime is stopped there is no scan, and the write is applied at once.

### Raw memory (diagnostic firmware only)

The Zephyr `devmem` command reads and writes any address of the device. Release firmware does not build it (`CONFIG_DEVMEM_SHELL=n`). The diagnostic image does:

```bash
west build -b <board> firmware/app -- -DEXTRA_CONF_FILE=diagnostic.conf
```

`diagnostic.conf` sets `CONFIG_ZPLC_SHELL_RAW_MEMORY=y` together with `CONFIG_DEVMEM_SHELL=y`. The application build stops with an error when only one of them is set, so the command cannot reach a release image by accident. Use a diagnostic image on a bench, never on a controller connected to a plant.

## Read and change the configuration

- `zplc config get` shows the configuration. A password, a key or a user name appears as `(set)` or `(not set)`, and no command and no log line prints its value.
- `zplc config set <key> <val>` changes a setting in memory.
- `zplc config save` writes every setting that `config get` reports, and the Modbus mapping overrides, to the non-volatile store the program uses. It prints `OK: Config saved` only after every entry was written. Otherwise it prints `ERROR: Failed to save config: <code>` and exits with that code, where `-134` means the firmware keeps no stored settings.
- `zplc config reset` puts the defaults in memory and saves them, so they apply after the next reboot too.

A device that was never configured has MQTT off, no broker, and TLS with a verified certificate when you turn MQTT on ([Secure defaults](../runtime/connectivity.md#secure-defaults)). `zplc config set mqtt_security 1` turns verification off. A release image refuses it with `ERROR: this firmware cannot turn TLS certificate verification off`. An image built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y` accepts it, prints a warning, and shows `tls-verify: OFF` in `zplc mqtt status` and `zplc status` for as long as it stays set.

## Connect to a network

- `zplc net status` shows the IPv4 address, the gateway and the MAC address on a board with network hardware.
- `zplc wifi connect` joins Wi-Fi with the credentials stored by `zplc config set wifi_ssid`, `wifi_pass` and `wifi_security`, and never stores them. A board with an SSID stored also joins by itself at boot and after a drop, in a background work item that never delays a scan. It waits 2 s after the first failure, doubling up to 60 s. `zplc status --json` reports the link as `wifi.state` (`unconfigured`, `connecting`, `connected`, `retrying`, or `unsupported` on a board without Wi-Fi) and `wifi.ip`. Neither the SSID nor the password is logged.
- `zplc ntp status`, `enable`, `disable`, `server <hostname>` and `sync` control SNTP time synchronization.

## Inspect MQTT and Modbus

- `zplc mqtt status` shows the broker, the client ID and `tls-verify`: `on` (TLS, certificate checked), `OFF` (TLS, not checked, with a warning line) or `n/a` (plain TCP). With `--json` it adds `"tls_verify"`. `zplc mqtt reset_backoff` resets the reconnect delay.
- `zplc comm map` shows the communication bindings and the Modbus server mappings. `zplc comm set modbus <index> <address>` overrides one server mapping and `zplc comm clear modbus <index>` removes the override.

## Install TLS certificates

A secured broker, such as AWS IoT Core, needs certificates on the board. `zplc cert status` shows whether the CA certificate, the client certificate and the private key are installed, and their sizes. To store one, run `zplc cert begin <ca|client|key> <size>`, send the data with `zplc cert chunk <hex>` as many times as it takes, then `zplc cert commit`. `zplc cert erase <ca|client|key>` removes one. No command prints a stored certificate or key.

## Hardware checks

The `zplc adc` commands exist only when the firmware is built with `CONFIG_ADC`: `zplc adc temp` reads the processor temperature when the board has the sensor, and `zplc adc read <channel>` reads one channel. `zplc hil mode`, `status`, `watch` and `reset` are the hardware-in-the-loop hooks, and `zplc dbg trace` records the input and output images per scan for the Learn hardware check.
