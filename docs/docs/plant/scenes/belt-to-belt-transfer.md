---
title: 'Transfer between belts'
sidebar_label: 'Transfer between belts'
description: 'The scene belt-to-belt-transfer: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Transfer between belts

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/belt-to-belt-transfer. Do not edit. >>> */}

Pick boxes from one belt with a two-axis pick and place and put them on another belt. The receiving belt stops while a box is set down, because a box counts as placed only once it rests.

## What it teaches

Handing an item from one machine to another and waiting for it to rest before moving on.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 2 |
| Item emitter | 1 |
| Stop blade | 1 |
| Diffuse optical sensor | 2 |
| Two-axis pick and place | 1 |
| Item remover | 1 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `BeltTransfer.Start` |
| `EyePick.detect` | sensor | BOOL | `BeltTransfer.Waiting` |
| `EyeOut.detect` | sensor | BOOL | `BeltTransfer.OutEye` |
| `Pick1.xAtMin` | sensor | BOOL | `BeltTransfer.XMin` |
| `Pick1.xAtMax` | sensor | BOOL | `BeltTransfer.XMax` |
| `Pick1.yAtMin` | sensor | BOOL | `BeltTransfer.YMin` |
| `Pick1.yAtMax` | sensor | BOOL | `BeltTransfer.YMax` |
| `Pick1.gripped` | sensor | BOOL | `BeltTransfer.Gripped` |
| `Infeed.run` | command | BOOL | `BeltTransfer.RunIn` |
| `Outfeed.run` | command | BOOL | `BeltTransfer.RunOut` |
| `Source1.emit` | command | BOOL | `BeltTransfer.Emit` |
| `Stop1.extend` | command | BOOL | `BeltTransfer.Hold` |
| `Pick1.xPlus` | command | BOOL | `BeltTransfer.XPlus` |
| `Pick1.xMinus` | command | BOOL | `BeltTransfer.XMinus` |
| `Pick1.yPlus` | command | BOOL | `BeltTransfer.YPlus` |
| `Pick1.yMinus` | command | BOOL | `BeltTransfer.YMinus` |
| `Pick1.grip` | command | BOOL | `BeltTransfer.Grip` |
| `Beacon.amber` | command | BOOL | `BeltTransfer.Busy` |
| `Beacon.green` | command | BOOL | `BeltTransfer.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 45 s
- Shortest pulse (`shortestPulseMs`): 330 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `BeltTransfer.Hold = false`, `BeltTransfer.Grip = false`, `BeltTransfer.XPlus = false`, `BeltTransfer.YPlus = false`, `BeltTransfer.Done = false` |
| at 1500 ms | `BeltTransfer.Hold = true`, `BeltTransfer.Busy = true`, `BeltTransfer.Done = false` |
| from 0 ms, within 45000 ms | `fact:picked:Pick1 = true`, `fact:placed:Pick1 = true`, `fact:delivered:Remover1 = true` |
| at 45000 ms | `BeltTransfer.Done = true`, `BeltTransfer.XPlus = false`, `BeltTransfer.XMinus = false`, `BeltTransfer.YPlus = false`, `BeltTransfer.YMinus = false`, `BeltTransfer.Grip = false` |
| always | `fact:itemsDropped = false`, `fact:drops:Pick1 = false` |

## Lessons that use this scene

- [Pick from one belt, place on another](../../learn/lessons/plant-belt-transfer.md)
- [Pick from one belt, place on another in Ladder](../../learn/lessons/plant-belt-transfer-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/belt-to-belt-transfer <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
