---
title: "Read the level"
sidebar_label: "plant-tank-level-scaling"
description: "The lesson plant-tank-level-scaling: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Read the level

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-level-scaling. Do not edit. >>> */}

Scale the raw level of a tank, a whole number from 0 to 27648, to metres, and use it to hold the level near a set point with a proportional inlet.

## Facts

- Module: [13](../modules/module-13.md)
- Level: Advanced
- Estimated time: 30 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: no
- Plant: [Tank level control](../../plant/scenes/tank-level-control.md)
- Prerequisites: [analog-scaling-integer](./analog-scaling-integer.md), [plant-timed-tank](./plant-timed-tank.md)

## Objectives

- Scale an analog value to engineering units: convert to REAL first, then divide by the raw span.
- Read the plant map to find the raw range of each signal, and see what a wrong scale does to the process.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The grade runs the simulated tank in the simulator on this computer, with an analog level that follows the scaling rules of the plant map. It says nothing about the accuracy, noise or calibration of a real level transmitter, a real machine, its timing or its safety.

## On a board

The analog level of this lesson comes from the simulated tank, and the hardware track of the plant lessons opens in a later release, after the analog exchange of plant I/O mode has been measured on a learner board. Complete it in Simulation, where the tank, its level sensor and the potentiometers are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-level-scaling <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
