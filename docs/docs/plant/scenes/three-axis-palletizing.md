---
title: 'Three-axis palletizing'
sidebar_label: 'Three-axis palletizing'
description: 'The scene three-axis-palletizing: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Three-axis palletizing

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/three-axis-palletizing. Do not edit. >>> */}

Place boxes on a pallet in two layers with a three-axis gantry that takes numeric positions. The gantry raises its pad first, takes each box at the stop blade and puts it on a pallet slot.

## What it teaches

Computing target positions from a slot number and a layer number.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 1 |
| Item emitter | 1 |
| Stop blade | 1 |
| Diffuse optical sensor | 1 |
| Three-axis gantry | 1 |
| Pallet | 1 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `Gantry1.xSet` | command | INT | `Palletizing.XCmd` |
| `Gantry1.ySet` | command | INT | `Palletizing.YCmd` |
| `Gantry1.zSet` | command | INT | `Palletizing.ZCmd` |
| `Gantry1.xPos` | sensor | INT | `Palletizing.XPos` |
| `Gantry1.yPos` | sensor | INT | `Palletizing.YPos` |
| `Gantry1.zPos` | sensor | INT | `Palletizing.ZPos` |
| `Gantry1.grip` | command | BOOL | `Palletizing.Grip` |
| `Gantry1.gripped` | sensor | BOOL | `Palletizing.Gripped` |
| `StartButton.pressed` | sensor | BOOL | `Palletizing.Start` |
| `EyePick.detect` | sensor | BOOL | `Palletizing.EyePick` |
| `Belt1.run` | command | BOOL | `Palletizing.RunBelt` |
| `Emitter1.emit` | command | BOOL | `Palletizing.Emit` |
| `Blade1.extend` | command | BOOL | `Palletizing.Hold` |
| `StackLight1.green` | command | BOOL | `Palletizing.Green` |
| `StackLight1.amber` | command | BOOL | `Palletizing.Amber` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 50 s
- Shortest pulse (`shortestPulseMs`): 1300 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `Palletizing.Grip = false`, `Palletizing.RunBelt = false`, `Palletizing.Emit = false`, `Palletizing.Green = false` |
| from 0 ms, within 50000 ms | `fact:placed:Gantry1 = true`, `fact:layers:pallet:0 = true` |
| at 50000 ms | `Palletizing.Green = true`, `Palletizing.Grip = false`, `Palletizing.Amber = false` |
| at 50000 ms | `fact:stacked:pallet:0 = true`, `fact:itemsEmitted = true` |
| always | `fact:itemsDropped = false`, `fact:drops:Gantry1 = false` |

## Lessons that use this scene

- [Palletize with a gantry](../../learn/lessons/plant-xyz-palletizing.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/three-axis-palletizing <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
