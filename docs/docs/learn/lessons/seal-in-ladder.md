---
title: "Seal-in in Ladder: a motor that holds itself on"
sidebar_label: "seal-in-ladder"
description: "The lesson seal-in-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Seal-in in Ladder: a motor that holds itself on

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/seal-in-ladder. Do not edit. >>> */}

Edit a Ladder rung so that a Start press keeps the motor on after the button is released, and a Stop press drops it even while Start is still pressed.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Read a Ladder rung as a path of contacts that must all pass power to reach a coil.
- Hold a coil on with a contact of its own output in parallel with Start, and keep Stop in series so that Stop wins.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish a safe stop function, wiring, hardware timing, HIL, or certification.

## On a board

The lesson is graded on a Start and Stop pressed together at an exact 10 ms step, which a board cannot repeat the same way every run. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/seal-in-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
