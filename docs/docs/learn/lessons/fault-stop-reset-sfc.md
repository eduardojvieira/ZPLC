---
title: "Faults, stop and reset in a chart"
sidebar_label: "fault-stop-reset-sfc"
description: "The lesson fault-stop-reset-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Faults, stop and reset in a chart

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/fault-stop-reset-sfc. Do not edit. >>> */}

Stop a feed and press cycle the moment a fault appears, and return it to IDLE only after the fault is gone and Reset is pressed.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: none
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md), [tank-level-fault-reset](./tank-level-fault-reset.md)

## Objectives

- Add a fault step that every working step can reach, with a transition of higher priority than the timers.
- Return the chart to its initial step with a Reset that works only once the fault is gone.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish a safe stop, a safety function, press behaviour, HIL, or certification.

## On a board

The press cell reads a start button, a fault sensor and a reset button and drives a feeder, a press and an alarm lamp; its stop and reset are graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/fault-stop-reset-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
