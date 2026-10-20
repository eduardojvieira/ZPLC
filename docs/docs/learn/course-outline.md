---
slug: /learn/course-outline
id: course-outline
title: Course outline
sidebar_label: Course outline
description: "Every module and lesson of the Learn course, in order, with its languages, tracks, plant and estimated time, and which lessons exist today."
tags: [learn, lessons, course]
---

# Course outline

This page lists the whole course: every module in order, the lessons that exist
today and the lessons that are planned. It matches `packages/zplc-ide/lessons/course.json`
and the lesson packages next to it; a CI check fails when a lesson is missing here or
when a row disagrees with its lesson.

Each module and each lesson has its own page, generated from the lesson packages: start from the [course modules](./modules/index.md), and see the [lesson plants](./plants.md) for the simulated machines.

Every lesson is completed in the **Simulation** track, on this computer, with no
board. A lesson lists **Hardware** when it has a wiring page for each learner board
and its board check is defined; no hardware run has been recorded on a board yet.
A lesson that does not offer a track says why and what to do instead.

Each lesson has six stages (Objective, Predict, Edit, Run, Observe, Reflect), two
levels of hint and a reference solution you may ask to see. Studio records that
you looked at the solution.


## Why this order

You see a result first: the tour of module 0 ends in a blinking output in simulation. The scan cycle comes next, because seal-in, edges and timers cannot be understood without it, and a first blink in Ladder and in Structured Text follows at once. Every later module builds on the ones before it, and communications and the capstone come last because they need everything before them.

Each module below says why it sits where it does. The Learn home of Studio shows the same words, taken from the same course file.


Available today: **28**. Planned: **1**. In all: **29**.


## Languages

Each of the five languages is introduced by a lesson whose objective names it, and each is the language of the program you edit, and that is graded, in at least one lesson. The first blink is offered twice in module 1: in Ladder and in Structured Text. A test of the lesson packages (LRN-008) keeps this table true.

| Language | Introduced by | Name |
|---|---|---|
| ST | `first-blink-simulation` | Structured Text |
| LD | `blinky-ladder-timer-feedback` | Ladder |
| FBD | `counter-batch-fbd` | Function Block Diagram |
| SFC | `sfc-fill-mix-sequence` | Sequential Function Chart |
| IL | `instruction-list-door-alarm` | Instruction List |

## Module 0: Getting ready: a tour of Studio, the simulation and, for hardware, checking your board

Foundation. Requires module: none. Tracks: Simulation, Hardware.

You see something move before any theory: a tour of Studio and the simulation that ends in a blinking output within ten minutes and, for the hardware track, a check of your board.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `first-blink-simulation` Your first blink in simulation | Available | ST | Simulation | - | 10 | - |
| `verify-my-board` Verify my board ([learner kits](../reference/learner-kits/index.md)) | Available | ST | Hardware | - | 30 | `first-blink-simulation` |

Objectives of the available lessons:

- **Your first blink in simulation**: Run a program against a simulated output without any hardware. Change one value in Structured Text and see the output change in the trace.


## Module 1: How a PLC thinks: the scan cycle, then a first blink

Foundation. Requires module: 0. Tracks: Simulation, Hardware.

A PLC repeats one cycle: read the inputs, run the program, write the outputs. Seal-in, edges and timers cannot be understood without the scan cycle, so it comes first, and a first blink in Ladder and in Structured Text follows at once.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `scan-cycle-one-scan-memory` Scan cycle and one-scan memory | Available | ST | Simulation, Hardware | - | 10 | `first-blink-simulation` |
| `blinky-ladder-timer-feedback` TON oscillator and output feedback | Available | LD | Simulation, Hardware | - | 20 | `scan-cycle-one-scan-memory` |
| `blink-structured-text` Write a blinker in Structured Text | Available | ST | Simulation, Hardware | - | 15 | `scan-cycle-one-scan-memory` |

Objectives of the available lessons:

- **Scan cycle and one-scan memory**: See that a variable keeps its value from one scan to the next. Build a one-scan delay and a one-scan pulse from a single memory.
- **TON oscillator and output feedback**: Read a two-timer Ladder oscillator: each timer runs in one half period and starts the next. Complete it with a SET coil and a RESET coil driven by the timers' Q outputs.
- **Write a blinker in Structured Text**: Write the timer-and-memory pattern that makes an output change state at a fixed interval. Gate an output with an input so that it stops at once when the input drops.


## Module 2: Boolean logic and latching: contacts, coils, seal-in, set and reset, safe stop

Foundation. Requires module: 1. Tracks: Simulation, Hardware.

Boolean logic is the vocabulary of every program. It is taught in Ladder beside Structured Text, because relay logic is how the subject is traditionally introduced and both views of the same logic reinforce each other: contacts and coils, then seal-in, set and reset, and a safe stop.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `boolean-logic-two-hand-guard` Boolean logic: a two-hand control with a guard | Available | ST | Simulation, Hardware | - | 15 | `blinky-ladder-timer-feedback` |
| `seal-in-ladder` Seal-in in Ladder: a motor that holds itself on | Available | LD | Simulation, Hardware | - | 20 | `boolean-logic-two-hand-guard` |
| `set-reset-alarm-latch` Latching an alarm: set and reset, and which one wins | Available | ST | Simulation, Hardware | - | 15 | `seal-in-ladder` |
| `motor-start-stop-safe` Safe motor start-stop | Available | ST | Simulation, Hardware | - | 20 | `set-reset-alarm-latch` |

Objectives of the available lessons:

- **Boolean logic: a two-hand control with a guard**: Write a condition that is true only when several inputs are true together. Use NOT for a warning lamp and XOR for exactly one of two inputs.
- **Seal-in in Ladder: a motor that holds itself on**: Read a Ladder rung as a path of contacts that must all pass power to reach a coil. Hold a coil on with a contact of its own output in parallel with Start, and keep Stop in series so that Stop wins.
- **Latching an alarm: set and reset, and which one wins**: Hold an alarm after the fault has gone, until it is acknowledged. Tell the set-dominant block SR from the reset-dominant block RS.
- **Safe motor start-stop**: Hold the motor on after Start is released with a seal-in. Drop the motor out on Stop, EStop and Overload, and never let a held Start restart it by itself.


## Module 3: Timers, edges and counters

Foundation. Requires module: 2. Tracks: Simulation, Hardware.

Time and events come after logic: timers delay or hold a signal, edges turn a level into an event and counters remember events. Function Block Diagram arrives here, because timers and counters are blocks.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `timers-on-delay-off-delay` Timers: an off-delay light and an on-delay filter | Available | ST | Simulation, Hardware | - | 15 | `motor-start-stop-safe` |
| `edge-counter-pulses` Edges and pulse counter | Available | ST | Simulation, Hardware | - | 15 | `timers-on-delay-off-delay` |
| `counter-batch-fbd` Counters in Function Block Diagram: count parts to a batch | Available | FBD | Simulation, Hardware | - | 20 | `edge-counter-pulses` |

Objectives of the available lessons:

- **Timers: an off-delay light and an on-delay filter**: Keep an output on for a fixed time after its input drops, using TOF. Ignore an input that is on for less than a fixed time, using TON.
- **Edges and pulse counter**: Count three rising edges of PulseInput with a CTU counter. Reset the count and CountReached with Reset.
- **Counters in Function Block Diagram: count parts to a batch**: Read a Function Block Diagram as blocks whose output ports are wired to the input ports of other blocks. Wire a CTU counter: a rising edge on CU counts, R clears it, and Q is TRUE when the count reaches the preset PV.


## Module 4: Data: types, arithmetic, comparison, analog scaling

Intermediate. Requires module: 3. Tracks: Simulation, Hardware.

Real signals are numbers, not only on and off. Types, arithmetic, comparison and analog scaling prepare for the processes that follow.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `types-arithmetic-comparison` Types, arithmetic and comparison: a total and three bands | Available | ST | Simulation, Hardware | - | 20 | `edge-counter-pulses` |
| `analog-scaling-integer` Analog scaling: from raw counts to a percentage | Available | ST | Simulation, Hardware | - | 20 | `types-arithmetic-comparison` |

Objectives of the available lessons:

- **Types, arithmetic and comparison: a total and three bands**: Use an INT variable for a number and a BOOL variable for a yes or no, and see that a comparison turns a number into a BOOL. Add to a number only on the rising edge of an input, so that a button held for several scans counts once.
- **Analog scaling: from raw counts to a percentage**: Scale a raw count to engineering units with a multiplication followed by a division, in that order. See that integer division drops the remainder, and choose an integer type wide enough for the intermediate product.


## Module 5: State machines and sequences

Intermediate. Requires module: 3. Tracks: Simulation, Hardware.

A machine that does things in order is a state machine. Sequences are written as states in Structured Text, and Sequential Function Chart arrives with them, as steps.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `pedestrian-crossing-states` Pedestrian crossing and safe states | Available | ST | Simulation | pedestrian-v1 | 25 | `edge-counter-pulses` |
| `sfc-fill-mix-sequence` A sequence in Sequential Function Chart: fill, then mix | Available | SFC | Simulation, Hardware | - | 25 | `edge-counter-pulses` |

Objectives of the available lessons:

- **Pedestrian crossing and safe states**: Model the crossing as numbered states, each with an explicit output combination. Show WALK only while the vehicles are red.
- **A sequence in Sequential Function Chart: fill, then mix**: Read a Sequential Function Chart as steps that are active one at a time, actions that run while their step is active, and transitions that move the activity. Add a timed transition that uses the elapsed time of a step.


## Module 6: Feedback, faults and interlocks

Intermediate. Requires module: 5. Tracks: Simulation, Hardware.

A command is not a fact: the plant must confirm it. Once a program can run a sequence, feedback, faults and interlocks teach it to distrust what it asked for.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `motor-plant-feedback` Command, feedback, and speed | Available | ST | Simulation | motor-v1 | 20 | `pedestrian-crossing-states` |
| `tank-level-fault-reset` Tank level, faults, and reset | Available | ST | Simulation | tank-v1 | 25 | `motor-plant-feedback` |
| `interlock-guard-permissive` Interlocks and permissives: a guard that stops the motor | Available | ST | Simulation | motor-v1 | 20 | `pedestrian-crossing-states` |

Objectives of the available lessons:

- **Command, feedback, and speed**: Separate the command to the motor from the confirmation that it runs. Keep the request until Stop and let Running follow the request only once AtSpeed arrives.
- **Tank level, faults, and reset**: Keep the pump on from LevelLow until LevelHigh with a latch. Latch the alarm on PumpFault or EStop and release it only with a fresh Reset after the fault has cleared.
- **Interlocks and permissives: a guard that stops the motor**: Tell a permissive, a condition that must be true for the output to be on, from a command. Put a permissive in the same condition that holds the motor, so that it drops the motor and also stops Start from restarting it.


## Module 7: Structuring programs: functions, function blocks, structures, arrays, tasks

Intermediate. Requires module: 4. Tracks: Simulation, Hardware.

Programs grow. Once you work with data, functions, function blocks, structures, arrays and tasks keep a program readable and reusable.

The two lessons below cover function blocks, structures and arrays; no graded lesson covers tasks yet, because a scenario runs one task.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `function-block-pump-pair` Function blocks: one latch, two pumps | Available | ST | Simulation, Hardware | - | 25 | `types-arithmetic-comparison` |
| `structures-arrays-call-panel` Structures and arrays: a panel of three calls | Available | ST | Simulation, Hardware | - | 25 | `function-block-pump-pair` |

Objectives of the available lessons:

- **Function blocks: one latch, two pumps**: Write a function block with inputs, an output and a memory that lives between calls. See that two instances of the same function block keep separate memories.
- **Structures and arrays: a panel of three calls**: Declare a structure with named members and an array of that structure, and reach an element with an index and a member name. Replace three copies of the same code with one FOR loop over the array.


## Module 8: Testing and diagnosis: scenario tests, temporal assertions, trace, breakpoints

Advanced. Requires module: 6. Tracks: Simulation.

Testing comes once you have programs worth testing. Scenario tests, temporal assertions, traces and breakpoints turn a guess into evidence.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `conveyor-classification-jam` Conveyor classification and safe jam | Available | ST | Simulation | conveyor-v1 | 25 | `motor-plant-feedback`, `tank-level-fault-reset` |
| `temporal-assertions-jam-fault` Temporal assertions and jam fault | Available | ST | Simulation | - | 25 | `conveyor-classification-jam` |
| `conveyor-two-parts-diagnosis` Reproducible diagnosis: two parts, one decision | Available | ST | Simulation | - | 20 | `conveyor-classification-jam` |

Objectives of the available lessons:

- **Conveyor classification and safe jam**: Stop the belt and light FaultLamp while the plant reports JamDetected. Keep Reset from releasing the fault while the jam is still present.
- **Temporal assertions and jam fault**: Latch the jam fault and prove its timing with temporal assertions. Require a new Start before the belt moves again after the fault is released.
- **Reproducible diagnosis: two parts, one decision**: Distinguish a metal part from a non-metal part with one memory that lives between two sensors. Read a scheduled input timeline and predict the outputs before running it.


## Module 9: Instruction List, and one logic in five languages

Advanced. Requires module: 7. Tracks: Simulation, Hardware.

Instruction List comes late, as a way to read low-level and legacy code. It closes the set of languages, and the same logic is then written in all five.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `instruction-list-door-alarm` Instruction List: the current result and the order of instructions | Available | IL | Simulation, Hardware | - | 20 | `function-block-pump-pair` |
| `one-logic-five-languages` One logic in five languages: a gate that holds itself open | Available | ST, LD, FBD, SFC, IL | Simulation, Hardware | - | 30 | `instruction-list-door-alarm` |

Objectives of the available lessons:

- **Instruction List: the current result and the order of instructions**: Read an Instruction List program as one current result that each instruction combines with an operand, from top to bottom. Use LD, AND, OR, ANDN and ST, and see that moving one instruction changes the logic.
- **One logic in five languages: a gate that holds itself open**: Hold an output on after its request is released, and let a close command win, in Structured Text. Recognise the same condition, (Request OR Open) AND NOT Close, in Instruction List, Ladder, Function Block Diagram and Sequential Function Chart.


## Module 10: Communications: Modbus and MQTT basics

Advanced. Requires module: 7. Tracks: Simulation, Hardware.

Communications come last because they need everything before them. In simulation, Modbus and MQTT run against endpoints that Studio starts on this computer, so no network or board is needed.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `modbus-register-round-trip` Modbus TCP: write a register and read it back | Available | ST | Simulation | - | 25 | `structures-arrays-call-panel` |
| `mqtt-publish-subscribe` MQTT: publish a message and receive it | Available | ST | Simulation | - | 25 | `modbus-register-round-trip` |

Both lessons are graded against a Modbus TCP server and an MQTT broker that Studio starts inside the simulation session, on this computer, so no network, installed broker or board is needed. These are protocol doubles: they show how the blocks and their handshake behave, and they do not show that a real device, broker or cloud service accepts the same exchange. No hardware track exists for them because no trace of a real device has been recorded.

Objectives of the available lessons:

- **Modbus TCP: write a register and read it back**: Write a holding register with MB_WRITE_HREG and read it back with MB_READ_HREG, using the DONE output of the first block as the trigger of the second. Compare the value read with the value written, report an ERROR from either block, and say what a loopback double shows and what it does not.
- **MQTT: publish a message and receive it**: Tell a service block (MQTT_CONNECT, MQTT_SUBSCRIBE) from a request block (MQTT_PUBLISH), publish only after the subscription holds, and keep a message that VALID reports for one scan only.


## Module 11: Capstone: a small machine from description to tested program

Advanced. Requires module: 8. Tracks: Simulation, Hardware.

The course ends with a small machine taken from a written description to a tested program, using everything before it.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `capstone-packing-station` Capstone: a packing station, from description to tested program | Available | ST | Simulation | - | 60 | `conveyor-two-parts-diagnosis` |

Objectives of the available lessons:

- **Capstone: a packing station, from description to tested program**: Turn five written requirements into one Structured Text program that combines a seal-in, an emergency stop, a counter, a timer and a latched fault. Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.

## Hardware wiring pages

When the Hardware track exists, each supported board gets one wiring page that every lesson of the track points to. The pages are planned together with the board check of module 0; none is written yet.
