---
title: "Diagnosing a Ladder program in simulation: watch, breakpoint, force and trace"
sidebar_label: "ld-diagnosis-debugger"
description: "The lesson ld-diagnosis-debugger: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Diagnosing a Ladder program in simulation: watch, breakpoint, force and trace

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-diagnosis-debugger. Do not edit. >>> */}

Find why a motor will not stop by watching its variables, stopping the program on a rung, forcing an input in simulation and reading the trace, then fix the rung and release every force.

## Facts

- Module: [8](../modules/module-8.md)
- Level: Advanced
- Estimated time: 40 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [ld-function-blocks](./ld-function-blocks.md)

## Objectives

- Use the Watch table, a breakpoint on a rung, a forced input and the trace to find the cause of a Ladder program that does not behave as described.
- Fix the rung so that Stop and the overload both drop the motor, and release every force before you check.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence only. Forcing and breakpoints here are simulation actions by the learner; they are not hardware, HIL, safety or certification evidence.

## On a board

This lesson uses the Watch table, breakpoints, forcing and the trace of the simulator, and the program reads three digital inputs where the learner boards have four. Complete it in Simulation, where forcing an input costs nothing and can be repeated.

{/* <<< END GENERATED: learn/lessons/ld-diagnosis-debugger <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
