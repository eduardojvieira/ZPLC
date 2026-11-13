---
title: 'Stacker-crane warehouse'
sidebar_label: 'Stacker-crane warehouse'
description: 'The scene stacker-crane-warehouse: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Stacker-crane warehouse

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/stacker-crane-warehouse. Do not edit. >>> */}

Store boxes from an infeed belt in the cells of a rack with a stacker crane, and bring the box of a cell to the outfeed belt when its request button is pressed.

## What it teaches

Keeping a table of occupied cells and a queue of requests, positioning two axes by number and moving a fork in a fixed order.

## Parts

| Part | Count |
| --- | --- |
| Stacker crane | 1 |
| Belt conveyor | 2 |
| Item emitter | 1 |
| Item remover | 1 |
| Diffuse optical sensor | 1 |
| Push button | 4 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `Warehouse.Start` |
| `Req1.pressed` | sensor | BOOL | `Warehouse.Req1` |
| `Req2.pressed` | sensor | BOOL | `Warehouse.Req2` |
| `Req3.pressed` | sensor | BOOL | `Warehouse.Req3` |
| `InEye.detect` | sensor | BOOL | `Warehouse.InEye` |
| `Crane1.inPosition` | sensor | BOOL | `Warehouse.InPos` |
| `Crane1.raised` | sensor | BOOL | `Warehouse.Raised` |
| `Crane1.forkCentre` | sensor | BOOL | `Warehouse.Centre` |
| `Crane1.forkAtLeft` | sensor | BOOL | `Warehouse.AtLeft` |
| `Crane1.forkAtRight` | sensor | BOOL | `Warehouse.AtRight` |
| `Crane1.loaded` | sensor | BOOL | `Warehouse.Loaded` |
| `Crane1.bay` | command | INT | `Warehouse.Bay` |
| `Crane1.level` | command | INT | `Warehouse.Level` |
| `Crane1.raise` | command | BOOL | `Warehouse.Raise` |
| `Crane1.forkLeft` | command | BOOL | `Warehouse.ForkLeft` |
| `Crane1.forkRight` | command | BOOL | `Warehouse.ForkRight` |
| `Crane1.beltRight` | command | BOOL | `Warehouse.BeltRight` |
| `Infeed.run` | command | BOOL | `Warehouse.RunIn` |
| `Outfeed.run` | command | BOOL | `Warehouse.RunOut` |
| `StackLight1.green` | command | BOOL | `Warehouse.Green` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 90 s
- Shortest pulse (`shortestPulseMs`): 400 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| always | `fact:blocked:Crane1 = false`, `fact:itemsDropped = false` |
| from 0 ms, within 90000 ms | `fact:stored:Crane1 = true` |
| from 0 ms, within 90000 ms | `fact:cell:Crane1:1:1 = true` |
| from 0 ms, within 90000 ms | `fact:cell:Crane1:2:1 = true` |
| from 0 ms, within 90000 ms | `fact:delivered:OutBin = true` |
| at 90000 ms | `Warehouse.Green = true` |

## Lessons that use this scene

- [Store and retrieve](../../learn/lessons/plant-warehouse.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/stacker-crane-warehouse <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
