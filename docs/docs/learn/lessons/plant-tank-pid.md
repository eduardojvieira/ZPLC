---
title: "Hold the level with PID"
sidebar_label: "plant-tank-pid"
description: "The lesson plant-tank-pid: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Hold the level with PID

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-pid. Do not edit. >>> */}

Hold the level of a tank at a set point with PID_Compact, keep it there when the drain opens, and tune the gains from what the level does.

## Facts

- Module: [13](../modules/module-13.md)
- Level: Advanced
- Estimated time: 40 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: no
- Plant: none
- Prerequisites: [plant-tank-level-scaling](./plant-tank-level-scaling.md)

## Objectives

- Run a PID loop with PID_Compact: set point, process value, gains, scan time and output limits.
- Tune the gains from the response of the level, and tell the effect of the proportional, integral and derivative terms apart.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The grade is a headless run of the simulated tank on the native POSIX runtime. It tests where the level goes, not the values of the gains: several tunings pass. It does not establish the behaviour of a real tank or valve, hardware timing, HIL, or certification.

## On a board

The loop of this lesson closes through the simulated tank and its drain disturbance, and the hardware track of the plant lessons opens in a later release, after the loop's scan time has been measured through plant I/O mode on a learner board. Complete it in Simulation, where the tank and the loop disturbance are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-pid <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
