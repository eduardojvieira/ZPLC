---
title: "Variables, types and addresses in Ladder: memory bits, TIME values and the I/O map"
sidebar_label: "ld-variables-and-types"
description: "The lesson ld-variables-and-types: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Variables, types and addresses in Ladder: memory bits, TIME values and the I/O map

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-variables-and-types. Do not edit. >>> */}

Keep a request in a memory bit, store a duration in a TIME variable, and see which variables are wired to the machine through the I/O map.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [edge-counter-pulses-ladder](./edge-counter-pulses-ladder.md)

## Objectives

- Tell a memory bit from a variable that is wired to a physical input or output through its address.
- Choose the type that fits a value (BOOL, INT, REAL, TIME) and set the value of a TIME variable.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the wiring, the electrical levels or the timing of real inputs and outputs, HIL, or certification.

## On a board

The warning lamp and the motor are graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/ld-variables-and-types <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
