---
slug: /release-notes
id: index
title: Release Notes
sidebar_label: Release Notes
description: What is new in ZPLC 2.0.0, what breaks when you move from 1.x, how to migrate, and what is not verified.
tags: [releases, changelog]
---

# ZPLC 2.0.0 release notes

ZPLC 2.0 is a new major version of the application, the compiler and the runtime. This page says what you can now do,
what stops working, the steps to move from 1.x, and what has not been verified. The full engineering record is in
`CHANGELOG.md` in the repository.

:::warning Evaluation release
ZPLC 2.0.0 is for evaluation. No board has been flashed, booted or run, so every board is at the `cross-build` level.
The installers are unsigned, and ZPLC is not a safety PLC and must not control machinery:
[Safety and limitations](../safety-and-limitations.md).
:::

## Highlights

- **A course inside the application.** Learn has 68 lessons in English and Spanish, a Ladder path that starts at zero,
  and a hardware track for the Raspberry Pi Pico and the ESP32-S3-DevKitC-1.
- **Reading pages with a lab inside.** Ladder lessons open on a page over the workbench that you can try without leaving it.
- **Ladder function boxes.** Comparison, math and other functions sit in a rung with EN and ENO wires.
- **A simulator that follows the target.** The same scheduler core runs on your computer and in the firmware.
- **Five languages, one bytecode.** Structured Text, Instruction List, Ladder, Function Block Diagram and Sequential
  Function Chart compile to one format.
- **Documentation you can trust.** Function names, settings, shell commands, file paths, counts and code samples on the
  site are checked against the repository by CI, in English and in Spanish.

## What changed for you

### Learn reading mode and the Ladder path

Learn now teaches in two steps. A lesson that has a **reading page** opens it first, over the workbench: a
short explanation, drawings of Ladder rungs, and a **try-it lab**. **Practice** closes the page and opens the lesson
beside the editor, **Back to course** returns to the Learn home, and **Read again** on the lesson panel brings the page
back.

![The Ladder path of the Learn home, with its first lesson ready to start](/img/screens/learn-path-en.png)

The **Ladder path**, called _Ladder diagram from zero_, is the first path of the Learn home. It is a complete course for
someone who has never programmed a PLC: what a PLC is, the scan cycle, contacts and coils, series and parallel, sets and
resets, timers, edges and counters, sequences, function blocks, diagnosis in the simulator, and a final project, a packing
station. Every lesson of the path has a reading page.

![The reading page of the first lesson: an explanation, with the lab further down](/img/screens/learn-reading-en.png)

The lab is a small simulation inside the page. It does nothing on its own: you press **Run**, then press and hold a button
or switch a switch, and you see the power flow along the rungs, the lamps and a timing chart. It runs on the WebAssembly
build of the same runtime as the simulator, so it is a host result.

![The try-it lab of the first lesson, running, with the porch light lit](/img/screens/learn-lab-en.png)

You still practise and are graded in the editor: **Check** runs your saved program against the scenario of the lesson. See
[Learn](../learn/index.md) and the [course outline](../learn/course-outline.md).

### Ladder function boxes

A Ladder rung can now hold IEC functions as boxes with **EN** and **ENO**: comparisons, math and scaling among them. EN is
the power that reaches the box and ENO is the power that leaves it. You pick a box from the **Functions** group of the
palette, bind its operands to variables, and see each operand, the output and both wires live while you monitor. Several
boxes may write one variable. The [Ladder reference](../reference/language-ld.md#function-boxes) has the list and the rules.

![A Ladder rung of the compare-and-math lesson project, with ADD and MOVE function boxes in the editor](/img/screens/ld-function-box-en.png)

### The application

- **ZPLC saves your work and tells you what happened.** It keeps a copy of every modified file and offers it back after a
  crash, shows each build, save, deploy and test result as a notification that opens its details, can cancel a long
  operation, and keeps the preferences you set. A project exports to one archive and imports back byte for byte.
- **The project tree does more.** New folder, rename, move and duplicate keep the open tabs and breakpoints, a change made
  outside ZPLC is picked up, and a folder of library blocks is offered to every editor.
- **Boards are described once.** `firmware/app/boards/boards.json` holds the channels, addresses and safe values of each
  board. The I/O mapping editor reads it, and a variable on an address the board does not have is a build error.
- **An assistant that proposes and a person who decides.** The optional AI assistant and the MCP server can read your
  project and propose changes in a candidate change set, which you review and save. They cannot flash, deploy, force a
  value, start or stop a program, open a serial port or run a shell ([AI and MCP](../guides/ai-and-mcp.md)).
- **ZPLC tells you about a newer release.** With the optional check turned on, a dismissible notice names the release.
  Nothing is downloaded or installed.

### The language and the simulation

- **The language is more correct.** `LREAL` and the 64-bit integers work, structures, enumerations and arrays keep their
  declared width, strings no longer modify their arguments, the timers and counters follow IEC 61131-3, and a build says
  which element of an IL, Ladder, FBD or SFC file a message is about.
- **Simulation is closer to the target.** Tasks of different intervals run, each released on its own interval, a deadline
  miss is counted, any input of the running program can be set or forced, and `VAR RETAIN` values are kept from one run to
  the next.
- **The simulation falls back to the browser engine.** When the native runtime cannot start, ZPLC runs the same core built
  to WebAssembly. The status bar says **WASM fallback · degraded** and lists what it lacks.
- **Scenario tests give the same answer everywhere.** The application, the command line and the MCP server run them the
  same way, and the **Interlocks** tab lists which pairs of outputs are asserted never to be on together.
- **A project declares the safe value of an output**, and the build carries it with the program.

### Boards and releases

- **A controller is safe on a plant network by default.** MQTT is off until an operator names a broker, TLS verifies the
  certificate, no command prints a credential, and no message from Modbus, MQTT or a cloud service can start or stop the
  program, set a force or load a program.
- **A release carries the firmware of every board**, with its checksum and the evidence level of its board. In **Project
  settings**, **Target**, ZPLC shows the image of your board and the steps to flash it. ZPLC does not flash: you do.
- **The Linux packages let you open a board's serial port**, through a udev rule for the boards whose USB identifier is
  recorded.
- **Releases are made by a pipeline you can read.** A rehearsal runs everything and publishes nothing, the notes say which
  check each file passed, and every file has a checksum and a build attestation.
- **The documentation was rewritten.** One page for each task, a tutorial with a real screenshot for each step, guides for
  Modbus, MQTT and Sparkplug B, the cloud blocks, mapping I/O, forcing values, retained values, scenario tests, project
  archives, the command line, debugging, AI and MCP, and porting. The reference pages are generated from the source.

## Breaking changes

- **Rebuild every program and reflash every board.** The binary contract has a draft counter, and a program or a firmware
  image of another draft is refused by the loader, the runtime, the firmware shell and the application, with both numbers.
- **A `VAR_IN_OUT` of a function block is passed by reference.** A block called without binding it faults; rebuild programs
  that declare one.
- **Event and interrupt tasks fail the build.** A task with `trigger` `event` or `interrupt` is an error at its definition
  in `zplc.json`; use `cyclic`.
- **The default MQTT broker is gone.** A controller that relied on `test.mosquitto.org` has MQTT off until its operator
  names a broker, and the default transport is TLS on port 8883 with the certificate verified.
- **The board file moved.** `supported-boards.v1.5.0.json` is replaced by `firmware/app/boards/boards.json`.
- **A text no longer converts to a number, a `BOOL` or a time**, and a constant array index outside the bounds is a build
  error. Programs that relied on either now fail to build, with the line.
- **A rebuild discards retained values**, because a program that differs by one byte has another identity.
- **There is no hosted browser build.** ZPLC is the desktop application. The WebAssembly fallback of the simulator stays.
- **The consecutive deadline misses that latch a fault are 3 instead of 1** on every runtime
  (`CONFIG_ZPLC_DEADLINE_MISS_LIMIT`; set it to 1 for the earlier behavior).

## Migration from 1.x

1. Rebuild every program with this version and reflash every board with firmware of the same version.
2. Run `zplc-cli migrate-preview` on a version 1 project and read the difference before you accept it:
   [Migrate a v1 project](../ide/migration-v1-to-v2.md).
3. Name the MQTT broker of every controller that used the old default, and install its CA certificate, or set the
   transport you need.
4. Change a task that used `event` or `interrupt` to a cyclic task.
5. Read the board file from `firmware/app/boards/boards.json` in any tool of yours that read the versioned file.
6. The product is called ZPLC, and the application stores its data in a folder named `ZPLC`. On the first start it copies
   the folder of the release candidates (`ZPLC IDE`) once and leaves the old folder in place. A stored AI assistant key
   may need to be entered again.
7. Installer files are named `zplc-<version>-<os>-<arch>`: [Install ZPLC](../getting-started/install.md).

## Known issues

- **No board has been flashed, booted or run.** Every board is at the `cross-build` level, and nothing is verified on a
  physical device ([Hardware support](../reference/capabilities-evidence.md)). The steps of
  [Your first board](../tutorials/first-board.md) have not been executed.
- **No communication exchange was tested with a real device, broker or service.** The Modbus, MQTT, Sparkplug B and cloud
  blocks were tested against stand-ins and loopback servers, and no cloud block was verified against a service. The
  handshake of the communication blocks and the separation of the four Modbus data areas are not final.
- **Retained values** are proven on the host, `native_sim` and the simulator only; every shipped board profile turns persistence on, and no board has been measured.
- **TLS is off on the Nucleo-H743ZI and the Arduino Opta** until their random generator is verified on the board, so MQTT
  runs over plain TCP there.
- **The browser runtime is degraded.** It was run on one engine, its timing is the browser's, its communication blocks
  answer `STATUS` 10, and it has no serial port and no pins ([Browser runtime](../runtime/browser-runtime.md)).
- **The installers are unsigned.** Windows asks you to confirm the first launch and macOS needs **Open Anyway**
  ([Install ZPLC](../getting-started/install.md)).
- **The installers were not launched by a hosted run.** The release workflow installs or mounts and launches every
  installer format on its own system before it makes the draft, but no hosted release run has executed them yet.
- **Timing is not measured on any board**, and ZPLC is not a safety PLC.

## Evidence boundaries

- Host, simulation, cross-build and workflow evidence do not establish bench results, target timing, electrical behavior,
  board qualification or safety certification.
- Linux artifacts are checksummed and attested; they are not signed.
- AI and MCP do not initiate flash, deploy, force, RUN/STOP, recovery, raw serial or shell actions.
- A hardware claim needs a traceable physical test for the board and the exact commit: build, flash, identity and hash,
  deploy, a golden scenario, reboot and persistence, safe outputs, and timing. See
  [Hardware in the loop](../development/hardware-in-the-loop.md).

Do not infer feature parity, timing performance or physical safety from this page or from the presence of source code.
