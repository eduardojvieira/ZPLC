---
slug: /learn/course-outline
id: course-outline
title: Course outline
sidebar_label: Course outline
description: 'Every module and lesson of the Learn course, in order, with its languages, tracks, plant and estimated time, and which lessons exist today.'
tags: [learn, lessons, course]
---

# Course outline

This page is the map of the whole course: every module in order, with its 97 lessons, and for each lesson the languages, tracks, plant, time and prerequisites. Use it to pick where to start or to see what a module needs first. If you have never programmed a PLC, take the Ladder path of 21 of these lessons, _Ladder diagram from zero_, described in [Learn](./index.md).

The page follows `packages/zplc-ide/lessons/course.json` and the lesson packages beside it. A CI check fails when a lesson is missing here or a row disagrees with its lesson. Each module and each lesson also has its own generated page: start from the [course modules](./modules/index.md), and see the [lesson plants](./plants.md) for the simulated machines.

How to read the tables:

- **Simulation.** Every lesson can be completed in this track, on your computer, with no board.
- **Hardware.** A lesson lists this track when it has a wiring page for each learner board and its board check is defined. No hardware run has been recorded on a board yet.
- **No track.** A lesson that does not offer a track says why and what to do instead.
- **Stages.** Each lesson has six stages (Objective, Predict, Edit, Run, Observe, Reflect), two levels of hint and a reference solution you may ask to see. ZPLC records that you looked at the solution.

## Why this order

You see a result first: the tour of module 0 ends in a blinking output in simulation. The scan cycle comes next, because seal-in, edges and timers cannot be understood without it, and a first blink in Ladder and in Structured Text follows at once. Every later module builds on the ones before it, and communications and the capstone come last because they need everything before them.

Each module below says why it sits where it does. The Learn home shows the same words, because both read the same course file.

Available today: **97**. Planned: **0**. In all: **97**.

## Languages

Each of the five languages is introduced by one lesson whose objective names it, and each is the language of a program you edit and that is graded in at least one lesson. The first blink is offered twice in module 1, in Ladder and in Structured Text. A test of the lesson packages keeps this table true.

| Language | Introduced by                      | Name                      |
| -------- | ---------------------------------- | ------------------------- |
| ST       | `first-blink-simulation`           | Structured Text           |
| LD       | `ld-what-is-a-plc`                 | Ladder                    |
| FBD      | `boolean-logic-two-hand-guard-fbd` | Function Block Diagram    |
| SFC      | `sfc-fill-mix-sequence`            | Sequential Function Chart |
| IL       | `boolean-logic-two-hand-guard-il`  | Instruction List          |

## Module 0: Getting ready: a tour of ZPLC, the simulation and, for hardware, checking your board

Foundation. Requires module: none. Tracks: Simulation, Hardware.

You see something move before any theory: a tour of ZPLC and the simulation that ends in a blinking output within ten minutes and, for the hardware track, a check of your board.

| Lesson                                                                                 | Status    | Languages | Tracks     | Plant | Minutes | Requires                 |
| -------------------------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | ------------------------ |
| `first-blink-simulation` Your first blink in simulation                                | Available | ST        | Simulation | -     | 10      | -                        |
| `verify-my-board` Verify my board ([learner kits](../reference/learner-kits/index.md)) | Available | ST        | Hardware   | -     | 30      | `first-blink-simulation` |

Objectives of the available lessons:

- **Your first blink in simulation**: Run a program against a simulated output without any hardware. Change one value in Structured Text and see the output change in the trace.
- **Verify my board**: Check that the board ZPLC reaches is the board you chose. See an LED blink on the board. Read a push button on the board.

## Module 1: How a PLC thinks: the scan cycle, then a first blink

Foundation. Requires module: 0. Tracks: Simulation, Hardware.

A PLC repeats one cycle: read the inputs, run the program, write the outputs. Seal-in, edges and timers cannot be understood without the scan cycle, so it comes first, and a first blink in Ladder and in Structured Text follows at once.

| Lesson                                                             | Status    | Languages | Tracks               | Plant | Minutes | Requires                     |
| ------------------------------------------------------------------ | --------- | --------- | -------------------- | ----- | ------- | ---------------------------- |
| `ld-what-is-a-plc` What a PLC is: your first rung                  | Available | LD        | Simulation           | -     | 15      | -                            |
| `ld-scan-cycle` The scan cycle: why the order of the rungs matters | Available | LD        | Simulation           | -     | 15      | `ld-what-is-a-plc`           |
| `scan-cycle-one-scan-memory` Scan cycle and one-scan memory        | Available | ST        | Simulation, Hardware | -     | 10      | `first-blink-simulation`     |
| `blinky-ladder-timer-feedback` TON oscillator and output feedback  | Available | LD        | Simulation, Hardware | -     | 20      | `scan-cycle-one-scan-memory` |
| `blink-structured-text` Write a blinker in Structured Text         | Available | ST        | Simulation, Hardware | -     | 15      | `scan-cycle-one-scan-memory` |

Objectives of the available lessons:

- **Scan cycle and one-scan memory**: See that a variable keeps its value from one scan to the next. Build a one-scan delay and a one-scan pulse from a single memory.
- **TON oscillator and output feedback**: Read a two-timer Ladder oscillator: each timer runs in one half period and starts the next. Complete it with a SET coil and a RESET coil driven by the timers' Q outputs.
- **Write a blinker in Structured Text**: Write the timer-and-memory pattern that makes an output change state at a fixed interval. Gate an output with an input so that it stops at once when the input drops.
- **What a PLC is: your first rung**: Name the three parts of a PLC system: inputs that read the world, a program that decides, and outputs that act on the world. Complete a Ladder rung in which a pressed button lights a lamp, and read the result in the simulated lab.
- **The scan cycle: why the order of the rungs matters**: Describe the scan cycle: read the inputs, solve the rungs from top to bottom, write the outputs, and repeat. Reorder two rungs so that a value is calculated before the rung that uses it, and see the difference of one scan in the recorded trace.

## Module 2: Boolean logic and latching: contacts, coils, seal-in, set and reset, safe stop

Foundation. Requires module: 1. Tracks: Simulation, Hardware.

Boolean logic is the vocabulary of every program. It is taught in Ladder beside Structured Text, because relay logic is how the subject is traditionally introduced and both views of the same logic reinforce each other: contacts and coils, then seal-in, set and reset, and a safe stop.

| Lesson                                                                                                      | Status    | Languages | Tracks               | Plant | Minutes | Requires                                                       |
| ----------------------------------------------------------------------------------------------------------- | --------- | --------- | -------------------- | ----- | ------- | -------------------------------------------------------------- |
| `ld-no-nc-contacts` NO and NC contacts: a stop button that fails safe                                       | Available | LD        | Simulation           | -     | 20      | `blinky-ladder-timer-feedback`                                 |
| `ld-series-parallel` Series and parallel: AND and OR with contacts                                          | Available | LD        | Simulation           | -     | 20      | `ld-no-nc-contacts`                                            |
| `boolean-logic-two-hand-guard` Boolean logic: a two-hand control with a guard                               | Available | ST        | Simulation, Hardware | -     | 15      | `blinky-ladder-timer-feedback`                                 |
| `seal-in-ladder` Seal-in in Ladder: a motor that holds itself on                                            | Available | LD        | Simulation, Hardware | -     | 20      | `boolean-logic-two-hand-guard`                                 |
| `set-reset-alarm-latch` Latching an alarm: set and reset, and which one wins                                | Available | ST        | Simulation, Hardware | -     | 15      | `seal-in-ladder`                                               |
| `motor-start-stop-safe` Safe motor start-stop                                                               | Available | ST        | Simulation, Hardware | -     | 20      | `set-reset-alarm-latch`                                        |
| `boolean-logic-two-hand-guard-ladder` Boolean logic in Ladder: a two-hand guard                             | Available | LD        | Simulation, Hardware | -     | 20      | `boolean-logic-two-hand-guard`, `blinky-ladder-timer-feedback` |
| `set-reset-alarm-latch-ladder` Latching an alarm in Ladder: SET and RESET coils, and the order of the rungs | Available | LD        | Simulation, Hardware | -     | 20      | `set-reset-alarm-latch`, `blinky-ladder-timer-feedback`        |
| `boolean-logic-two-hand-guard-fbd` Function Block Diagram: a two-hand control with a guard                  | Available | FBD       | Simulation, Hardware | -     | 20      | `boolean-logic-two-hand-guard`                                 |
| `boolean-logic-two-hand-guard-il` Instruction List: the current result in a two-hand control                | Available | IL        | Simulation, Hardware | -     | 15      | `boolean-logic-two-hand-guard`                                 |
| `set-reset-alarm-latch-il` Instruction List: S and R, and the line that comes last                          | Available | IL        | Simulation, Hardware | -     | 15      | `set-reset-alarm-latch`, `boolean-logic-two-hand-guard-il`     |

Objectives of the available lessons:

- **Boolean logic: a two-hand control with a guard**: Write a condition that is true only when several inputs are true together. Use NOT for a warning lamp and XOR for exactly one of two inputs.
- **Seal-in in Ladder: a motor that holds itself on**: Read a Ladder rung as a path of contacts that must all pass power to reach a coil. Hold a coil on with a contact of its own output in parallel with Start, and keep Stop in series so that Stop wins.
- **Latching an alarm: set and reset, and which one wins**: Hold an alarm after the fault has gone, until it is acknowledged. Tell the set-dominant block SR from the reset-dominant block RS.
- **Safe motor start-stop**: Hold the motor on after Start is released with a seal-in. Drop the motor out on Stop, EStop and Overload, and never let a held Start restart it by itself.
- **Boolean logic in Ladder: a two-hand guard**: Read series contacts as AND, a normally closed contact as NOT and two parallel paths as OR. Build an exclusive-or (exactly one hand) from two parallel paths of two contacts each.
- **Latching an alarm in Ladder: SET and RESET coils, and the order of the rungs**: Hold an alarm after the fault has gone with a SET coil, and clear it only with a RESET coil. Decide the priority between set and reset by the order of the rungs: the last one scanned wins.
- **Function Block Diagram: a two-hand control with a guard**: Read a Function Block Diagram: blocks are joined by wires from an output port to an input port, and each output shows the result of the blocks wired to it. Wire AND, NOT and XOR blocks so that an output is ON only when several inputs are ON together, when one input is OFF, or when exactly one of two inputs is ON.
- **Instruction List: the current result in a two-hand control**: Read an Instruction List (IL) program as one current result that each instruction combines with an operand, from top to bottom. Use LD, LDN, AND, XOR and ST to turn three inputs into three outputs.
- **Instruction List: S and R, and the line that comes last**: Hold an alarm after the fault has gone, until it is acknowledged, with the IL instructions S and R. Use the order of two lines to decide whether set or reset wins, and tell it from the SR and RS blocks.
- **NO and NC contacts: a stop button that fails safe**: Explain why a stop button is wired normally closed, and what a field NC button looks like to the program: TRUE at rest, FALSE when pressed or when the wire breaks. Choose the right kind of contact in a rung: a normally open contact passes power when its variable is TRUE, a normally closed contact when it is FALSE.
- **Series and parallel: AND and OR with contacts**: Explain that contacts in series pass power only when all of them conduct (AND), and contacts in parallel pass power when any of them conducts (OR). Add a parallel path to a rung so that a horn sounds when the door is open or the motor is overheated, and check it against every row of a truth table.

## Module 3: Timers, edges and counters

Foundation. Requires module: 2. Tracks: Simulation, Hardware.

Time and events come after logic: timers delay or hold a signal, edges turn a level into an event and counters remember events. Function Block Diagram arrives here, because timers and counters are blocks.

| Lesson                                                                                                      | Status    | Languages | Tracks               | Plant | Minutes | Requires                                                        |
| ----------------------------------------------------------------------------------------------------------- | --------- | --------- | -------------------- | ----- | ------- | --------------------------------------------------------------- |
| `timers-on-delay-off-delay` Timers: an off-delay light and an on-delay filter                               | Available | ST        | Simulation, Hardware | -     | 15      | `motor-start-stop-safe`                                         |
| `ld-edges` Edges in Ladder: P and N contacts and one-scan pulses                                            | Available | LD        | Simulation           | -     | 15      | `set-reset-alarm-latch-ladder`                                  |
| `edge-counter-pulses` Edges and pulse counter                                                               | Available | ST        | Simulation, Hardware | -     | 15      | `timers-on-delay-off-delay`                                     |
| `counter-batch-fbd` Counters in Function Block Diagram: count parts to a batch                              | Available | FBD       | Simulation, Hardware | -     | 20      | `edge-counter-pulses`                                           |
| `timers-on-delay-off-delay-ladder` On-delay and off-delay in Ladder: timers as blocks in a rung             | Available | LD        | Simulation, Hardware | -     | 20      | `timers-on-delay-off-delay`, `blinky-ladder-timer-feedback`     |
| `edge-counter-pulses-ladder` Counting pulses in Ladder: a CTU counts the edges itself                       | Available | LD        | Simulation, Hardware | -     | 20      | `edge-counter-pulses`, `blinky-ladder-timer-feedback`           |
| `timers-on-delay-off-delay-fbd` Timers in Function Block Diagram: an off-delay light and an on-delay filter | Available | FBD       | Simulation, Hardware | -     | 20      | `timers-on-delay-off-delay`, `boolean-logic-two-hand-guard-fbd` |
| `timers-on-delay-off-delay-il` Instruction List: calling an off-delay and an on-delay timer                 | Available | IL        | Simulation, Hardware | -     | 15      | `timers-on-delay-off-delay`, `boolean-logic-two-hand-guard-il`  |
| `edge-counter-pulses-il` Instruction List: counting pulses with a CTU                                       | Available | IL        | Simulation, Hardware | -     | 15      | `edge-counter-pulses`, `boolean-logic-two-hand-guard-il`        |

Objectives of the available lessons:

- **Timers: an off-delay light and an on-delay filter**: Keep an output on for a fixed time after its input drops, with a TOF instance called on every scan. Ignore an input that is on for less than a fixed time, with a TON instance.
- **Edges and pulse counter**: Count three rising edges of PulseInput with a CTU counter. Reset the count and CountReached with Reset.
- **Counters in Function Block Diagram: count parts to a batch**: Read a Function Block Diagram as blocks whose output ports are wired to the input ports of other blocks. Wire a CTU counter: a rising edge on CU counts, R clears it, and Q is TRUE when the count reaches the preset PV.
- **On-delay and off-delay in Ladder: timers as blocks in a rung**: Place a timer function block in a rung, with the contact feeding its IN and its output feeding the coil. Tell an off-delay (TOF) from an on-delay (TON) by what each does when the input rises and falls.
- **Counting pulses in Ladder: a CTU counts the edges itself**: Place a counter block in a rung and set its preset and its reset. Explain that a counter adds one on the rising edge of its input, not on every scan in which the input is high.
- **Timers in Function Block Diagram: an off-delay light and an on-delay filter**: Keep an output ON for a fixed time after its input drops, with a TOF block whose PT input is wired to a TIME constant. Ignore an input that is ON for less than a fixed time, with a TON block, and say which timer delays the start and which one delays the end.
- **Instruction List: calling an off-delay and an on-delay timer**: Call a timer instance with CAL, passing its input and its preset, and read its output with LD. Keep an output on for a fixed time after its input drops, using TOF, and ignore an input that is on for less than a fixed time, using TON.
- **Instruction List: counting pulses with a CTU**: Call a CTU counter with CAL and read its output with LD Count.Q. Count the rising edges of PulseInput up to a preset of 3, and clear the count with Reset.
- **Edges in Ladder: P and N contacts and one-scan pulses**: Use a positive transition contact (P) and a negative transition contact (N) to turn a level into a pulse of one scan. Explain why a held input must be counted once, and which scan sees the pulse.

## Module 4: Data: types, arithmetic, comparison, analog scaling

Intermediate. Requires module: 3. Tracks: Simulation, Hardware.

Real signals are numbers, not only on and off. Types, arithmetic, comparison and analog scaling prepare for the processes that follow.

| Lesson                                                                                                                | Status    | Languages | Tracks               | Plant | Minutes | Requires                                                          |
| --------------------------------------------------------------------------------------------------------------------- | --------- | --------- | -------------------- | ----- | ------- | ----------------------------------------------------------------- |
| `ld-variables-and-types` Variables, types and addresses in Ladder: memory bits, TIME values and the I/O map           | Available | LD        | Simulation           | -     | 20      | `edge-counter-pulses-ladder`                                      |
| `ld-compare-math` Comparison and math boxes in Ladder: a tank alarm and a safe division                               | Available | LD        | Simulation           | -     | 25      | `ld-variables-and-types`                                          |
| `ld-analog-scaling` Analog scaling in Ladder: counts to percent with MUL, DIV and LIMIT                               | Available | LD        | Simulation           | -     | 25      | `ld-compare-math`                                                 |
| `types-arithmetic-comparison` Types, arithmetic and comparison: a total and three bands                               | Available | ST        | Simulation, Hardware | -     | 20      | `edge-counter-pulses`                                             |
| `analog-scaling-integer` Analog scaling: from raw counts to a percentage                                              | Available | ST        | Simulation, Hardware | -     | 20      | `types-arithmetic-comparison`                                     |
| `analog-scaling-fbd` Analog scaling in Function Block Diagram: a high level alarm                                     | Available | FBD       | Simulation, Hardware | -     | 20      | `analog-scaling-integer`, `counter-batch-fbd`                     |
| `types-arithmetic-comparison-fbd` Types, arithmetic and comparison in Function Block Diagram: a total and three bands | Available | FBD       | Simulation, Hardware | -     | 25      | `types-arithmetic-comparison`, `boolean-logic-two-hand-guard-fbd` |
| `types-arithmetic-comparison-il` Instruction List: arithmetic, comparison and a jump on a rising edge                 | Available | IL        | Simulation, Hardware | -     | 20      | `types-arithmetic-comparison`, `edge-counter-pulses-il`           |

Objectives of the available lessons:

- **Types, arithmetic and comparison: a total and three bands**: Use an INT variable for a number and a BOOL variable for a yes or no, and see that a comparison turns a number into a BOOL. Add to a number only on the rising edge of an input, so that a button held for several scans counts once.
- **Analog scaling: from raw counts to a percentage**: Scale a raw count to engineering units with a multiplication followed by a division, in that order. See that integer division drops the remainder, and choose an integer type wide enough for the intermediate product.
- **Analog scaling in Function Block Diagram: a high level alarm**: Scale raw analog counts to engineering units with arithmetic blocks: multiply by the span of the units, then divide by the span of the counts. Keep a scaled value inside its range with a LIMIT block, and compare the value in engineering units, not in raw counts, with a threshold.
- **Types, arithmetic and comparison in Function Block Diagram: a total and three bands**: Use an INT variable for a number: an ADD block builds the next value, SEL blocks choose between the old total, the new one and zero, and LT, EQ and GT blocks turn the number into BOOL results. Add to a number only on the rising edge of an input, with an R_TRIG block, so that a button held for several scans counts once.
- **Instruction List: arithmetic, comparison and a jump on a rising edge**: Use ADD on a number in the current result, and LT, EQ and GT to turn a number into a BOOL. Skip a group of lines with JMPCN so that a number changes only on the rising edge of an input.
- **Variables, types and addresses in Ladder: memory bits, TIME values and the I/O map**: Tell a memory bit from a variable that is wired to a physical input or output through its address. Choose the type that fits a value (BOOL, INT, REAL, TIME) and set the value of a TIME variable.
- **Comparison and math boxes in Ladder: a tank alarm and a safe division**: Use a comparison box as a condition in series, and choose between GT and GE for a limit. Calculate with math boxes that run only while their rung has power, and guard a division with an NE comparison so that the divisor is never zero.
- **Analog scaling in Ladder: counts to percent with MUL, DIV and LIMIT**: Scale raw analog counts to engineering units by multiplying by the span of the units and then dividing by the span of the counts, in a type that the product fits. Keep a value inside its range with a LIMIT box, and compare the scaled value, not the raw counts, with the thresholds of the alarms.

## Module 5: State machines and sequences

Intermediate. Requires module: 3. Tracks: Simulation, Hardware.

A machine that does things in order is a state machine. Sequences are written as states in Structured Text, and Sequential Function Chart arrives with them, as steps.

| Lesson                                                                                        | Status    | Languages | Tracks               | Plant         | Minutes | Requires                                              |
| --------------------------------------------------------------------------------------------- | --------- | --------- | -------------------- | ------------- | ------- | ----------------------------------------------------- |
| `ld-sequence-step-bits` A sequence in Ladder: step bits move a tank from fill to mix to drain | Available | LD        | Simulation           | -             | 25      | `ld-analog-scaling`                                   |
| `pedestrian-crossing-states` Pedestrian crossing and safe states                              | Available | ST        | Simulation           | pedestrian-v1 | 25      | `edge-counter-pulses`                                 |
| `sfc-fill-mix-sequence` A sequence in Sequential Function Chart: fill, then mix               | Available | SFC       | Simulation, Hardware | -             | 25      | `edge-counter-pulses`                                 |
| `pedestrian-crossing-sfc` Pedestrian crossing as a chart                                      | Available | SFC       | Simulation           | pedestrian-v1 | 25      | `pedestrian-crossing-states`, `sfc-fill-mix-sequence` |
| `selection-branches-sfc` Selection branches: one path out of two                              | Available | SFC       | Simulation           | -             | 25      | `sfc-fill-mix-sequence`                               |
| `simultaneous-branches-sfc` Simultaneous branches: fill and heat together                     | Available | SFC       | Simulation           | -             | 30      | `sfc-fill-mix-sequence`                               |
| `step-times-sfc` Step times: a horn before the gate opens                                     | Available | SFC       | Simulation           | -             | 20      | `sfc-fill-mix-sequence`                               |
| `conveyor-sorting-sfc` Conveyor sorting as a chart                                            | Available | SFC       | Simulation           | conveyor-v1   | 30      | `sfc-fill-mix-sequence`                               |

Objectives of the available lessons:

- **Pedestrian crossing and safe states**: Model the crossing as numbered states, each with an explicit output combination. Show WALK only while the vehicles are red.
- **A sequence in Sequential Function Chart: fill, then mix**: Read a Sequential Function Chart as steps that are active one at a time, actions that run while their step is active, and transitions that move the activity. Add a timed transition that uses the elapsed time of a step.
- **Pedestrian crossing as a chart**: Turn the phases of a pedestrian crossing into the steps of a chart, each with an action that sets every light. Leave the green step with a transition on the plant's request and move through the other phases with timed transitions.
- **Selection branches: one path out of two**: Read a selection divergence as several transitions that leave one step, of which at most one fires. Use the priority of a transition to decide which branch wins when more than one condition holds.
- **Simultaneous branches: fill and heat together**: Read a simultaneous divergence as one transition that activates several steps at once, so that they run side by side. Write a convergence as one transition that leaves every step it waits for and fires only when all of them are active.
- **Step times: a horn before the gate opens**: Use the elapsed time of a step, written step.T, as the condition of a transition. Check that the time of a step restarts at zero each time the step becomes active, so that two cycles take the same time.
- **Conveyor sorting as a chart**: Describe a conveyor as three steps, with the sorting memory kept in a local variable that the running action updates. Move from RUNNING to FAULT on the jam sensor, and leave FAULT only when Reset is pressed and the jam is gone.
- **A sequence in Ladder: step bits move a tank from fill to mix to drain**: Explain a sequence as step bits, where exactly one bit is on at a time and a transition moves the sequence to the next one. Write a transition in Ladder as two actions in the same scan: set the next step bit and reset the current one.

## Module 6: Feedback, faults and interlocks

Intermediate. Requires module: 5. Tracks: Simulation, Hardware.

A command is not a fact: the plant must confirm it. Once a program can run a sequence, feedback, faults and interlocks teach it to distrust what it asked for.

| Lesson                                                                                                              | Status    | Languages | Tracks               | Plant    | Minutes | Requires                                                         |
| ------------------------------------------------------------------------------------------------------------------- | --------- | --------- | -------------------- | -------- | ------- | ---------------------------------------------------------------- |
| `motor-plant-feedback` Command, feedback, and speed                                                                 | Available | ST        | Simulation           | motor-v1 | 20      | `pedestrian-crossing-states`                                     |
| `tank-level-fault-reset` Tank level, faults, and reset                                                              | Available | ST        | Simulation           | tank-v1  | 25      | `motor-plant-feedback`                                           |
| `interlock-guard-permissive` Interlocks and permissives: a guard that stops the motor                               | Available | ST        | Simulation           | motor-v1 | 20      | `pedestrian-crossing-states`                                     |
| `interlock-reversing-ladder` Interlocks in Ladder: a reversing motor                                                | Available | LD        | Simulation, Hardware | -        | 20      | `interlock-guard-permissive`, `seal-in-ladder`                   |
| `tank-level-fault-reset-ladder` Tank level, faults and reset in Ladder: latches and the order of the rungs          | Available | LD        | Simulation           | tank-v1  | 30      | `tank-level-fault-reset`, `blinky-ladder-timer-feedback`         |
| `interlock-guard-permissive-fbd` Interlocks and permissives in Function Block Diagram: a guard that stops the motor | Available | FBD       | Simulation           | motor-v1 | 25      | `interlock-guard-permissive`, `boolean-logic-two-hand-guard-fbd` |
| `fault-stop-reset-sfc` Faults, stop and reset in a chart                                                            | Available | SFC       | Simulation           | -        | 25      | `sfc-fill-mix-sequence`, `tank-level-fault-reset`                |
| `interlock-guard-permissive-il` Instruction List: a guard as a permissive on the whole condition                    | Available | IL        | Simulation           | motor-v1 | 20      | `interlock-guard-permissive`, `boolean-logic-two-hand-guard-il`  |

Objectives of the available lessons:

- **Command, feedback, and speed**: Separate the command to the motor from the confirmation that it runs. Keep the request until Stop and let Running follow the request only once AtSpeed arrives.
- **Tank level, faults, and reset**: Keep the pump on from LevelLow until LevelHigh with a latch. Latch the alarm on PumpFault or EStop and release it only with a fresh Reset after the fault has cleared.
- **Interlocks and permissives: a guard that stops the motor**: Tell a permissive, a condition that must be true for the output to be on, from a command. Put a permissive in the same condition that holds the motor, so that it drops the motor and also stops Start from restarting it.
- **Interlocks in Ladder: a reversing motor**: Tell an interlock, a contact that keeps one output off while another is on, from a permissive, a contact that must be closed for an output to run at all. Lock two coils out of each other with a normally closed contact of each one in the rung of the other, in series with Stop and the permissive.
- **Tank level, faults and reset in Ladder: latches and the order of the rungs**: Keep the pump on from LevelLow until LevelHigh with a seal-in, with every stop condition in series. Latch the alarm on PumpFault or EStop with a SET coil, and release it with a RESET coil that only a fresh Reset press can reach.
- **Interlocks and permissives in Function Block Diagram: a guard that stops the motor**: Tell a permissive, a condition that must be TRUE for the output to be ON, from a command. Wire the permissive into the reset of an RS bistable, which is reset dominant, so that an open guard drops the motor and also stops Start from restarting it.
- **Faults, stop and reset in a chart**: Add a fault step that every working step can reach, with a transition of higher priority than the timers. Return the chart to its initial step with a Reset that works only once the fault is gone.
- **Instruction List: a guard as a permissive on the whole condition**: Tell a permissive, a condition that must be true for the output to be on, from a command, and write it as one more AND line. Place the permissive after the lines that hold the motor, so that it drops the motor and also stops Start from restarting it.

## Module 7: Structuring programs: functions, function blocks, structures, arrays, tasks

Intermediate. Requires module: 4. Tracks: Simulation, Hardware.

Programs grow. Once you work with data, functions, function blocks, structures, arrays and tasks keep a program readable and reusable.

The lessons below cover function blocks, also called from Function Block Diagram, structures and arrays; no graded lesson covers tasks yet, because a scenario runs one task.

| Lesson                                                                                               | Status    | Languages | Tracks               | Plant | Minutes | Requires                                                      |
| ---------------------------------------------------------------------------------------------------- | --------- | --------- | -------------------- | ----- | ------- | ------------------------------------------------------------- |
| `ld-function-blocks` Your own function block in Ladder: two pumps, one block                         | Available | LD        | Simulation           | -     | 25      | `tank-level-fault-reset-ladder`                               |
| `function-block-pump-pair` Function blocks: one latch, two pumps                                     | Available | ST        | Simulation, Hardware | -     | 25      | `types-arithmetic-comparison`                                 |
| `structures-arrays-call-panel` Structures and arrays: a panel of three calls                         | Available | ST        | Simulation, Hardware | -     | 25      | `function-block-pump-pair`                                    |
| `function-block-valves-fbd` Your own function block in Function Block Diagram: two valves, one block | Available | FBD       | Simulation, Hardware | -     | 20      | `function-block-pump-pair`, `counter-batch-fbd`               |
| `function-block-call-il` Instruction List: calling a function block and reading its outputs          | Available | IL        | Simulation, Hardware | -     | 25      | `function-block-pump-pair`, `boolean-logic-two-hand-guard-il` |

Objectives of the available lessons:

- **Function blocks: one latch, two pumps**: Write a function block with inputs, an output and a memory that lives between calls. See that two instances of the same function block keep separate memories.
- **Structures and arrays: a panel of three calls**: Declare a structure with named members and an array of that structure, and reach an element with an index and a member name. Replace three copies of the same code with one FOR loop over the array.
- **Your own function block in Function Block Diagram: two valves, one block**: Place a function block that the project declares in Structured Text in a Function Block Diagram, and read its ports from the declaration. Wire a second instance of the same function block, and see that each instance keeps a memory of its own.
- **Instruction List: calling a function block and reading its outputs**: Call a function block instance with CAL, passing its inputs by name, and read its output with LD Instance.Output. See that two instances of the same function block keep separate memories.
- **Your own function block in Ladder: two pumps, one block**: Place a function block that the project declares in Structured Text in a Ladder rung, and wire its inputs and its output. Explain that each instance of a function block keeps a memory of its own, so two pumps need two instances of one block.

## Module 8: Testing and diagnosis: scenario tests, temporal assertions, trace, breakpoints

Advanced. Requires module: 6. Tracks: Simulation.

Testing comes once you have programs worth testing. Scenario tests, temporal assertions, traces and breakpoints turn a guess into evidence.

| Lesson                                                                                                | Status    | Languages | Tracks     | Plant       | Minutes | Requires                                         |
| ----------------------------------------------------------------------------------------------------- | --------- | --------- | ---------- | ----------- | ------- | ------------------------------------------------ |
| `ld-diagnosis-debugger` Diagnosing a Ladder program in simulation: watch, breakpoint, force and trace | Available | LD        | Simulation | -           | 40      | `ld-function-blocks`                             |
| `conveyor-classification-jam` Conveyor classification and safe jam                                    | Available | ST        | Simulation | conveyor-v1 | 25      | `motor-plant-feedback`, `tank-level-fault-reset` |
| `temporal-assertions-jam-fault` Temporal assertions and jam fault                                     | Available | ST        | Simulation | -           | 25      | `conveyor-classification-jam`                    |
| `conveyor-two-parts-diagnosis` Reproducible diagnosis: two parts, one decision                        | Available | ST        | Simulation | -           | 20      | `conveyor-classification-jam`                    |

Objectives of the available lessons:

- **Conveyor classification and safe jam**: Stop the belt and light FaultLamp while the plant reports JamDetected. Keep Reset from releasing the fault while the jam is still present.
- **Temporal assertions and jam fault**: Latch the jam fault and prove its timing with temporal assertions. Require a new Start before the belt moves again after the fault is released.
- **Reproducible diagnosis: two parts, one decision**: Distinguish a metal part from a non-metal part with one memory that lives between two sensors. Read a scheduled input timeline and predict the outputs before running it.
- **Diagnosing a Ladder program in simulation: watch, breakpoint, force and trace**: Use the Watch table, a breakpoint on a rung, a forced input and the trace to find the cause of a Ladder program that does not behave as described. Fix the rung so that Stop and the overload both drop the motor, and release every force before you check.

## Module 9: Instruction List, and one logic in five languages

Advanced. Requires module: 7. Tracks: Simulation, Hardware.

Instruction List comes late, as a way to read low-level and legacy code. It closes the set of languages, and the same logic is then written in all five.

| Lesson                                                                                           | Status    | Languages            | Tracks               | Plant | Minutes | Requires                      |
| ------------------------------------------------------------------------------------------------ | --------- | -------------------- | -------------------- | ----- | ------- | ----------------------------- |
| `instruction-list-door-alarm` Instruction List: the current result and the order of instructions | Available | IL                   | Simulation, Hardware | -     | 20      | `function-block-pump-pair`    |
| `one-logic-five-languages` One logic in five languages: a gate that holds itself open            | Available | ST, LD, FBD, SFC, IL | Simulation, Hardware | -     | 30      | `instruction-list-door-alarm` |

Objectives of the available lessons:

- **Instruction List: the current result and the order of instructions**: Read an Instruction List program as one current result that each instruction combines with an operand, from top to bottom. Use LD, AND, OR, ANDN and ST, and see that moving one instruction changes the logic.
- **One logic in five languages: a gate that holds itself open**: Hold an output on after its request is released, and let a close command win, in Structured Text. Recognise the same condition, (Request OR Open) AND NOT Close, in Instruction List, Ladder, Function Block Diagram and Sequential Function Chart.

## Module 10: Communications: Modbus and MQTT basics

Advanced. Requires module: 7. Tracks: Simulation, Hardware.

Communications come last because they need everything before them. In simulation, Modbus and MQTT run against endpoints that ZPLC starts on this computer, so no network or board is needed.

| Lesson                                                                            | Status    | Languages | Tracks     | Plant | Minutes | Requires                                          |
| --------------------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | ------------------------------------------------- |
| `modbus-register-round-trip` Modbus TCP: write a register and read it back        | Available | ST        | Simulation | -     | 25      | `structures-arrays-call-panel`                    |
| `mqtt-publish-subscribe` MQTT: publish a message and receive it                   | Available | ST        | Simulation | -     | 25      | `modbus-register-round-trip`                      |
| `modbus-coil-fbd` Modbus in Function Block Diagram: write a coil and read it back | Available | FBD       | Simulation | -     | 25      | `modbus-register-round-trip`, `counter-batch-fbd` |

The lessons of this module are graded against a Modbus TCP server and an MQTT broker that ZPLC starts inside the simulation session, on this computer, so no network, installed broker or board is needed. These are protocol doubles: they show how the blocks and their handshake behave, and they do not show that a real device, broker or cloud service accepts the same exchange. No hardware track exists for them because no trace of a real device has been recorded.

Objectives of the available lessons:

- **Modbus TCP: write a register and read it back**: Write a holding register with MB_WRITE_HREG and read it back with MB_READ_HREG, in that order, using the DONE output of the first block as the trigger of the second. Compare the value read with the value written, and report an ERROR from either block. Say what a loopback double shows and what it does not show.
- **MQTT: publish a message and receive it**: Tell a service block (MQTT_CONNECT, MQTT_SUBSCRIBE), which reports its state on every scan, from a request block (MQTT_PUBLISH), which sends once for each rising edge of EN. Publish only after the subscription holds, because a message sent earlier is not delivered to it. Keep a message that VALID reports for one scan only, and compare its PAYLOAD. Say what a loopback broker shows and what it does not show.
- **Modbus in Function Block Diagram: write a coil and read it back**: Call a Modbus client block in a Function Block Diagram, with its inputs fed from constants that both blocks share, so that the write and the read name the same server and coil. Chain two requests with a wire from the DONE output of the first block to the EN input of the second.

## Module 11: Capstone: a small machine from description to tested program

Advanced. Requires module: 8. Tracks: Simulation, Hardware.

The course ends with a small machine taken from a written description to a tested program, using everything before it.

| Lesson                                                                                            | Status    | Languages | Tracks     | Plant | Minutes | Requires                                            |
| ------------------------------------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | --------------------------------------------------- |
| `capstone-packing-station` Capstone: a packing station, from description to tested program        | Available | ST        | Simulation | -     | 60      | `conveyor-two-parts-diagnosis`                      |
| `packing-station-sfc` Capstone: a packing station as a chart                                      | Available | SFC       | Simulation | -     | 60      | `capstone-packing-station`, `sfc-fill-mix-sequence` |
| `ld-final-project` Final project in Ladder: a packing station, from description to tested program | Available | LD        | Simulation | -     | 60      | `ld-diagnosis-debugger`                             |

Objectives of the available lessons:

- **Capstone: a packing station, from description to tested program**: Turn five written requirements into one Structured Text program that combines a seal-in, an emergency stop, a counter, a timer and a latched fault. Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.
- **Capstone: a packing station as a chart**: Turn five written requirements into a chart of steps, transitions and actions, and decide which behaviour is a step and which is a transition. Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.
- **Final project in Ladder: a packing station, from description to tested program**: Turn five written requirements into one Ladder program that combines a seal-in, normally closed stops, a counter, a timer and a latched fault. Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.

## Module 12: First plants: move a box with a sensor, a latch and a counter

Advanced. Requires module: 3. Tracks: Simulation.

Your first programs now move real parts. Each one reads a sensor and drives a belt or a gate in a plant you can watch, using the set, reset, edge and counter skills of module 3.

| Lesson                                                               | Status    | Languages | Tracks     | Plant | Minutes | Requires                                         |
| -------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | ------------------------------------------------ |
| `plant-belt-to-sensor` Move a box to a sensor                        | Available | ST        | Simulation | -     | 20      | `motor-start-stop-safe`                          |
| `plant-belt-to-sensor-ladder` Move a box to a sensor in Ladder       | Available | LD        | Simulation | -     | 20      | `motor-start-stop-safe`                          |
| `plant-latch-two-sensors` From sensor A to sensor B                  | Available | ST        | Simulation | -     | 20      | `plant-belt-to-sensor`                           |
| `plant-latch-two-sensors-ladder` From sensor A to sensor B in Ladder | Available | LD        | Simulation | -     | 20      | `plant-belt-to-sensor`                           |
| `plant-counted-queue` Load and unload three boxes                    | Available | ST        | Simulation | -     | 30      | `plant-latch-two-sensors`, `edge-counter-pulses` |
| `plant-counted-queue-ladder` Load and unload three boxes in Ladder   | Available | LD        | Simulation | -     | 30      | `plant-latch-two-sensors`, `edge-counter-pulses` |

Objectives of the available lessons:

- **Move a box to a sensor**: Start an actuator from a button press and remember that it is running. Stop the actuator when a sensor sees the box.
- **Move a box to a sensor in Ladder**: Start an actuator from a button press and remember that it is running. Stop the actuator when a sensor sees the box.
- **From sensor A to sensor B**: Use a set and a reset to hold an output between two events. Explain why a sensor that goes dark cannot hold the output by itself.
- **From sensor A to sensor B in Ladder**: Hold an output on between two sensor events without a separate memory variable. Explain why a sensor that goes dark cannot hold the output by itself.
- **Load and unload three boxes**: Count items with a counter that has a preset value. Use one counter to stop loading and another to know the batch is finished.
- **Load and unload three boxes in Ladder**: Count items with a counter that has a preset value. Use one counter to stop loading and another to know the batch is finished.

## Module 13: Timers and process control: delays, level scaling and a PID loop

Advanced. Requires module: 12. Tracks: Simulation.

Plants have time and continuous values. Timers, analog scaling and a PID loop come after the first plants because they need a plant that moves to be seen at work.

| Lesson                                                         | Status    | Languages | Tracks     | Plant | Minutes | Requires                                     |
| -------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | -------------------------------------------- |
| `plant-timed-tank` Fill and drain with timers                  | Available | ST        | Simulation | -     | 30      | `timers-on-delay-off-delay`                  |
| `plant-timed-tank-ladder` Fill and drain with timers in Ladder | Available | LD        | Simulation | -     | 30      | `timers-on-delay-off-delay`                  |
| `plant-tank-level-scaling` Read the level                      | Available | ST        | Simulation | -     | 30      | `analog-scaling-integer`, `plant-timed-tank` |
| `plant-tank-level-scaling-ladder` Read the level in Ladder     | Available | LD        | Simulation | -     | 30      | `analog-scaling-integer`, `plant-timed-tank` |
| `plant-tank-pid` Hold the level with PID                       | Available | ST        | Simulation | -     | 40      | `plant-tank-level-scaling`                   |
| `plant-tank-pid-fbd` The same loop in function blocks          | Available | FBD       | Simulation | -     | 40      | `plant-tank-pid`                             |

Objectives of the available lessons:

- **Fill and drain with timers**: Time the steps of a process so that each timed step lasts its own time. Use a timer as a safety limit on a step that normally ends on a sensor, and let an emergency stop abort the cycle.
- **Fill and drain with timers in Ladder**: Time one step of a process with an on-delay timer (TON), using one timer for each step. Use a timer as a safety limit on a step that normally ends on a sensor, and let an emergency stop abort the cycle.
- **Read the level**: Scale an analog value to engineering units so that fractions of a unit are kept. Read the plant map to find the raw range of each signal, and see what a wrong scale does to the process.
- **Read the level in Ladder**: Scale an analog value to engineering units with boxes so that fractions of a unit are kept. Read the plant map to find the raw range of each signal, and see what a wrong scale does to the process.
- **Hold the level with PID**: Run a PID loop with PID_Compact: set point, process value, gains, scan time and output limits. Tune the gains from the response of the level, and tell the effect of the proportional, integral and derivative terms apart.
- **The same loop in function blocks**: Wire a PID_Compact function block in a diagram: set point, process value, gains, scan time and output limits on the left, the output on the right. Follow one value across the diagram, from the raw whole number of the level to metres and on to the inlet valve.

## Module 14: Flow control: state machines and merging two lines

Advanced. Requires module: 12. Tracks: Simulation.

When parts share a path, order matters. State machines and merging two lines organise that flow, building on the first plants.

| Lesson                                               | Status    | Languages | Tracks     | Plant | Minutes | Requires                                            |
| ---------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | --------------------------------------------------- |
| `plant-buffer-release` Accumulate and release        | Available | SFC       | Simulation | -     | 45      | `sfc-fill-mix-sequence`, `plant-counted-queue`      |
| `plant-merge-lines` Merge two lines                  | Available | ST        | Simulation | -     | 45      | `plant-counted-queue`, `interlock-guard-permissive` |
| `plant-merge-lines-ladder` Merge two lines in Ladder | Available | LD        | Simulation | -     | 45      | `plant-counted-queue`, `interlock-guard-permissive` |

Objectives of the available lessons:

- **Accumulate and release**: Model a station as steps and transitions, one step for each thing the station does. Choose between two next steps with transition conditions that exclude each other.
- **Merge two lines**: Arbitrate two requests with a priority: line A wins when both lines wait. Interlock two outputs so they are never active together, and release the grant only when the box has cleared the merge.
- **Merge two lines in Ladder**: Arbitrate two requests with a priority: line A wins when both lines wait. Interlock two outputs so they are never active together, and release the grant only when the box has cleared the merge.

## Module 15: Manipulators and assembly: pick, place and sequence

Advanced. Requires module: 14. Tracks: Simulation.

Manipulators add steps that must happen in order. Pick, place and assembly use the state machines of flow control.

| Lesson                                                                      | Status    | Languages | Tracks     | Plant | Minutes | Requires                                                  |
| --------------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | --------------------------------------------------------- |
| `plant-belt-transfer` Pick from one belt, place on another                  | Available | ST        | Simulation | -     | 40      | `plant-counted-queue`                                     |
| `plant-belt-transfer-ladder` Pick from one belt, place on another in Ladder | Available | LD        | Simulation | -     | 40      | `plant-counted-queue`                                     |
| `plant-assembler` Assemble lids and bases                                   | Available | SFC       | Simulation | -     | 50      | `sfc-fill-mix-sequence`, `plant-belt-transfer`            |
| `plant-assembler-numeric` The same with numeric positions                   | Available | ST        | Simulation | -     | 40      | `plant-assembler`                                         |
| `plant-layer-palletizer` Palletize in layers                                | Available | ST        | Simulation | -     | 50      | `structures-arrays-call-panel`, `plant-assembler-numeric` |
| `plant-xyz-palletizing` Palletize with a gantry                             | Available | ST        | Simulation | -     | 50      | `plant-layer-palletizer`                                  |

Objectives of the available lessons:

- **Pick from one belt, place on another**: Sequence a pick and place so that each move starts only when the previous one is complete. Lift a box only when the clamp reports that it holds it, and put each box down without disturbing it.
- **Pick from one belt, place on another in Ladder**: Sequence a pick and place so that each move starts only when the previous one is complete. Lift a box only when the clamp reports that it holds it, and put each box down without disturbing it.
- **Assemble lids and bases**: Coordinate two axes and a vacuum pad in one sequence, with one step for each move. Choose between two next steps with transition conditions that exclude each other.
- **The same with numeric positions**: Send an axis to a named position with a setpoint and read its position back. Decide that a move is done when the position is within a tolerance of the setpoint, not when it is equal to it.
- **Palletize in layers**: Build a layer by counting pairs of boxes, and square it before the clamp takes it. Keep the jog of each layer in an array and fill it with a FOR loop, so each layer sets down one box height higher than the one below.
- **Palletize with a gantry**: Command three axes with integer counts and let every move wait until each axis has arrived. Choose the place of each box from its number: the slot in the layer and the height of the layer.

## Module 16: Sorting: decide a route from what the sensors report

Advanced. Requires module: 14. Tracks: Simulation.

Sorting turns sensor combinations into routes. It reuses the flow-control skills and prepares the stations that follow.

| Lesson                                                                  | Status    | Languages | Tracks     | Plant | Minutes | Requires                                                 |
| ----------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | -------------------------------------------------------- |
| `plant-colour-separation` Send each colour to its belt                  | Available | ST        | Simulation | -     | 45      | `plant-counted-queue`                                    |
| `plant-colour-separation-ladder` Send each colour to its belt in Ladder | Available | LD        | Simulation | -     | 45      | `plant-counted-queue`                                    |
| `plant-colour-separation-il` The same sorting in Instruction List       | Available | IL        | Simulation | -     | 50      | `plant-colour-separation`, `instruction-list-door-alarm` |
| `plant-weight-sorting` Sort by weight                                   | Available | ST        | Simulation | -     | 50      | `plant-colour-separation`, `plant-tank-level-scaling`    |
| `plant-weight-sorting-ladder` Sort by weight in Ladder                  | Available | LD        | Simulation | -     | 50      | `plant-colour-separation`, `plant-tank-level-scaling`    |
| `plant-height-chain` Sort by height, chain transfer                     | Available | ST        | Simulation | -     | 60      | `plant-colour-separation`                                |
| `plant-height-chain-ladder` Sort by height, chain transfer in Ladder    | Available | LD        | Simulation | -     | 60      | `plant-colour-separation`                                |
| `plant-height-turntable` Sort by height, turntable                      | Available | ST        | Simulation | -     | 60      | `plant-height-chain`                                     |
| `plant-vision-sorting` Sort by identity code                            | Available | ST        | Simulation | -     | 50      | `plant-colour-separation`                                |

Objectives of the available lessons:

- **Send each colour to its belt**: Decide a route from one sensor result once the part lies still. Run a push as a short sequence: extend until Extended, retract until Retracted.
- **Send each colour to its belt in Ladder**: Decide a route from one sensor result once the part lies still. Run a push as a short sequence: extend until Extended, retract until Retracted.
- **The same sorting in Instruction List**: Turn the states of a sorting sequence into compare-and-jump blocks. Call a TON from Instruction List with CAL and read its Q output.
- **Sort by weight**: Classify an item by comparing an analog value with a limit. Read the value only when the scale says it is stable.
- **Sort by weight in Ladder**: Classify an item by comparing an analog value with a limit. Read the value only when the scale says it is stable.
- **Sort by height, chain transfer**: Decide a route from a combination of two sensors. Remember a decision while the next box is already passing the sensors.
- **Sort by height, chain transfer in Ladder**: Decide a route from a combination of two sensors. Remember a decision while the next box is already passing the sensors.
- **Sort by height, turntable**: Tell boxes of three heights apart with a light array that reports a height only while a box is in it. Make a turntable work with the box it turns, so that each box leaves on the belt of its class.
- **Sort by identity code**: Route items by an integer code instead of a switch. Time an actuator against the travel of an item that has already been read.

## Module 17: Stations: several machines working as one

Advanced. Requires module: 16. Tracks: Simulation.

A station groups sorting, transfer and sequencing into one unit. It comes after sorting because it combines its decisions.

| Lesson                                                    | Status    | Languages | Tracks     | Plant | Minutes | Requires                                          |
| --------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | ------------------------------------------------- |
| `plant-three-level-lifts` Move boxes between three levels | Available | SFC       | Simulation | -     | 50      | `plant-buffer-release`                            |
| `plant-lift-stacking` Gather items into a crate           | Available | ST        | Simulation | -     | 45      | `plant-counted-queue`                             |
| `plant-warehouse` Store and retrieve                      | Available | SFC       | Simulation | -     | 60      | `plant-three-level-lifts`                         |
| `plant-production-line` Balance a production line         | Available | ST        | Simulation | -     | 50      | `function-block-pump-pair`, `plant-lift-stacking` |

Objectives of the available lessons:

- **Move boxes between three levels**: Describe each lift as a cycle of steps of its own that returns to where it began. Make both lifts work at the same time, meeting only at the belt between them.
- **Gather items into a crate**: Combine a count, a lift and a crate in one sequence of steps. Move the lift only with its surface stopped, and feed the next workpiece only after the last one has landed.
- **Store and retrieve**: Write the store and the retrieve sequences of a crane as chains of steps. Keep a table of occupied cells and the requests that wait, and choose the next job from them.
- **Balance a production line**: Move the control of one machine into a function block and use one instance for each machine. Give two machines of different speeds the same control, so that each finishes four cycles.

## Module 18: Safe and diagnosable machines: interlocks, manual and automatic, and faults

Advanced. Requires module: 17. Tracks: Simulation.

A machine must stop safely and show what went wrong. Interlocks, modes and fault diagnosis are taught on stations the learner already knows.

| Lesson                                                                  | Status    | Languages | Tracks     | Plant | Minutes | Requires                                                |
| ----------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | ------------------------------------------------------- |
| `plant-estop-interlocks` Emergency stop and interlocks                  | Available | ST        | Simulation | -     | 40      | `plant-three-level-lifts`, `interlock-guard-permissive` |
| `plant-estop-interlocks-ladder` Emergency stop and interlocks in Ladder | Available | LD        | Simulation | -     | 40      | `plant-three-level-lifts`, `interlock-guard-permissive` |
| `plant-manual-auto` Manual and automatic modes                          | Available | ST        | Simulation | -     | 45      | `plant-assembler`, `plant-estop-interlocks`             |
| `plant-manual-auto-ladder` Manual and automatic modes                   | Available | LD        | Simulation | -     | 45      | `plant-assembler`, `plant-estop-interlocks`             |
| `plant-fault-actions` Find the fault                                    | Available | ST        | Simulation | -     | 45      | `plant-height-chain`                                    |

Objectives of the available lessons:

- **Emergency stop and interlocks**: Stop every output while the emergency stop is pressed. Remember the stop, so that releasing the button does not restart the line.
- **Emergency stop and interlocks in Ladder**: Stop every output while the emergency stop is pressed. Remember the stop, so that releasing the button does not restart the line.
- **Manual and automatic modes**: Keep the mode in a memory that one press of ModeBtn switches, and let the machine power up in manual. Move the pad with the jog buttons only in manual, never past a limit switch, and start the cycle with Start only in automatic.
- **Manual and automatic modes**: Keep the mode in a memory that one press of ModeBtn switches, and let the machine power up in manual. Move the pad with the jog buttons only in manual, never past a limit switch, and start the cycle with Start only in automatic.
- **Find the fault**: Diagnose a stuck sensor from a fact the program can read, not from the sensor itself. Choose a safe reaction: stop what brings new boxes and let the boxes already moving arrive.

## Module 19: Build your own scenes: place parts, bind signals and run

Advanced. Requires module: 18. Tracks: Simulation.

The course ends by building the plant itself: parts, signals and a program that runs on them, using everything before it.

| Lesson                                                                  | Status    | Languages | Tracks     | Plant | Minutes | Requires                                             |
| ----------------------------------------------------------------------- | --------- | --------- | ---------- | ----- | ------- | ---------------------------------------------------- |
| `plant-build-belt-scene` Build a belt scene from the empty floor        | Available | ST        | Simulation | -     | 25      | `plant-belt-to-sensor`, `plant-fault-actions`        |
| `plant-build-belt-scene-ladder` Build a belt scene from the empty floor | Available | LD        | Simulation | -     | 25      | `plant-belt-to-sensor`, `plant-fault-actions`        |
| `plant-change-scene` Change a scene: add the second emitter             | Available | ST        | Simulation | -     | 20      | `plant-build-belt-scene`, `plant-merge-lines`        |
| `plant-change-scene-ladder` Change a scene: add the second emitter      | Available | LD        | Simulation | -     | 20      | `plant-build-belt-scene-ladder`, `plant-merge-lines` |

Objectives of the available lessons:

- **Build a belt scene from the empty floor**: Place the parts of a scene by name and bind each signal of the plant map to a program variable. Run a program on the scene you built and see the Check grade that scene, not a copy of it.
- **Build a belt scene from the empty floor**: Place the parts of a scene by name and bind each signal of the plant map to a program variable. Run a program on the scene you built and see the Check grade that scene, not a copy of it.
- **Change a scene: add the second emitter**: Add a part to an existing scene and place it where the rest of the scene expects it. Bind the new part's signal in the plant map to the program variable that already drives it, leaving the program unchanged.
- **Change a scene: add the second emitter**: Add a part to an existing scene and place it where the rest of the scene expects it. Bind the new part's signal in the plant map to the program variable that already drives it, leaving the program unchanged.

## Hardware wiring pages

Each learner board has a kit page with its pin map, bill of materials, firmware and voltage limit: the [Raspberry Pi Pico (RP2040)](../reference/learner-kits/rpi-pico-rp2040.md) and the [ESP32-S3-DevKitC-1 (N8R8)](../reference/learner-kits/esp32-s3-devkitc.md). Every lesson on the Hardware track has a wiring page for each board, with a diagram and a wiring card, linked from the kit page and from the page of the lesson. Those pages are generated from `firmware/app/boards/boards.json`, `packages/zplc-ide/lessons/kit.json` and the wiring file of each lesson. The [learner kits](../reference/learner-kits/index.md) page explains how a lesson declares its wiring. No hardware run has been recorded on a board yet.
