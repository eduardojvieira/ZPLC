---
title: "Emergency stop and interlocks"
sidebar_label: "plant-estop-interlocks"
description: "The lesson plant-estop-interlocks: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Emergency stop and interlocks

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-estop-interlocks. Do not edit. >>> */}

Make a running line stop when the emergency stop is pressed, show it with the red light and refuse to restart until Start is pressed again.

## Facts

- Module: [18](../modules/module-18.md)
- Level: Advanced
- Estimated time: 40 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: yes
- Plant: [Three-level lifts](../../plant/scenes/three-level-lifts.md)
- Prerequisites: [plant-three-level-lifts](./plant-three-level-lifts.md), [interlock-guard-permissive](./interlock-guard-permissive.md)

## Objectives

- Stop every output while the emergency stop is pressed.
- Remember the stop, so that releasing the button does not restart the line.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety.

## On a board

The emergency stop is a part of the simulated scene; a learner board has no emergency-stop circuit, and the hardware track comes with the HIL run. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-estop-interlocks <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
