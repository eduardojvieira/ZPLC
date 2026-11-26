---
title: "Interlocks in Ladder: a reversing motor"
sidebar_label: "interlock-reversing-ladder"
description: "The lesson interlock-reversing-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Interlocks in Ladder: a reversing motor

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-reversing-ladder. Do not edit. >>> */}

Edit two Ladder rungs so that a reversing motor never closes its Forward and Reverse contactors together, and a lost lubrication permissive drops either direction.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [interlock-guard-permissive](./interlock-guard-permissive.md), [seal-in-ladder](./seal-in-ladder.md)

## Objectives

- Tell an interlock, a contact that keeps one output off while another is on, from a permissive, a contact that must be closed for an output to run at all.
- Lock two coils out of each other, so that one can never run while the other is on, together with Stop and the permissive.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show a safety function, mechanically interlocked contactors or wiring.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/interlock-reversing-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/interlock-reversing-ladder.md)

{/* <<< END GENERATED: learn/lessons/interlock-reversing-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
