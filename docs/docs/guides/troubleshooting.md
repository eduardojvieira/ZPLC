---
slug: /guides/troubleshooting
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: 'What a symptom means and what to do about it: installing, building, simulating, testing, connecting and deploying.'
tags: [how-to, troubleshooting]
---

# Troubleshooting

Find your symptom, read what it means, and do the one thing in the last column. Each row links the page that explains it. If your symptom is not here, open an issue from the bug report template and leave out credentials and device identifiers.

## First checks

Three commands narrow most problems down. Run them on the project folder in this order. The first that fails names the part that is wrong ([Use the command line](./command-line.md)).

```bash
zplc-cli validate path/to/project
zplc-cli check path/to/project
zplc-cli test path/to/project
```

`validate` checks the project file and its sources. `check` runs the build. `test` runs the scenarios on the simulator. A project that passes all three and still misbehaves on a board has a problem only a board shows: read the rows for connecting.

## Installing and starting

| Symptom                                                                               | What it means                                                                                 | What to do                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Windows says **Windows protected your PC**, or blocks the file with no **Run anyway** | The installer is unsigned. SmartScreen warns, and Smart App Control blocks every unsigned app | [First launch](../getting-started/install.md#first-launch) |
| macOS says it cannot verify the app, or that it is damaged                            | The app has no developer identity and is not notarized                                        | [First launch](../getting-started/install.md#macos)        |
| The checksum does not match                                                           | The download is incomplete, or it is not the published file                                   | Download it again. Never open a file whose hash differs    |
| ZPLC from source says the simulator is missing                                        | The native runtime is a separate program                                                      | `bun run build:runtime`, then start ZPLC again             |

## Building

| Symptom                                                          | What it means                                                         | What to do                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Problems** lists an error with a line and a column             | The compiler refused the source at that place                         | Fix the line. The message says why                                                                          |
| A build fails naming the board and a variable                    | The variable is located where the board has no channel                | [Map variables to pins](./map-io.md): choose a channel of the board, or list the address under `io.virtual` |
| A build fails at a task definition                               | A task has `trigger` `event` or `interrupt`, which do not exist       | Use `cyclic` ([Scheduler](../runtime/scheduler.md#task-model))                                              |
| A build fails with `Task ... must reference exactly one PROGRAM` | Each task runs one program                                            | Give each task one program in `zplc.json`                                                                   |
| A warning `IMPLICIT_NARROWING`                                   | A wider value is stored in a narrower variable and keeps its low bits | Convert explicitly, or set `compiler.strictTypes` to make it an error                                       |

## Simulating and testing

| Symptom                                        | What it means                                                                         | What to do                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Connect** fails in Simulate mode             | The native runtime did not start                                                      | Build it (`bun run build:runtime`) or set `ZPLC_NATIVE_SIM_BIN`. Until then the status bar shows the degraded WASM fallback ([Simulate and debug](./simulate-and-debug.md#which-simulator-runs)) |
| A scenario fails with an assertion at a time   | The program did not do what the scenario expects at that instant                      | Run to that cycle with a breakpoint: [Simulate and debug](./simulate-and-debug.md)                                                                                                               |
| A scenario is refused as invalid               | A time is not a multiple of `tickMs`, a signal does not exist, or a limit is exceeded | [Scenario file format](../reference/scenario-file.md)                                                                                                                                            |
| The Tests tab will not run a scenario          | A force is active                                                                     | Release the forces ([Force a value](./force-values.md))                                                                                                                                          |
| `LED_Output` never changes in Watch            | The program is not running, or the variable is not the one that is located            | Check that the status line says **Running**, and check the variable's address                                                                                                                    |
| A retained value is back at its declared value | The program was rebuilt, or the store belongs to another program                      | [Keep values across restarts](./retained-variables.md#3-what-discards-the-values)                                                                                                                |

## Connecting a board and deploying

| Symptom                                   | What it means                                                                                                                                                                                                              | What to do                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The serial port is refused on Linux       | Your user is not in the serial group                                                                                                                                                                                       | [Linux: serial port access](../getting-started/install.md#linux-serial-port-access)                                                                                                                             |
| Deploy is refused naming a board          | The project was built for another board than the device reports                                                                                                                                                            | Select the right board, rebuild, and reflash if the firmware is not the one of the project                                                                                                                      |
| Deploy is refused with two draft numbers  | The program and the runtime come from different drafts of the binary contract. The current draft is 6. A program built before it is refused, and the ZPLC application refuses a device whose firmware reports an older one | Rebuild the program and reflash the board together ([Draft contract counter](../contributing/index.md#draft-contract-counter)). `tools/contract/restamp_artifacts.py` moves artifacts committed to a repository |
| The device received an earlier build      | The deploy did not carry the current program                                                                                                                                                                               | Build, then deploy again before **Run**                                                                                                                                                                         |
| A board does not come back after flashing | Firmware recovery is the board's own procedure                                                                                                                                                                             | [Recovery boundaries](../operations/recovery.md)                                                                                                                                                                |

## Communication blocks

A communication block reports its result in `STATUS`. [The handshake](../runtime/communication-function-blocks.md#the-handshake) explains `EN`, `BUSY`, `DONE` and `ERROR`.

| Symptom                                      | What it means                                                                                                                                                                                                                                              | What to do                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `STATUS` 3 (no handler)                      | This runtime has no handler for the block. A native runtime started by hand, without `ZPLC_NATIVE_COMM=1`, answers every block this way                                                                                                                    | Start the runtime from ZPLC, which turns the blocks on ([In simulation](../runtime/communication-function-blocks.md#in-simulation)) |
| `STATUS` 10 (not available)                  | The service of the block is not in this runtime, or is off in the configuration. In simulation this is the answer of a Modbus RTU request, of every cloud block, and of an MQTT block with no broker. The WASM fallback answers it for every network block | Use a board, or a configuration that turns the service on                                                                           |
| `STATUS` 2 (timeout)                         | The peer did not answer, or the request outlived its limit: 8.8 s for Modbus with the default timeout, 5 s for a publish, 90 s for a provisioning                                                                                                          | Check the peer and the link. A late result is dropped                                                                               |
| `STATUS` 4 (not connected)                   | The session or the link is not connected                                                                                                                                                                                                                   | Check the settings with `zplc mqtt status` and `zplc net status`                                                                    |
| `STATUS` 5 (queue full)                      | Every request slot is in use                                                                                                                                                                                                                               | Wait for the requests in flight. A rising `EN` while `BUSY` is TRUE starts nothing                                                  |
| `DONE` or `ERROR` stays TRUE                 | The result is held while `EN` stays TRUE, and nothing is repeated                                                                                                                                                                                          | Let `EN` fall for one cycle to ask again                                                                                            |
| MQTT does nothing on a device                | MQTT is off and has no broker until an operator sets one                                                                                                                                                                                                   | [Secure defaults](../runtime/connectivity.md#secure-defaults)                                                                       |
| `zplc config set mqtt_security 1` is refused | A release image will not turn certificate verification off                                                                                                                                                                                                 | By design. Only an image built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS` accepts it                                                |

## What is verified, and what is not

| Part                                                                                                              | Verified                                                                                                                                                        | Level |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| The three commands of the first checks pass on a bundled project                                                  | Run on `blinky_st`, as the [command line page](./command-line.md) records                                                                                       | Host  |
| The names the rows quote (diagnostic codes, project keys, Kconfig symbols, shell commands, `STATUS` values) exist | Read against the compiler diagnostics, the project schema, the Kconfig and shell references and the function block reference, and checked by `check_doc_claims` | Host  |
| Each symptom happens as described, and the action fixes it                                                        | Not reproduced one by one: the rows come from the sources and the install page                                                                                  | None  |
| The signing rows on Windows and macOS                                                                             | Not reproduced on a Windows or a macOS machine                                                                                                                  | None  |

## See also

- [Install ZPLC](../getting-started/install.md), [Command line](./command-line.md) and [The ZPLC shell](../operations/shell.md).
- [Safety and limitations](../safety-and-limitations.md).
