---
title: 'Vision sorting'
sidebar_label: 'Vision sorting'
description: 'The scene vision-sorting: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Vision sorting

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/vision-sorting. Do not edit. >>> */}

Separate two products with a vision sensor and a diverter arm. The vision sensor reads each box's product code as it passes; the arm swings across the belt to send code 2 to a side belt, and code 1 goes straight on. The code arrives as an INT value.

## What it teaches

Routing by an integer code and returning the arm home after each box.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 2 |
| Item emitter | 1 |
| Vision sensor | 1 |
| Diverter arm | 1 |
| Item remover | 2 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `VisionSorting.Start` |
| `Vision1.detect` | sensor | BOOL | `VisionSorting.Seen` |
| `Vision1.code` | sensor | INT | `VisionSorting.Code` |
| `Infeed.run` | command | BOOL | `VisionSorting.RunIn` |
| `SideBelt.run` | command | BOOL | `VisionSorting.RunSide` |
| `Arm1.divert` | command | BOOL | `VisionSorting.Divert` |
| `Beacon.amber` | command | BOOL | `VisionSorting.Busy` |
| `Beacon.green` | command | BOOL | `VisionSorting.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 78 s
- Shortest pulse (`shortestPulseMs`): 1000 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| from 0 ms, within 78000 ms | `fact:sorted:Product1 = true`, `fact:sorted:Product2 = true` |
| at 78000 ms | `VisionSorting.Done = true`, `VisionSorting.Divert = false` |
| always | `fact:misrouted:Product1 = false`, `fact:misrouted:Product2 = false`, `fact:itemsDropped = false` |

## Lessons that use this scene

- [Sort by identity code](../../learn/lessons/plant-vision-sorting.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/vision-sorting <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
