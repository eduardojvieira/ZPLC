---
title: "Edges and pulse counter"
sidebar_label: "edge-counter-pulses"
description: "The lesson edge-counter-pulses: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Edges and pulse counter

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses. Do not edit. >>> */}

Use a CTU counter to count three discrete pulses and reset the count.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objectives

- Count three rising edges of PulseInput with a CTU counter.
- Reset the count and CountReached with Reset.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence only; they are not physical-sensor, bounce, hardware, HIL, or certification evidence.

## On a board

The lesson counts pulses that the scenario sends at exact times; a board would need a pulse source and a recorded trace that has not been written yet. Complete it in Simulation, then try the Edge counter example on your board with a push button.

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
