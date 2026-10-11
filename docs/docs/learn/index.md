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

Studio has ten lessons in its **Learn** tab, in English and in Spanish. On the
Welcome screen, choose **Learn**: Studio copies the first lesson into a folder
that you choose and opens the tab.

Each lesson takes you through six stages: Objective, Predict, Edit, Run, Observe
and Reflect. You edit the copied project, save it and press **Check**. Studio
runs your saved program against the scenario of the lesson and lists every
assertion that failed, with the time, the value it expected and the value it
saw. A lesson is complete when every assertion of its scenario passed.

All lessons are unlocked and can be taken in any order. The full description of
what Learn does, and what it keeps, is in [Studio workbench](../ide/features.md#learn).

## Open an example project

Studio bundles example projects on the Welcome screen, grouped from first steps
to motors, process control, the five languages and boards. They live in
`packages/zplc-ide/projects/`. To copy one into a folder of your own, choose it
under **Examples**.

The tutorial [Blink without hardware](../tutorials/blink-without-hardware.md) walks
through one of them.

## Practise with scenario tests

A scenario is a short script that sets inputs, lets the program run for a fixed
time and checks the outputs. Writing one is the best way to find out what your
program really does. The [scenario file format](../reference/scenario-file.md)
lists every field, and the [command line](../reference/cli.md) runs them without
Studio.

## Read the language examples

The [compatibility language examples](../languages/examples/v1-5-language-suite.md)
hold the same small programs in the five IEC 61131-3 languages, and the
[Structured Text reference](../reference/language-st.md) says, element by element,
what works today.

## What is not here yet

A course with levels, prerequisites and a fixed order, a lesson that stays beside
the editor, and a track for a learner board are future work. The lessons and the
examples are host and simulation exercises: they do not show how a program
behaves on a physical board.
