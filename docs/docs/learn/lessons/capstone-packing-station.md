---
title: "Capstone: a packing station, from description to tested program"
sidebar_label: "capstone-packing-station"
description: "The lesson capstone-packing-station: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Capstone: a packing station, from description to tested program

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/capstone-packing-station. Do not edit. >>> */}

Turn a written description of a small packing station into a Structured Text program, using a seal-in, an emergency stop, a counter, a timer and a latched fault, and prove it with a scenario that also checks what must not happen.

## Facts

- Module: [11](../modules/module-11.md)
- Level: Advanced
- Estimated time: 60 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [conveyor-two-parts-diagnosis](./conveyor-two-parts-diagnosis.md)

## Objectives

- Turn five written requirements into one Structured Text program that combines a seal-in, an emergency stop, a counter, a timer and a latched fault.
- Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish packing-line requirements, safety function behaviour, sensor timing or any real machine behaviour, HIL, or certification.

## On a board

The station reads five digital inputs (Start, Stop, EStop, Part and Reset), and the learner boards have four. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/capstone-packing-station <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
