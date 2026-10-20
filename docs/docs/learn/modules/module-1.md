---
title: "Module 1: How a PLC thinks: the scan cycle, then a first blink"
sidebar_label: "Module 1"
description: "The lessons of module 1 of the course, generated from the lesson packages."
tags: [learn, generated]
unlisted: true
---

# Module 1: How a PLC thinks: the scan cycle, then a first blink

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/modules/module-1. Do not edit. >>> */}

A PLC repeats one cycle: read the inputs, run the program, write the outputs. Seal-in, edges and timers cannot be understood without the scan cycle, so it comes first, and a first blink in Ladder and in Structured Text follows at once.

- Level: Foundation
- Tracks: Simulation, Hardware
- Requires module: [0](./module-0.md)

## Lessons

| Lesson | Id | Languages | minutes |
| --- | --- | --- | --- |
| [Scan cycle and one-scan memory](../lessons/scan-cycle-one-scan-memory.md) | `scan-cycle-one-scan-memory` | ST | 10 |
| [TON oscillator and output feedback](../lessons/blinky-ladder-timer-feedback.md) | `blinky-ladder-timer-feedback` | LD | 20 |
| [Write a blinker in Structured Text](../lessons/blink-structured-text.md) | `blink-structured-text` | ST | 15 |

{/* <<< END GENERATED: learn/modules/module-1 <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
