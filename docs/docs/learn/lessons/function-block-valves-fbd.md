---
title: "Your own function block in Function Block Diagram: two valves, one block"
sidebar_label: "function-block-valves-fbd"
description: "The lesson function-block-valves-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Your own function block in Function Block Diagram: two valves, one block

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/function-block-valves-fbd. Do not edit. >>> */}

Edit a Function Block Diagram so that a second instance of the project's function block ValveCtl commands the drain valve, with its inputs and its output wired.

## Facts

- Module: [7](../modules/module-7.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: FBD
- Tracks: Simulation
- Plant: none
- Prerequisites: [function-block-pump-pair](./function-block-pump-pair.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objectives

- Place a function block that the project declares in Structured Text in a Function Block Diagram, and read its ports from the declaration.
- Wire a second instance of the same function block, and see that each instance keeps a memory of its own.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish valve wiring, valve travel time, air supply monitoring, HIL, or certification.

## On a board

The lesson needs four pushbuttons at the same time (FillPB, DrainPB, StopPB and AirOk), and the learner kit holds three: on the Raspberry Pi Pico each of the four inputs needs a button of its own. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/function-block-valves-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
