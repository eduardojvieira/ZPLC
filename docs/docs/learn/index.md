---
slug: /learn
id: index
title: Learn
sidebar_label: Learn
description: 'The ZPLC course: 68 lessons in 12 modules, a Ladder path for readers who have never programmed a PLC, reading pages with a try-it lab, simulation only with an optional hardware track.'
tags: [learn, lessons, examples]
---

# Learn

Learn is a course in PLC programming that runs inside the ZPLC application, in English and in Spanish. You need no board, no network and no earlier knowledge: every lesson runs in the simulator on your computer, and none of them starts a physical operation. If you own a supported learner board, an optional [hardware track](./hardware-track.md) repeats most lessons on it.

## What the course is

| | |
| --- | --- |
| Lessons | 68, in 12 modules (0 to 11), about 26 hours in all |
| Levels | Foundation 27, intermediate 29 and advanced 12 |
| Languages | Structured Text, Ladder, Function Block Diagram, Sequential Function Chart and Instruction List, each introduced by a lesson |
| Tracks | Simulation, which 67 of them offer, and Hardware, which 34 of them offer |
| Practice | Each lesson has six stages, two levels of hint, a reference solution on request and a scenario that grades your program |

The [course outline](./course-outline.md) lists every module and lesson with its languages, tracks and time. The [course modules](./modules/index.md) and the [lesson plants](./plants.md) describe the simulated machines.

## Start from zero: the Ladder path

If you have never programmed a PLC, take the Ladder path, *Ladder diagram from zero*. It is made of 21 of the lessons, from what a PLC is to the tested program of a machine, and it ends with a final project and a look at the other four languages. Ladder reads like the relay circuits it replaced, which is why most people start with it.

Each lesson of the path opens with a **reading page**. The page covers the main area of the workbench, and the side and bottom panels stay visible around it. It explains one idea in plain words, shows Ladder figures and timing diagrams, and has **Check yourself** questions that are not graded or saved. Where an idea is easier to see than to read, the page has a **try-it lab**: a small Ladder program that runs live beside its diagram. Hold a push button or flip a switch, press **Run**, and watch the lamps and the rung change. **Pause** and **Reset** let you start over. The lab runs on its own simulation in the page and never touches your project.

When you are ready, choose **Practice**: the page closes and the lesson panel opens beside the editor. **Read again** brings the page back. The path is also on the Learn home, with how many of its lessons you have passed and a button to continue where you stopped.

## Take the course

1. On the Welcome screen choose **Learn**. The Learn home opens with no project and no network, and lists the modules in order with their level, what each requires and how long it takes.
2. Choose **Start the course**. ZPLC makes the workspace of the first lesson in its own folder and opens it. There is no folder to choose and no copy step, and the lesson stays visible beside the editor, also when you switch to the Project view.
3. Work through the six stages of the lesson: Objective, Predict, Edit, Run, Observe and Reflect. Edit the workspace, save it and press **Check**. ZPLC runs your saved program against the scenario of the lesson and lists every assertion that failed, with the time, the value it expected and the value it saw. The lesson is complete when every assertion passed.

Every lesson offers two levels of hint, and ZPLC records each level you open. The reference solution opens only on request, and your progress records that you saw it. A teacher can hide the solutions: see [Educators](./educators.md). A lesson stays locked until the lessons it requires are passed; to take them in any order, turn on **Unlock all lessons** in the home. The full description of what Learn does and keeps is in [ZPLC workbench](../ide/features.md#learn), and the [course glossary](./glossary.md) fixes the English and Spanish terms.

## Your first blink, without hardware

The first lesson ends in a blinking output in simulation. When **Start the course** has opened it, choose **Build** and then **Compile** on the toolbar, then **Connect** and **Run**. **Run** stays disabled until the program is built. Open the **Watch** tab: the [**Live I/O** faceplate](./faceplate.md) lists the outputs of the program, and the lamp of the lesson turns on and off.

Every lesson but one can be completed this way, with no board: the lesson index refuses a foundation or intermediate lesson that cannot. The exception, *Verify my board*, exists to check a board. Evidence level: host. A scripted run of the application on the development host (journey 57 of `packages/zplc-ide/scripts/journeys.ts`) follows exactly these visible controls from a fresh profile and sees the output change. How long a person takes is not measured: that needs a timed test with first-time users.

## Offline

The simulation track needs no network, and that includes module 10: its Modbus and MQTT blocks talk to a server and a broker that the simulation starts on your computer and stops with it. The window loads no font, script or stylesheet from another host, and the one request ZPLC can make on its own, the check for a newer release, is off until you turn it on in the preferences.

Evidence level: host. A scripted run of the application on the development host on Linux (journey 58 of the same file) starts, runs and checks the first lesson and a Communications lesson while every request to another host is refused, and a test of the production build finds no remote load in it. An installed package was not run without a network.

## Beyond the lessons

- **Example projects.** The Welcome screen bundles 81 examples, grouped by topic (first steps, motors, process control, the five languages and boards) and by level, each showing its language and, for a hardware example, its board. A hardware example either ships a scenario or says why it has none. They live in `packages/zplc-ide/projects/`. Choose one under **Examples** to copy it into a folder of your own, or follow [Blink without hardware](../tutorials/blink-without-hardware.md).
- **Scenario tests.** A scenario is a short script that sets inputs, lets the program run for a fixed time and checks the outputs. [Write and run scenario tests](../guides/scenario-tests.md) shows how, the [scenario file format](../reference/scenario-file.md) lists every field, and the [command line](../reference/cli.md) runs them without the ZPLC application.
- **Language reference.** The [Structured Text reference](../reference/language-st.md) says, element by element, what works today, and the [language guides](../languages/index.md) cover the five IEC 61131-3 languages.

## What the course does not show

The lessons and the examples are host and simulation exercises: they do not show how a program behaves on a physical board. Each lesson lists the tracks it supports and, for a track it does not support, says why and what to do instead. In the hardware track, a lesson shows the wiring for your board and a check on the board that you start; no run on a physical board has been recorded yet. See the [hardware track](./hardware-track.md) for how a board is chosen and how a run on it is checked.
