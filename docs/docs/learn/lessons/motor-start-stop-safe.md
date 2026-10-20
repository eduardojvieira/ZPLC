---
title: "Safe motor start-stop"
sidebar_label: "motor-start-stop-safe"
description: "The lesson motor-start-stop-safe: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Safe motor start-stop

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/motor-start-stop-safe. Do not edit. >>> */}

Walk through a motor with seal-in, stop, and overload handling using the Motor Start Stop example.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [set-reset-alarm-latch](./set-reset-alarm-latch.md)

## Objectives

- Hold the motor on after Start is released with a seal-in.
- Drop the motor out on Stop, EStop and Overload, and never let a held Start restart it by itself.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence only; they are not hardware or HIL evidence.

## On a board

The lesson tests a stop that must win over a start, using inputs a script presses at exact times; a board would need wired buttons and a recorded trace that does not exist yet. Complete it in Simulation, where the scenario presses each input for you, and keep the stop contact wired normally closed on a real motor.

{/* <<< END GENERATED: learn/lessons/motor-start-stop-safe <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
