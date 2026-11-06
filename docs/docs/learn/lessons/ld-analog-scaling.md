---
title: "Analog scaling in Ladder: counts to percent with MUL, DIV and LIMIT"
sidebar_label: "ld-analog-scaling"
description: "The lesson ld-analog-scaling: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Analog scaling in Ladder: counts to percent with MUL, DIV and LIMIT

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-analog-scaling. Do not edit. >>> */}

Scale the raw counts of an analog input to a level in percent with a MUL box and then a DIV box, keep the result in range with LIMIT, and drive two level lamps with comparison boxes.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: yes
- Plant: none
- Prerequisites: [ld-compare-math](./ld-compare-math.md)

## Objectives

- Scale raw analog counts to engineering units by multiplying by the span of the units and then dividing by the span of the counts, in a type that the product fits.
- Keep a value inside its range with a LIMIT box, and compare the scaled value, not the raw counts, with the thresholds of the alarms.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task and blocks that stand in for the sensor; they do not establish the accuracy, noise or calibration of a real analog input, wiring, HIL, or certification.

## On a board

The lesson stands in for the analog input with blocks in the program and the lamps are graded in the native simulator, and it ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/ld-analog-scaling <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
