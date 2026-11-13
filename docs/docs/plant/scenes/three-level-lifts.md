---
title: 'Three-level lifts'
sidebar_label: 'Three-level lifts'
description: 'The scene three-level-lifts: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Three-level lifts

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/three-level-lifts. Do not edit. >>> */}

Move five boxes from level 1 to level 3 with two lifts and the belts between them. Lift A takes a box from the infeed to level 2, a transfer belt carries it to lift B, and lift B raises it to the outfeed at level 3. An emergency stop halts the line.

## What it teaches

Coordinating two lifts that hand over a box, and an emergency stop that stops every movement.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 3 |
| Item emitter | 1 |
| Lift | 2 |
| Item remover | 1 |
| Diffuse optical sensor | 3 |
| Push button | 1 |
| Emergency stop | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `ThreeLevelLifts.Start` |
| `EStop1.ok` | sensor | BOOL | `ThreeLevelLifts.EStopOk` |
| `EyeFoot.detect` | sensor | BOOL | `ThreeLevelLifts.BoxOnA` |
| `EyeMid.detect` | sensor | BOOL | `ThreeLevelLifts.BoxOnB` |
| `EyeTop.detect` | sensor | BOOL | `ThreeLevelLifts.BoxAtTop` |
| `LiftA.atLevel1` | sensor | BOOL | `ThreeLevelLifts.AAtLow` |
| `LiftA.atLevel2` | sensor | BOOL | `ThreeLevelLifts.AAtHigh` |
| `LiftB.atLevel1` | sensor | BOOL | `ThreeLevelLifts.BAtLow` |
| `LiftB.atLevel2` | sensor | BOOL | `ThreeLevelLifts.BAtHigh` |
| `Infeed.run` | command | BOOL | `ThreeLevelLifts.RunInfeed` |
| `Transfer.run` | command | BOOL | `ThreeLevelLifts.RunTransfer` |
| `Outfeed.run` | command | BOOL | `ThreeLevelLifts.RunOutfeed` |
| `LiftA.up` | command | BOOL | `ThreeLevelLifts.AUp` |
| `LiftA.down` | command | BOOL | `ThreeLevelLifts.ADown` |
| `LiftA.run` | command | BOOL | `ThreeLevelLifts.ARun` |
| `LiftB.up` | command | BOOL | `ThreeLevelLifts.BUp` |
| `LiftB.down` | command | BOOL | `ThreeLevelLifts.BDown` |
| `LiftB.run` | command | BOOL | `ThreeLevelLifts.BRun` |
| `StackLight1.green` | command | BOOL | `ThreeLevelLifts.Green` |
| `StackLight1.red` | command | BOOL | `ThreeLevelLifts.Red` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 95 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| always | `fact:itemsDropped = false` |
| at 16000 ms | `ThreeLevelLifts.Red = true` |
| from 0 ms, within 95000 ms | `fact:delivered:TopBin = true` |
| at 95000 ms | `ThreeLevelLifts.Green = true` |

## Lessons that use this scene

- [Move boxes between three levels](../../learn/lessons/plant-three-level-lifts.md)
- [Emergency stop and interlocks](../../learn/lessons/plant-estop-interlocks.md)
- [Emergency stop and interlocks in Ladder](../../learn/lessons/plant-estop-interlocks-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/three-level-lifts <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
