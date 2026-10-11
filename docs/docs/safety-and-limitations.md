---
slug: /safety-and-limitations
id: safety-and-limitations
title: Safety and limitations
sidebar_label: Safety and limitations
description: "What ZPLC is not, where each part has been checked, and the hard limits of the current release."
tags: [safety, limits, evidence]
---

# Safety and limitations

Read this page before you rely on ZPLC for anything beyond learning and
simulation. It is the one place that says what ZPLC is not, where each part has
been checked, and which limits are hard. Other pages link here instead of
repeating it.

## What ZPLC is not

- **It is not a safety PLC.** ZPLC makes no safety integrity claim, and no part
  of it has been certified or assessed against a functional-safety standard.
- **It must not control machinery** or protect people: not as an emergency stop,
  an interlock or a guard. The interlock view of Studio checks that your
  scenarios assert a pair of outputs never on together; it checks the scenarios,
  not the machine.
- **It does not guarantee timing.** A task interval is the period of a release
  and the deadline of a scan. No board has a measured scan time, jitter or
  worst-case execution time, and the simulator runs on a clock of its own.
- **It is not a finished product.** The current release is a prerelease for
  evaluation: see [Release notes](./release-notes/index.md) and the
  [roadmap](./contributing/roadmap.md).
- **It does not claim a board.** Every board of the table in
  [Hardware support](./reference/capabilities-evidence.md) is at the level its
  records say, and today that level is cross-build for all of them.

## Where each part has been checked

A check at one level never proves a higher one. The names of the levels are the
ones of [Hardware support](./reference/capabilities-evidence.md#the-levels).

| Part | Checked on | Not checked |
| --- | --- | --- |
| Compiler and virtual machine | The host, with the address and undefined-behaviour sanitizers, by the conformance suite and the C suites | A board |
| Scheduler, process image, retentive memory, communication handlers | `native_sim` and the QEMU Cortex-M3 and Cortex-M0 targets, which emulate a processor and no board | Timing, interrupts, drivers, flash behaviour and electrical state of a real board |
| Firmware of each board | Built for the board and held to its flash and RAM budget | Booting, flashing, running a program, any output |
| Studio and the simulator | The development host on Linux, by the end-to-end journeys; installers are launched on their own system in the release run | A physical board; a clean machine of each system, by a person (the recorded runs of `RELEASING.md` are empty) |
| Modbus, MQTT, Sparkplug B and the cloud blocks | The handlers against stand-ins, the Modbus TCP client and the simulation runtime's MQTT client against servers written for the test on a loopback socket, hostile input through the product's own client, and the Modbus server framing and areas | A live broker, a cloud service or a device on a wire; the controller's MQTT client against a broker; Modbus RTU on a wire |
| Outputs when the program pauses, stops or faults | The host and `native_sim`, which has a GPIO emulator | The physical level of a pin on a board |

The detail, with the commands that produce each result, is in
[Firmware testing](./development/firmware-testing.md) and
[Contributing](./contributing/index.md).

## Hard limits

These limits are in the release you have. They are read from the source, not
estimated; each row names where the number comes from.

| Limit | Value | Where it is defined |
| --- | --- | --- |
| Tasks in one program | 16 | The schema of [`zplc.json`](./reference/project-file.md) |
| Interval of a task | 1 to 3 600 000 ms | [Scheduler](./runtime/scheduler.md) |
| Kinds of task | Cyclic only: an event or interrupt task is a build error | [Scheduler](./runtime/scheduler.md) |
| Size of a compiled program | 45 056 bytes in the native runtime and by default; each board sets its own | `CONFIG_ZPLC_CODE_SIZE_MAX` in the [Kconfig reference](./reference/kconfig.md) and the footprint table of [Supported boards](./reference/boards.md) |
| Working and retentive memory | 8 192 and 4 096 bytes by default; each board sets its own | [Kconfig reference](./reference/kconfig.md) and the footprint table of [Supported boards](./reference/boards.md) |
| Scenario | 256 events, 256 expectations, 64 signals, 10 000 samples | [Scenario file format](./reference/scenario-file.md) |
| Retentive values | Lost when the program is rebuilt; not proven to survive a power cut on any board | [Persistence and retained memory](./runtime/persistence.md) |

Language features that do not work yet are listed, with the cases that fail, in
the [Structured Text page](./languages/st.md) and the
[standard library page](./runtime/stdlib.md); both are generated from the
list of expected failures, so a limit leaves the list when its case is fixed.

## Outputs and faults

- Every output has a documented safe value, normally off, and that value is the
  default. A reboot, a timeout, a fault or an invalid program must never lead to
  an automatic resume of control ([Engineering principles](./contributing/principles.md)).
- On a board, a pause, a step and a stop also drive the physical outputs to their
  safe value. A fault clears the process image and the forces as a stop does.
  [Scheduler](./runtime/scheduler.md#pause-resume-step-and-stop) has the table of
  what each action keeps and clears, with the tests behind it.
- The safe value of every channel of a board is part of its
  [I/O description](./reference/boards.md#the-io-description).

## Operations on a device

- Building firmware, flashing it, deploying a program and running or debugging
  are four separate operations, and a person starts each one that touches a
  physical device. AI assistants and the MCP server cannot flash, deploy, force
  a value, start or stop a program, open a serial port or run a shell
  ([AI, privacy and human review](./ide/ai-privacy.md)).
- No message that arrives from Modbus, MQTT or a cloud service changes run state,
  sets or clears a force, or downloads a program
  ([Connectivity](./runtime/connectivity.md#what-a-message-from-the-network-can-do)).

## Secrets and security

- None of the supported boards has a protected store: credentials are saved with
  the other settings and anybody who can read the flash of the board can read
  them. Use an account with only the rights the controller needs.
- The installers are not signed with a paid identity. Check the checksum of
  every download: [Install ZPLC Studio](./getting-started/install.md).
- On the Nucleo-H743ZI and the Arduino Opta, TLS is off until their random
  generator has been verified on the board, and MQTT runs over plain TCP.
- Report a vulnerability through a private advisory, as the
  [security policy](https://github.com/eduardojvieira/ZPLC/blob/master/SECURITY.md) says.

## If you need more than this

If a limit of this page blocks you, the way forward is a hardware record or a
change to the runtime, and both are tracked in the open: see the roadmap and the
release notes. Do not work around a limit by trusting the simulator: it shows
what the logic does, not what a board does.
