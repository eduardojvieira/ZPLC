---
title: "Your own function block in Ladder: two pumps, one block"
sidebar_label: "ld-function-blocks"
description: "The lesson ld-function-blocks: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Your own function block in Ladder: two pumps, one block

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-function-blocks. Do not edit. >>> */}

Call the project's function block PumpCtl from a second Ladder rung so that pump 2 has its own instance, with its own memory, beside pump 1.

## Facts

- Module: [7](../modules/module-7.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: yes
- Plant: none
- Prerequisites: [tank-level-fault-reset-ladder](./tank-level-fault-reset-ladder.md)

## Objectives

- Place a function block that the project declares in Structured Text in a Ladder rung, and wire its inputs and its output.
- Explain that each instance of a function block keeps a memory of its own, so two pumps need two instances of one block.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish pump starting current, contactor wiring, suction line monitoring, HIL, or certification.

## On a board

The program of this lesson reads four inputs and drives two pump contactors with a permissive that comes from a suction line, which a learner board does not have. Complete it in Simulation, where both pumps can be started, stopped and starved of water at no cost.

{/* <<< END GENERATED: learn/lessons/ld-function-blocks <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
