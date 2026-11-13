---
title: 'Latch between two sensors'
sidebar_label: 'Latch between two sensors'
description: 'The scene latch-two-sensors: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Latch between two sensors

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/latch-two-sensors. Do not edit. >>> */}

A box rides a belt past two sensors. The first sensor starts the belt and the second stops it. This is a set and reset latch.

## What it teaches

The set and reset latch, driven by two sensors instead of two buttons.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 1 |
| Box | 1 |
| Diffuse optical sensor | 2 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `EyeA.detect` | sensor | BOOL | `LatchTwoSensors.EyeA` |
| `EyeB.detect` | sensor | BOOL | `LatchTwoSensors.EyeB` |
| `Belt1.run` | command | BOOL | `LatchTwoSensors.Run` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 8 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| from 0 ms, within 100 ms | `fact:count:EyeA = true` |
| from 0 ms, within 8000 ms | `fact:count:EyeB = true` |
| at 8000 ms | `LatchTwoSensors.Run = false` |
| always | `fact:itemsDropped = false` |

## Lessons that use this scene

- [From sensor A to sensor B](../../learn/lessons/plant-latch-two-sensors.md)
- [From sensor A to sensor B in Ladder](../../learn/lessons/plant-latch-two-sensors-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/latch-two-sensors <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
