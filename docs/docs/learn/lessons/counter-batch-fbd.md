---
title: "Counters in Function Block Diagram: count parts to a batch"
sidebar_label: "counter-batch-fbd"
description: "The lesson counter-batch-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Counters in Function Block Diagram: count parts to a batch

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/counter-batch-fbd. Do not edit. >>> */}

Edit a Function Block Diagram so that a CTU counter counts three parts, lights BatchFull, and clears with Reset.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: FBD
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [edge-counter-pulses](./edge-counter-pulses.md)

## Objectives

- Read a counter in a Function Block Diagram as a block with a memory: an instance whose input ports receive connections and whose outputs Q and CV can be connected on.
- Make a CTU count rising edges up to its preset, and clear it with a reset input.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how a real photocell bounces or how fast a real line can be counted.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/counter-batch-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/counter-batch-fbd.md)

{/* <<< END GENERATED: learn/lessons/counter-batch-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
