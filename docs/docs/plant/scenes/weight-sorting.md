---
title: 'Weight sorting'
sidebar_label: 'Weight sorting'
description: 'The scene weight-sorting: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Weight sorting

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/weight-sorting. Do not edit. >>> */}

Sort boxes by weight with a scale and a pusher. Each box waits on the scale at a stop blade until the reading is stable; a pusher sends boxes heavier than 3.5 kg to a side belt and lighter boxes go straight on. The weight arrives as a REAL value in kilograms.

## What it teaches

Waiting for a noisy reading to settle before comparing it with a threshold.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 3 |
| Item emitter | 1 |
| Stop blade | 1 |
| Scale | 1 |
| Pusher | 1 |
| Item remover | 2 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `WeightSorter.Start` |
| `Scale1.stable` | sensor | BOOL | `WeightSorter.Stable` |
| `Pusher1.extended` | sensor | BOOL | `WeightSorter.Extended` |
| `Pusher1.retracted` | sensor | BOOL | `WeightSorter.Retracted` |
| `Scale1.weight` | sensor | REAL | `WeightSorter.Weight` |
| `Infeed.run` | command | BOOL | `WeightSorter.RunInfeed` |
| `Outfeed.run` | command | BOOL | `WeightSorter.RunOutfeed` |
| `SideBelt.run` | command | BOOL | `WeightSorter.RunSide` |
| `Blade1.extend` | command | BOOL | `WeightSorter.Hold` |
| `Pusher1.extend` | command | BOOL | `WeightSorter.Push` |
| `StackLight1.green` | command | BOOL | `WeightSorter.Green` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 85 s
- Shortest pulse (`shortestPulseMs`): 40 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| always | `fact:misrouted:HeavyBin = false`, `fact:misrouted:LightBin = false`, `fact:itemsDropped = false` |
| from 0 ms, within 85000 ms | `fact:sorted:HeavyBin = true` |
| from 0 ms, within 85000 ms | `fact:sorted:LightBin = true` |
| at 85000 ms | `WeightSorter.Green = true` |

## Lessons that use this scene

- [Sort by weight](../../learn/lessons/plant-weight-sorting.md)
- [Sort by weight in Ladder](../../learn/lessons/plant-weight-sorting-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/weight-sorting <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
