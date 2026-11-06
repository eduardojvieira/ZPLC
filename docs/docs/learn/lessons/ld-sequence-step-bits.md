---
title: "A sequence in Ladder: step bits move a tank from fill to mix to drain"
sidebar_label: "ld-sequence-step-bits"
description: "The lesson ld-sequence-step-bits: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# A sequence in Ladder: step bits move a tank from fill to mix to drain

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-sequence-step-bits. Do not edit. >>> */}

Add the transition from the mix step to the drain step in a Ladder sequence, so that exactly one step bit is on at a time and the tank drains after the mix.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: yes
- Plant: none
- Prerequisites: [ld-analog-scaling](./ld-analog-scaling.md)

## Objectives

- Explain a sequence as step bits, where exactly one bit is on at a time and a transition moves the sequence to the next one.
- Write a transition in Ladder as two actions in the same scan: set the next step bit and reset the current one.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish valve travel time, mixer motor behavior, tank level measurement, HIL, or certification.

## On a board

The sequence of this lesson drives a fill valve, a mixer and a drain valve that a learner board does not have, and the program uses three outputs where the boards have two. Complete it in Simulation, where the whole tank sequence can be repeated at no cost.

{/* <<< END GENERATED: learn/lessons/ld-sequence-step-bits <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
