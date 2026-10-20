---
title: "Command, feedback, and speed"
sidebar_label: "motor-plant-feedback"
description: "The lesson motor-plant-feedback: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Command, feedback, and speed

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/motor-plant-feedback. Do not edit. >>> */}

Separate a motor command from the run confirmation using the Motor Plant.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: ST
- Tracks: Simulation
- Plant: [`motor-v1`](../plants.md)
- Prerequisites: [pedestrian-crossing-states](./pedestrian-crossing-states.md)

## Objectives

- Separate the command to the motor from the confirmation that it runs.
- Keep the request until Stop and let Running follow the request only once AtSpeed arrives.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host and discrete-plant evidence only; they are not physical-motor, hardware, HIL, or certification evidence.

## On a board

The run feedback comes from the simulated motor plant, which answers your outputs; a learner board has no motor to give it. Complete it in Simulation, which provides the motor and its run feedback.

{/* <<< END GENERATED: learn/lessons/motor-plant-feedback <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
