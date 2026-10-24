---
title: "Simultaneous branches: fill and heat together"
sidebar_label: "simultaneous-branches-sfc"
description: "The lesson simultaneous-branches-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Simultaneous branches: fill and heat together

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/simultaneous-branches-sfc. Do not edit. >>> */}

Start two branches at once, let each finish in its own time, and join them so that the mixer starts only when both are done.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 30 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: none
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objectives

- Read a simultaneous divergence as one transition that activates several steps at once, so that they run side by side.
- Write a convergence as one transition that leaves every step it waits for and fires only when all of them are active.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish heating rates, fill volumes, mixing quality, HIL, or certification.

## On a board

The mix cell starts a valve, a heater and a mixer from one button; its two branches are graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/simultaneous-branches-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
