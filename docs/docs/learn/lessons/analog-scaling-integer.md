---
title: "Analog scaling: from raw counts to a percentage"
sidebar_label: "analog-scaling-integer"
description: "The lesson analog-scaling-integer: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Analog scaling: from raw counts to a percentage

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/analog-scaling-integer. Do not edit. >>> */}

Scale a raw count from 0 to 1000 into a percentage with integer arithmetic, and raise a warning at 50 percent and an alarm at 80 percent.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: ST
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [types-arithmetic-comparison](./types-arithmetic-comparison.md)

## Objectives

- Scale a raw count to engineering units with a multiplication followed by a division, in that order.
- See that integer division drops the remainder, and choose an integer type wide enough for the intermediate product.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the accuracy, noise or calibration of a real analog input, HIL, or certification.

{/* <<< END GENERATED: learn/lessons/analog-scaling-integer <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
