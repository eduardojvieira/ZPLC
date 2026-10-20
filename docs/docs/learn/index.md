---
slug: /learn
id: index
title: Learn
sidebar_label: Learn
description: "Where to practise PLC programming with ZPLC today: the lessons in Studio, the bundled example projects and scenario tests."
tags: [learn, lessons, examples]
---

# Learn

This section is for a reader who wants to practise. You need no board: every
exercise runs in the simulator on your computer, and none of them starts a
physical operation.

## Start with the lessons in Studio

Studio has 29 lessons in a course, in English and in Spanish. The [course outline](course-outline.md) lists every module, the lessons that exist and the ones that are planned. On the Welcome
screen, choose **Learn**: the Learn home opens, with no project and no network,
and lists the modules in order with their level, what each requires and how long
it takes. Choose **Start the course**: Studio makes the workspace of the first lesson in its own folder and opens it; there is no folder to choose and no copy step. The lesson stays visible beside the editor, also when you switch to the Project view.

Each lesson takes you through six stages: Objective, Predict, Edit, Run, Observe
and Reflect. You edit the workspace, save it and press **Check**. Studio
runs your saved program against the scenario of the lesson and lists every
assertion that failed, with the time, the value it expected and the value it
saw. A lesson is complete when every assertion of its scenario passed.

Every lesson offers two levels of hint, and Studio records each level you open. The reference solution opens only on request, and the progress records that you saw it. A teacher can hide the solutions: see [Educators](./educators.md). The [course glossary](glossary.md) lists the terms the course uses in English and in Spanish.

A lesson is locked until the lessons it requires are passed, and the home says
which ones. If you would rather take them in any order, turn on **Unlock all
lessons** in the home. The full description of
what Learn does, and what it keeps, is in [Studio workbench](../ide/features.md#learn).

## Your first blink, without hardware

The first lesson ends in a blinking output in simulation, within ten minutes of
the first launch. When **Start the course** has opened it, choose **Build** and
then **Compile** on the toolbar, then **Connect** and **Run**: the program runs in
the simulator on your computer. **Run** stays disabled until the program is built.
Open the **Watch** tab: the [**Live I/O** faceplate](./faceplate.md) lists the outputs of the program, and the
lamp of the lesson turns on and off.

Every Foundation and Intermediate lesson can be completed in this way, with no
board; the lesson index refuses one that cannot. A journey of the development host
(journey 57) follows exactly these visible controls from a fresh profile and sees
the output change. How long a person takes is not measured yet: that needs a
timed test with first-time users.

## Offline

The simulation track needs no network. That includes module 10: its Modbus and
MQTT blocks talk to a server and a broker that the simulation starts on your
computer and stops with it. The window loads no font, script or stylesheet from
another host, and the one request Studio can make on its own, the check for a
newer release, is off until you turn it on in the preferences.

The evidence is a journey of the development host on Linux (journey 58), which
starts, runs and checks the first lesson and a Communications lesson while every
request to another host is refused, and a test of the production build that finds
no remote load in it. An installed package was not run without a network.

## Open an example project

Studio bundles example projects on the Welcome screen, grouped by topic (first steps, motors, process control, the five languages and boards) and by level, each showing its language and, for a hardware example, its board. A hardware example either ships a scenario or says why it has none. They live in
`packages/zplc-ide/projects/`. To copy one into a folder of your own, choose it
under **Examples**.

The tutorial [Blink without hardware](../tutorials/blink-without-hardware.md) walks
through one of them.

## Practise with scenario tests

A scenario is a short script that sets inputs, lets the program run for a fixed
time and checks the outputs. Writing one is the best way to find out what your
program really does. [Write and run scenario tests](../guides/scenario-tests.md)
shows how, the [scenario file format](../reference/scenario-file.md) lists every
field, and the [command line](../reference/cli.md) runs them without Studio.

## Read the language examples

The [compatibility language examples](../languages/examples/v1-5-language-suite.md)
hold the same small programs in the five IEC 61131-3 languages, and the
[Structured Text reference](../reference/language-st.md) says, element by element,
what works today.

## What is not here yet

Each lesson lists the tracks it supports and, for a track it does not support, says why and what to do instead. The [hardware track](hardware-track.md) says how to choose your board and how a run on it is checked, and each hardware lesson has a wiring page per board; the check of a run from the lesson panel is future work. The [course outline](course-outline.md) gives the tracks of every lesson. The lessons and the
examples are host and simulation exercises: they do not show how a program
behaves on a physical board.
