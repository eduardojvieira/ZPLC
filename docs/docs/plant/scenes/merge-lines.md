---
title: 'Merge two lines'
sidebar_label: 'Merge two lines'
description: 'The scene merge-lines: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Merge two lines

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/merge-lines. Do not edit. >>> */}

Two feeder lines each load three boxes and meet at one merge zone. The program grants the zone to one line at a time, line A first. A grant ends when its box has left the zone.

## What it teaches

Sharing one resource between two requesters, so that two boxes never meet in the zone.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 3 |
| Item emitter | 2 |
| Stop blade | 2 |
| Diffuse optical sensor | 3 |
| Item remover | 1 |
| Push button | 1 |
| Indicator light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `MergeLines.Start` |
| `EyeA.detect` | sensor | BOOL | `MergeLines.WaitA` |
| `EyeB.detect` | sensor | BOOL | `MergeLines.WaitB` |
| `EyeZone.detect` | sensor | BOOL | `MergeLines.Zone` |
| `FeedA.run` | command | BOOL | `MergeLines.RunA` |
| `FeedB.run` | command | BOOL | `MergeLines.RunB` |
| `Outfeed.run` | command | BOOL | `MergeLines.RunOut` |
| `EmitterA.emit` | command | BOOL | `MergeLines.EmitA` |
| `EmitterB.emit` | command | BOOL | `MergeLines.EmitB` |
| `BladeA.extend` | command | BOOL | `MergeLines.HoldA` |
| `BladeB.extend` | command | BOOL | `MergeLines.HoldB` |
| `DoneLight.lit` | command | BOOL | `MergeLines.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 25 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `MergeLines.HoldA = false`, `MergeLines.HoldB = false`, `MergeLines.Done = false` |
| at 1000 ms | `MergeLines.HoldA = true`, `MergeLines.HoldB = true`, `fact:itemsRemoved = false` |
| from 0 ms, within 25000 ms | `fact:delivered:Remover1 = true`, `fact:emitted:EmitterA = true`, `fact:emitted:EmitterB = true` |
| at 25000 ms | `MergeLines.Done = true`, `MergeLines.HoldA = true`, `MergeLines.HoldB = true` |
| always | `fact:itemsDropped = false`, `fact:itemsCollided = false` |

## Lessons that use this scene

- [Merge two lines](../../learn/lessons/plant-merge-lines.md)
- [Change a scene: feed the second line](../../learn/lessons/plant-change-scene.md)
- [Merge two lines in Ladder](../../learn/lessons/plant-merge-lines-ladder.md)
- [Change a scene: feed the second line](../../learn/lessons/plant-change-scene-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/merge-lines <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
