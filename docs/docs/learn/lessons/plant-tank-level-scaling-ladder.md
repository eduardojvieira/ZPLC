---
title: "Read the level in Ladder"
sidebar_label: "plant-tank-level-scaling-ladder"
description: "The lesson plant-tank-level-scaling-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Read the level in Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-level-scaling-ladder. Do not edit. >>> */}

Scale the raw level of a tank, a whole number from 0 to 27648, to metres with function boxes, and use it to hold the level near a set point with a proportional inlet.

## Facts

- Module: [13](../modules/module-13.md)
- Level: Advanced
- Estimated time: 30 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: no
- Plant: [Tank level control](../../plant/scenes/tank-level-control.md)
- Prerequisites: [analog-scaling-integer](./analog-scaling-integer.md), [plant-timed-tank](./plant-timed-tank.md)

## Objectives

- Scale an analog value to engineering units with boxes: convert to REAL first, then divide by the raw span.
- Read the plant map to find the raw range of each signal, and see what a wrong scale does to the process.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The grade is a headless run of the simulated tank on the native POSIX runtime, with an analog level that follows the scaling rules of the plant map. It does not establish the accuracy, noise or calibration of a real level transmitter, hardware timing, HIL, or certification.

## On a board

The MOVE, DIV and LIMIT boxes of this lesson scale a level that comes from the simulated tank, and the hardware track of the plant lessons opens in a later release, once the analog exchange of plant I/O mode has been measured on a learner board. Complete it in Simulation, where the tank, its level sensor and the potentiometers are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-level-scaling-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
