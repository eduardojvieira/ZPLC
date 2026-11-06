---
slug: /contributing/principles
id: principles
title: Engineering principles
sidebar_label: Principles
description: The nine rules every ZPLC change must respect, in plain language, with what each one asks of you.
tags: [contributing, principles]
---

# Engineering principles

ZPLC controls machines, so a change is judged by more than whether it works. This page turns the nine rules of the project into what each one asks of you when you change something, and where the repository checks it. The rules themselves are in the [engineering constitution](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md), which is the normative text: if this page and the constitution disagree, the constitution wins, and the disagreement is a bug to report.

## The rules

### 1. The core is portable C99 and goes through the HAL

The runtime core, `firmware/lib/zplc_core/src/core/`, is strict ANSI C99. It never calls a driver, a register or an operating-system function; it reaches the outside only through the `zplc_hal_*` functions. The desktop tools and the language front end obey the same rule: none of them reaches hardware around the HAL. CMake builds the core as C99 with `-pedantic` and `-Werror`, and platform code lives under `firmware/lib/zplc_core/src/hal/`.

### 2. A behaviour change comes with a test that can fail

Before you change risky behaviour, add or strengthen one focused test, then run the host, target or bench checks that fit the change. A test asserts behaviour: it runs a program in the VM or renders a screen, and it does not read source text. CI runs every layer, and the expected-failure list keeps known failures visible instead of hidden.

### 3. Everything that crosses a boundary is untrusted

Loading bytecode, persistence, IPC, filesystem access, device control and external input are trust boundaries. Validate before you change any state, and keep the diagnostic. The loader verifies a program before it runs, and the Electron main process validates the sender and the schema of every request it accepts.

### 4. Outputs fail safe

Every output has a documented safe state, normally off, and that state is the default. A reboot, a timeout, a fault, a watchdog failure, a lost connection or an invalid program must never lead to an unsafe automatic resume of control.

### 5. Build, flash, deploy and run are separate, and a person starts each

Building firmware, flashing it, deploying a PLC program and running or debugging it are four operations with four pieces of evidence. Each physical operation needs explicit human authorization.

### 6. Electron is deny-by-default

The renderer is sandboxed and reaches the main process only through a narrow preload API. Each IPC request has a validated sender and schema. There is no generic shell and no generic filesystem access.

### 7. Claims are tiered by evidence

Host, QEMU, target build, bench (hardware-in-the-loop) and manual results are different levels, and a lower level never proves a higher one. Name the level that backs each claim in documentation, in a commit message and in a pull request. [Hardware support](../reference/capabilities-evidence.md) lists the level of each capability.

### 8. English and Spanish stay in step, and a dependency needs a reason

Public documentation exists in both languages and changes in both at once. A new dependency needs a concrete need and a recorded architectural justification.

### 9. AI and MCP help inside the workspace and never act on hardware

An AI assistant or an MCP client may inspect, plan, compile, test and simulate inside the approved workspace. It must not flash, deploy to hardware, force I/O, change RUN or STOP, open a raw serial port or run a shell. ZPLC works fully without AI.

## Spanish pages

The Spanish pages are written from the English text, in neutral Spanish with impersonal or "usted" forms (decision D-10). The Spanish pages were reviewed against the English text. The generated reference pages quote English source text by design: the C headers, the Kconfig help and the notes of a board are not translated.

## Using the rules

- **When you write a change,** use the rules to decide where code goes and how it is tested. [Architecture](https://github.com/eduardojvieira/ZPLC/blob/master/ARCHITECTURE.md) shows the layers they refer to.
- **When you review one,** the pull-request template asks the questions these rules raise.
- **When a rule is in the way,** open an issue that names the rule and the reason. A change to the constitution is its own pull request.
