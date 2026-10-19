---
title: "Timers: an off-delay light and an on-delay filter"
sidebar_label: "timers-on-delay-off-delay"
description: "The lesson timers-on-delay-off-delay: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Timers: an off-delay light and an on-delay filter

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay. Do not edit. >>> */}

Use a TOF timer to keep a light on after a button is released, and a TON timer to ignore a sensor blip that is too short.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objectives

- Keep an output on for a fixed time after its input drops, using TOF.
- Ignore an input that is on for less than a fixed time, using TON.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish electrical debounce, sensor response, target timing, HIL, or certification.

## On a board

The lesson measures on-delay and off-delay times against the scan clock; real board timing is not reproducible enough for a deterministic check, and no recorded trace exists yet. Complete it in Simulation, where time is deterministic.

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
