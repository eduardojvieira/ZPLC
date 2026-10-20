---
slug: /guides/troubleshooting
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "What a symptom means and what to do about it: installing, building, simulating, testing, connecting and deploying."
tags: [how-to, troubleshooting]
---

# Troubleshooting

Find the symptom, read what it means, and do the one thing that the last column says.
Each row names the page that explains it. If the symptom is not here, open an issue
from the bug report template and leave out credentials and device identifiers.

## First checks

Three commands narrow most problems down before any row below. Run them on the
project folder; the first one that fails names the part that is wrong
([Use the command line](./command-line.md)):

```bash
zplc-cli validate path/to/project
zplc-cli check path/to/project
zplc-cli test path/to/project
```

`validate` is the project file and its sources, `check` is the build, and `test` is the
scenarios on the simulator. A project that passes all three and still misbehaves on a
board has a problem that only a board shows: read the rows for connecting.

## Installing and starting

| Symptom | What it means | What to do |
| --- | --- | --- |
| Windows says **Windows protected your PC**, or blocks the file with no **Run anyway** | The installer is unsigned: SmartScreen warns, and Smart App Control blocks every unsigned app | [First launch](../getting-started/install.md#first-launch) |
| macOS says it cannot verify the app, or that it is damaged | The app has no developer identity and is not notarized | [First launch](../getting-started/install.md#macos) |
| The checksum does not match | The download is incomplete, or it is not the published file | Download it again; do not open a file whose hash differs |
| ZPLC from source says the simulator is missing | The native runtime is a separate program | `bun run build:runtime`, then start ZPLC again |

## Building

| Symptom | What it means | What to do |
| --- | --- | --- |
| **Problems** lists an error with a line and a column | The compiler refused the source at that place | Fix the line; the message says why |
| A build fails naming the board and a variable | The variable is located where the board has no channel | [Map variables to pins](./map-io.md): choose a channel of the board, or list the address under `io.virtual` |
| A build fails at a task definition | A task has `trigger` `event` or `interrupt`, which do not exist | Use `cyclic` ([Scheduler](../runtime/scheduler.md#task-model)) |
| A build fails with `Task ... must reference exactly one PROGRAM` | Each task runs one program | Give each task one program in `zplc.json` |
| A warning `IMPLICIT_NARROWING` | A wider value is stored in a narrower variable and keeps its low bits | Convert explicitly, or set `compiler.strictTypes` to make it an error |

## Simulating and testing

| Symptom | What it means | What to do |
| --- | --- | --- |
| **Connect** fails in Simulate mode | The native runtime did not start | Build it (`bun run build:runtime`) or set `ZPLC_NATIVE_SIM_BIN` |
| A scenario fails with an assertion at a time | The program did not do what the scenario expects at that instant | Run to that scan with a breakpoint: [Simulate and debug](./simulate-and-debug.md) |
| A scenario is refused as invalid | A time is not a multiple of `tickMs`, a signal does not exist, or a limit is exceeded | [Scenario file format](../reference/scenario-file.md) |
| `LED_Output` never changes in Watch | The program is not running, or the variable is not the one that is located | Check the status line says **Running**, and the variable's address |
| A retained value is back at its declared value | The program was rebuilt, or the store belongs to another program | [Keep values across restarts](./retained-variables.md#3-what-discards-the-values) |

## Connecting a board and deploying

| Symptom | What it means | What to do |
| --- | --- | --- |
| The serial port is refused on Linux | Your user is not in the serial group | [Linux: serial port access](../getting-started/install.md#linux-serial-port-access) |
| Deploy is refused naming a board | The project was built for another board than the device reports | Select the right board, rebuild, and reflash if the firmware is not the one of the project |
| Deploy is refused with two draft numbers | The program and the runtime come from different drafts of the binary contract. The current draft is 5: a program built before it is refused, and the ZPLC application refuses a device whose firmware reports an older one | Rebuild the program and reflash the board together ([Draft contract counter](../contributing/index.md#draft-contract-counter)); `tools/contract/restamp_artifacts.py` moves artifacts committed to a repository |
| The device received an earlier build | The deploy did not carry the current program | Build, then deploy again before **Run** |
| A board does not come back after flashing | Firmware recovery is the board's own procedure | [Recovery boundaries](../operations/recovery.md) |

## Communication

| Symptom | What it means | What to do |
| --- | --- | --- |
| A communication block ends with `ERROR` and `STATUS` 3 | No handler: this runtime has no handler for the block. The ZPLC simulator starts the runtime without the communication blocks | Expected in the ZPLC simulator; the exchange needs a board ([Modbus](./modbus.md), [MQTT](./mqtt-sparkplug.md)) |
| `STATUS` 10 | Not available: the service of the block is not in this runtime, or is off in the configuration. With the communication blocks on in simulation, a Modbus RTU request, every cloud block and an MQTT block with no broker answer it | Use a board, or a configuration that turns the service on |
| `STATUS` 2 | The peer did not answer, or the request outlived its time limit: 8.8 s for Modbus with the default timeout, 5 s for a publish, 90 s for a provisioning | Check the peer and the link; a late result is dropped |
| `STATUS` 4 | The session or the link is not connected | Check the settings with `zplc mqtt status` and `zplc net status` |
| `STATUS` 5 | Every request slot is in use | Wait for the requests in flight: a rising `EN` while `BUSY` is TRUE starts nothing |
| `DONE` or `ERROR` stays TRUE | The result is held while `EN` stays TRUE, and nothing is repeated | Let `EN` fall for one scan to ask again ([The handshake](../runtime/communication-function-blocks.md#the-handshake)) |
| MQTT does nothing on a device | MQTT is off and has no broker until an operator sets one | [Secure defaults](../runtime/connectivity.md#secure-defaults) |
| `zplc config set mqtt_security 1` is refused | A release image will not turn certificate verification off | By design; only an image built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS` accepts it |

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| The three commands of the first checks pass on a bundled project | Run on `blinky_st`, as the [command line page](./command-line.md) records | Host |
| The names that the rows quote (diagnostic codes, project keys, Kconfig symbols, shell commands, `STATUS` values) exist | Read by hand against the compiler diagnostics, the project schema, the Kconfig and shell references and the function block reference | Host |
| Each symptom happens as described, and the action fixes it | Not reproduced one by one: the rows come from the sources and the install page | None |
| The signing rows on Windows and macOS | Not reproduced on a Windows or a macOS machine | None |

## See also

- [Install ZPLC](../getting-started/install.md), [Command line](./command-line.md) and [The ZPLC shell](../operations/shell.md).
- [Safety and limitations](../safety-and-limitations.md).
