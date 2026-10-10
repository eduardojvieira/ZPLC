---
slug: /contributing/principles
id: principles
title: Engineering principles
sidebar_label: Principles
description: The nine rules every ZPLC change must respect, in plain language, with what each one asks of you.
tags: [contributing, principles]
---

# Engineering principles

ZPLC controls machines, so a change is judged by more than whether it works. The
project keeps nine rules in its
[engineering constitution](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md),
which is the normative text. This page says what each rule asks of you when you
change something and where the repository checks it. If this page and the
constitution ever disagree, the constitution wins, and the disagreement is a bug
to report.

## The rules

### 1. The core is portable C99 and goes through the HAL

The runtime core in `firmware/lib/zplc_core/src/core/` is strict ANSI C99 and
never calls a driver, a register or an operating-system function. Everything
passes through the `zplc_hal_*` functions. Desktop tooling and the language front
end follow the same rule: none of them reaches hardware around the HAL. The core
builds with `-std=c99 -pedantic -Werror`, and platform code lives under
`src/hal/`.

### 2. A behaviour change comes with a test that can fail

Before you change risky behaviour, add or strengthen a focused test, then run the
host, target or bench checks that fit the change. A test asserts behaviour: it
runs a program in the VM or renders a screen. It does not read source text.
CI runs every layer, and the expected-failure list keeps known failures visible
instead of hidden.

### 3. Everything that crosses a boundary is untrusted

Bytecode loading, persistence, IPC, filesystem access, device control and
external input are trust boundaries. Validate before you change any state, and
keep the diagnostic. The loader verifies a program before it runs, and the
Electron main process validates the sender and the schema of the requests it
accepts.

### 4. Outputs fail safe

Every output has a documented safe state, normally off, and that state is the
default. A reboot, a timeout, a fault, a watchdog failure, lost communication or
an invalid program must never lead to an unsafe automatic resume of control.

### 5. Build, flash, deploy and run are separate, and a person starts each

Building firmware, flashing it, deploying a PLC program and running or debugging
are four operations with four pieces of evidence. Each physical operation needs
explicit human authorization.

### 6. Electron is deny-by-default

The renderer is sandboxed and reaches the main process only through a narrow
preload API. Every IPC request has a validated sender and schema. There is no
generic shell and no generic filesystem access.

### 7. Claims are tiered by evidence

Host, QEMU, target build, bench (hardware-in-the-loop) and manual results are
different levels, and a lower level never proves a higher one. Say which level
backs each claim in documentation, in a commit message and in a pull request.
See [Capabilities and evidence tiers](../reference/capabilities-evidence.md).

### 8. English and Spanish stay in step, and a dependency needs a reason

Public documentation exists in both languages and changes in both at once. A new
dependency needs a concrete need and a recorded architectural justification.

### 9. AI and MCP help inside the workspace and never act on hardware

An AI assistant or an MCP client may inspect, plan, compile, test and simulate
within the approved workspace. It must not flash, deploy to hardware, force I/O,
change RUN or STOP, open a raw serial port or run a shell. Studio works fully
without AI.

## Using the rules

- **When you write a change,** use the rules to decide where code goes and how it
  is tested. [Architecture](https://github.com/eduardojvieira/ZPLC/blob/master/ARCHITECTURE.md)
  shows the layers they refer to.
- **When you review one,** the pull-request template asks the questions that
  these rules raise.
- **When a rule is in the way,** open an issue that names the rule and the
  reason. A change to the constitution is its own pull request.
