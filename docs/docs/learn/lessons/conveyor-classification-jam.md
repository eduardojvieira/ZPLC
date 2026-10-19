---
title: "Conveyor classification and safe jam"
sidebar_label: "conveyor-classification-jam"
description: "The lesson conveyor-classification-jam: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Conveyor classification and safe jam

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/conveyor-classification-jam. Do not edit. >>> */}

Walk through part classification and the safe jam lockout in the Conveyor 01 example.

## Facts

- Module: [8](../modules/module-8.md)
- Level: Advanced
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: [`conveyor-v1`](../plants.md)
- Prerequisites: [motor-plant-feedback](./motor-plant-feedback.md), [tank-level-fault-reset](./tank-level-fault-reset.md)

## Objectives

- Stop the belt and light FaultLamp while the plant reports JamDetected.
- Keep Reset from releasing the fault while the jam is still present.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence only; they are not physical conveyor, jam clearance, hardware, HIL, or certification evidence.

## On a board

The lesson needs the conveyor plant with its sensors and a forced jam, which a board cannot reproduce without the machine. Complete it in Simulation, where the conveyor and the jam are part of the scenario.

{/* <<< END GENERATED: learn/lessons/conveyor-classification-jam <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
