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

Every lesson is completed in the **Simulation** track, on this computer, with no
board. A lesson lists **Hardware** only when a check against a trace recorded
from a board exists for it. At present no lesson offers one, and a lesson that
does not offer a track says why and what to do instead.

Each lesson has six stages (Objective, Predict, Edit, Run, Observe, Reflect), two
levels of hint and a reference solution you may ask to see. Studio records that
you looked at the solution.


## Why this order

The course starts with something that moves (module 0), then explains how a PLC thinks (module 1), then logic, time and data, then structure, and ends with proof, languages, communications and a capstone. Each module states why it sits where it does.


Available today: **15**. Planned: **14**. In all: **29**.


## Module 0: Getting ready: a tour of Studio, the simulation and, for hardware, checking your board

Foundation. Requires module: none. Tracks: Simulation, Hardware.

A first-time user needs to see something move before any theory. This module is a tour of Studio and the simulation, and it ends in a blinking simulated output within ten minutes.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `first-blink-simulation` Your first blink in simulation | Available | ST | Simulation | - | 10 | - |
| Check your board (wiring page per board) | Planned | none | Hardware | - | 10 | - |

Objectives of the available lessons:

- **Your first blink in simulation**: Run a program against a simulated output without any hardware. Change one value in Structured Text and see the output change in the trace.


## Module 1: How a PLC thinks: the scan cycle, then a first blink

Foundation. Requires module: 0. Tracks: Simulation, Hardware.

A PLC repeats one cycle: read inputs, run the program, write outputs. The scan cycle explains every later behaviour, so it comes first, followed by the first blink in Ladder and in Structured Text.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `scan-cycle-one-scan-memory` Scan cycle and one-scan memory | Available | ST | Simulation | - | 10 | `first-blink-simulation` |
| `blinky-ladder-timer-feedback` TON oscillator and output feedback | Available | LD | Simulation | - | 20 | `scan-cycle-one-scan-memory` |
| `blink-structured-text` Write a blinker in Structured Text | Available | ST | Simulation | - | 15 | `scan-cycle-one-scan-memory` |

Objectives of the available lessons:

- **Scan cycle and one-scan memory**: See that a variable keeps its value from one scan to the next. Build a one-scan delay and a one-scan pulse from a single memory.
- **TON oscillator and output feedback**: Read a two-timer Ladder oscillator: each timer runs in one half period and starts the next. Complete it with a SET coil and a RESET coil driven by the timers' Q outputs.
- **Write a blinker in Structured Text**: Write the timer-and-memory pattern that makes an output change state at a fixed interval. Gate an output with an input so that it stops at once when the input drops.


## Module 2: Boolean logic and latching: contacts, coils, seal-in, set and reset, safe stop

Foundation. Requires module: 1. Tracks: Simulation, Hardware.

Boolean logic is the vocabulary of every program. Contacts and coils lead to the seal-in, then to set and reset, and finally to stopping safely.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `motor-start-stop-safe` Safe motor start-stop | Available | ST | Simulation | - | 20 | `blinky-ladder-timer-feedback` |
| `boolean-logic-two-hand-guard` Boolean logic: a two-hand control with a guard | Available | ST | Simulation | - | 15 | `blinky-ladder-timer-feedback` |
| `set-reset-alarm-latch` Latching an alarm: set and reset, and which one wins | Available | ST | Simulation | - | 15 | `boolean-logic-two-hand-guard` |
| Seal-in in Ladder (edit a Ladder program) | Planned | LD | Simulation, Hardware | - | 20 | - |

Objectives of the available lessons:

- **Safe motor start-stop**: Hold the motor on after Start is released with a seal-in. Drop the motor out on Stop, EStop and Overload, and never let a held Start restart it by itself.
- **Boolean logic: a two-hand control with a guard**: Write a condition that is true only when several inputs are true together. Use NOT for a warning lamp and XOR for exactly one of two inputs.
- **Latching an alarm: set and reset, and which one wins**: Hold an alarm after the fault has gone, until it is acknowledged. Tell the set-dominant block SR from the reset-dominant block RS.


## Module 3: Timers, edges and counters

Foundation. Requires module: 2. Tracks: Simulation, Hardware.

Time and events come after logic: timers delay or hold a signal, edges turn a level into an event, and counters remember events.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `edge-counter-pulses` Edges and pulse counter | Available | ST | Simulation | - | 15 | `motor-start-stop-safe` |
| `timers-on-delay-off-delay` Timers: an off-delay light and an on-delay filter | Available | ST | Simulation | - | 15 | `motor-start-stop-safe` |
| Counters, and a blinker in Function Block Diagram | Planned | FBD | Simulation, Hardware | - | 20 | - |

Objectives of the available lessons:

- **Edges and pulse counter**: Count three rising edges of PulseInput with a CTU counter. Reset the count and CountReached with Reset.
- **Timers: an off-delay light and an on-delay filter**: Keep an output on for a fixed time after its input drops, using TOF. Ignore an input that is on for less than a fixed time, using TON.


## Module 4: Data: types, arithmetic, comparison, analog scaling

Intermediate. Requires module: 3. Tracks: Simulation, Hardware.

Real signals are numbers, not only on and off. Types, arithmetic, comparison and analog scaling prepare for processes.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| Types, arithmetic and comparison | Planned | ST | Simulation, Hardware | - | 20 | - |
| Analog scaling | Planned | FBD | Simulation, Hardware | - | 20 | - |


## Module 5: State machines and sequences

Intermediate. Requires module: 3. Tracks: Simulation, Hardware.

A machine that does things in order is a state machine. Sequences are written as states in Structured Text and as steps in Sequential Function Chart.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `pedestrian-crossing-states` Pedestrian crossing and safe states | Available | ST | Simulation | pedestrian-v1 | 25 | `edge-counter-pulses` |
| A sequence in Sequential Function Chart | Planned | SFC | Simulation, Hardware | - | 25 | - |

Objectives of the available lessons:

- **Pedestrian crossing and safe states**: Model the crossing as numbered states, each with an explicit output combination. Show WALK only while the vehicles are red.


## Module 6: Feedback, faults and interlocks

Intermediate. Requires module: 5. Tracks: Simulation, Hardware.

A command is not a fact: the plant must confirm it. Feedback, faults and interlocks teach a program to distrust what it asked for.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| `tank-level-fault-reset` Tank level, faults, and reset | Available | ST | Simulation | tank-v1 | 25 | `pedestrian-crossing-states` |
| `motor-plant-feedback` Command, feedback, and speed | Available | ST | Simulation | motor-v1 | 20 | `pedestrian-crossing-states` |
| Interlocks and permissives in Ladder | Planned | LD | Simulation, Hardware | motor-v1 | 20 | - |

Objectives of the available lessons:

- **Tank level, faults, and reset**: Keep the pump on from LevelLow until LevelHigh with a latch. Latch the alarm on PumpFault or EStop and release it only with a fresh Reset after the fault has cleared.
- **Command, feedback, and speed**: Separate the command to the motor from the confirmation that it runs. Keep the request until Stop and let Running follow the request only once AtSpeed arrives.


## Module 7: Structuring programs: functions, function blocks, structures, arrays, tasks

Intermediate. Requires module: 4. Tracks: Simulation, Hardware.

Programs grow. Functions, function blocks, structures, arrays and tasks keep them readable and reusable.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| Functions and function blocks | Planned | ST | Simulation, Hardware | - | 25 | - |
| Structures, arrays and tasks | Planned | FBD | Simulation, Hardware | - | 25 | - |


## Module 8: Testing and diagnosis: scenario tests, temporal assertions, trace, breakpoints

Advanced. Requires module: 6. Tracks: Simulation.

A program is only as good as its proof. Scenario tests, temporal assertions, traces and breakpoints turn a guess into evidence.

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

The same logic can be written in five languages. Instruction List closes the set of languages and shows what the others compile to.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| Instruction List | Planned | IL | Simulation, Hardware | - | 20 | - |
| One logic in five languages | Planned | all | Simulation, Hardware | - | 30 | - |


## Module 10: Communications: Modbus and MQTT basics

Advanced. Requires module: 7. Tracks: Simulation, Hardware.

Machines talk to each other. Modbus and MQTT basics run against endpoints that Studio starts on this computer, so no network or board is needed in simulation.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| Modbus basics with a loopback endpoint | Planned | ST | Simulation, Hardware | - | 25 | - |
| MQTT basics with a loopback endpoint | Planned | FBD | Simulation, Hardware | - | 25 | - |


## Module 11: Capstone: a small machine from description to tested program

Advanced. Requires module: 8. Tracks: Simulation, Hardware.

The course ends with a small machine taken from a written description to a tested program, using everything before it.

| Lesson | Status | Languages | Tracks | Plant | Minutes | Requires |
|---|---|---|---|---|---|---|
| Capstone: a small machine, from description to tested program | Planned | learner's choice | Simulation, Hardware | - | 60 | - |

## Hardware wiring pages

When the Hardware track exists, each supported board gets one wiring page that every lesson of the track points to. The pages are planned together with the board check of module 0; none is written yet.
