---
title: "Move a box to a sensor in Ladder"
sidebar_label: "plant-belt-to-sensor-ladder"
description: "The lesson plant-belt-to-sensor-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Move a box to a sensor in Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-belt-to-sensor-ladder. Do not edit. >>> */}

Start a belt from a button with a set coil and stop it with a reset coil when a box reaches the sensor at the far end.

## Facts

- Module: [12](../modules/module-12.md)
- Level: Advanced
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: no
- Plant: none
- Prerequisites: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objectives

- Start an actuator from a button press with a set coil and remember that it is running.
- Stop the actuator with a reset coil when a sensor sees the box.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests give deterministic native POSIX host evidence on a simulated plant scene; they are not physical, hardware, HIL, or certification evidence.

## On a board

The Ladder rungs of this lesson drive a belt and read a sensor that only the simulated scene provides; a learner board has no belt, no box and no far-end sensor for the contacts to read. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-belt-to-sensor-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
