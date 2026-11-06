---
title: "Final project in Ladder: a packing station, from description to tested program"
sidebar_label: "ld-final-project"
description: "The lesson ld-final-project: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Final project in Ladder: a packing station, from description to tested program

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-final-project. Do not edit. >>> */}

Turn the written description of a small packing station into a Ladder program with a seal-in, a stop and an emergency stop wired normally closed, a counter, a timer and a latched fault, and prove it with a scenario that also checks what must not happen.

## Facts

- Module: [11](../modules/module-11.md)
- Level: Advanced
- Estimated time: 60 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: yes
- Plant: none
- Prerequisites: [ld-diagnosis-debugger](./ld-diagnosis-debugger.md)

## Objectives

- Turn five written requirements into one Ladder program that combines a seal-in, normally closed stops, a counter, a timer and a latched fault.
- Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish packing-line requirements, safety function behavior, sensor timing or any real machine behavior, HIL, or certification.

## On a board

The station reads five digital inputs (Start, StopOK, EStopOK, Part and Reset), and the learner boards have four. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/ld-final-project <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
