---
title: 'Lift with stacking'
sidebar_label: 'Lift with stacking'
description: 'The scene lift-stacking: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Lift with stacking

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/lift-stacking. Do not edit. >>> */}

Gather up to five workpieces into one crate with a lift. A crate waits in the middle of the lift, the lift rises to the feeder, workpieces are fed one at a time and counted into the crate, and the full crate is lowered and sent out.

## What it teaches

A sequence of lift moves with a count, in which the program waits for each position switch before the next move.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 3 |
| Item emitter | 2 |
| Lift | 1 |
| Item remover | 1 |
| Diffuse optical sensor | 3 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `LiftStacking.Start` |
| `CrateEye.detect` | sensor | BOOL | `LiftStacking.CrateEye` |
| `CountEye.detect` | sensor | BOOL | `LiftStacking.CountEye` |
| `OutEye.detect` | sensor | BOOL | `LiftStacking.OutEye` |
| `Lift1.atLevel1` | sensor | BOOL | `LiftStacking.AtLevel1` |
| `Lift1.atLevel2` | sensor | BOOL | `LiftStacking.AtLevel2` |
| `CrateSource.emit` | command | BOOL | `LiftStacking.EmitCrate` |
| `PartSource.emit` | command | BOOL | `LiftStacking.EmitPart` |
| `FloorIn.run` | command | BOOL | `LiftStacking.RunIn` |
| `FloorOut.run` | command | BOOL | `LiftStacking.RunOut` |
| `Feeder.run` | command | BOOL | `LiftStacking.RunFeeder` |
| `Lift1.up` | command | BOOL | `LiftStacking.Up` |
| `Lift1.down` | command | BOOL | `LiftStacking.Down` |
| `Lift1.run` | command | BOOL | `LiftStacking.RunLift` |
| `StackLight1.green` | command | BOOL | `LiftStacking.Green` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 60 s
- Shortest pulse (`shortestPulseMs`): 400 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| always | `fact:itemsDropped = false` |
| from 0 ms, within 60000 ms | `fact:loaded:crate:0 = true` |
| from 0 ms, within 60000 ms | `fact:delivered:CrateBin = true` |
| at 60000 ms | `LiftStacking.Green = true` |

## Lessons that use this scene

- [Gather items into a crate](../../learn/lessons/plant-lift-stacking.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/lift-stacking <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
