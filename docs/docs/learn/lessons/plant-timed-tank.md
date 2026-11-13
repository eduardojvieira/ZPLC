---
title: "Fill and drain with timers"
sidebar_label: "plant-timed-tank"
description: "The lesson plant-timed-tank: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Fill and drain with timers

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-timed-tank. Do not edit. >>> */}

Run one fill, hold and drain cycle of a tank with on-delay timers, a panel start and an emergency stop.

## Facts

- Module: [13](../modules/module-13.md)
- Level: Advanced
- Estimated time: 30 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: no
- Plant: [Timed tank](../../plant/scenes/timed-tank.md)
- Prerequisites: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md)

## Objectives

- Time one step of a process with an on-delay timer (TON), using one timer for each step.
- Use a timer as a safety limit on a step that normally ends on a sensor, and let an emergency stop abort the cycle.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The grade is a headless run of the simulated tank on the native POSIX runtime. It does not establish the behaviour of a real tank, valve or sensor, hardware timing, HIL, or certification.

## On a board

The tank, its valves and the emergency stop of this timed cycle are simulated, and the hardware track of the plant lessons opens in a later release, once plant I/O mode has been measured on a learner board. Complete it in Simulation, where the tank, its valves and the emergency stop are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-timed-tank <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
