---
title: "The same loop in function blocks"
sidebar_label: "plant-tank-pid-fbd"
description: "The lesson plant-tank-pid-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# The same loop in function blocks

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-pid-fbd. Do not edit. >>> */}

Wire the level loop of a tank as a function block diagram: a PID_Compact block between the scaled level and set point and the inlet valve.

## Facts

- Module: [13](../modules/module-13.md)
- Level: Advanced
- Estimated time: 40 minutes
- Languages: FBD
- Tracks: Simulation
- Reading page: no
- Plant: none
- Prerequisites: [plant-tank-pid](./plant-tank-pid.md)

## Objectives

- Wire a PID_Compact function block in a diagram: set point, process value, gains, scan time and output limits on the left, the output on the right.
- Follow one value across the diagram, from the raw whole number of the level to metres and on to the inlet valve.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The grade is a headless run of the simulated tank on the native POSIX runtime. It tests where the level goes, not how the diagram is drawn or the values of the gains. It does not establish the behaviour of a real tank or valve, hardware timing, HIL, or certification.

## On a board

The diagram of this lesson drives the same simulated tank as the Structured Text loop, and the hardware track of the plant lessons opens in a later release, once its loop timing has been measured through plant I/O mode on a learner board. Complete it in Simulation, where the tank and the loop disturbance are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-pid-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
