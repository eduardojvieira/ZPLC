---
title: 'Height sorting with a chain transfer'
sidebar_label: 'Height sorting with a chain transfer'
description: 'The scene height-sorting-chain: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Height sorting with a chain transfer

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/height-sorting-chain. Do not edit. >>> */}

Sort boxes by height into three bins with two beam sensors at different heights and a chain transfer. The two beams tell short, medium and tall boxes apart; short boxes go straight on, and the chain transfer lifts medium and tall boxes and moves them sideways to one side or the other.

## What it teaches

Reading a class from two on and off sensors instead of one number.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 4 |
| Item emitter | 1 |
| Chain transfer | 1 |
| Stop blade | 1 |
| Diffuse optical sensor | 3 |
| Item remover | 3 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `HeightSortChain.Start` |
| `BeamLow.detect` | sensor | BOOL | `HeightSortChain.Low` |
| `BeamHigh.detect` | sensor | BOOL | `HeightSortChain.High` |
| `EyeChain.detect` | sensor | BOOL | `HeightSortChain.AtBlade` |
| `Chain1.raised` | sensor | BOOL | `HeightSortChain.Raised` |
| `Chain1.lowered` | sensor | BOOL | `HeightSortChain.Lowered` |
| `Infeed.run` | command | BOOL | `HeightSortChain.RunIn` |
| `Chain1.run` | command | BOOL | `HeightSortChain.RunChain` |
| `Chain1.lift` | command | BOOL | `HeightSortChain.Lift` |
| `Chain1.moveRight` | command | BOOL | `HeightSortChain.MoveRight` |
| `Chain1.moveLeft` | command | BOOL | `HeightSortChain.MoveLeft` |
| `Straight.run` | command | BOOL | `HeightSortChain.RunStraight` |
| `SideRight.run` | command | BOOL | `HeightSortChain.RunRight` |
| `SideLeft.run` | command | BOOL | `HeightSortChain.RunLeft` |
| `Stop1.extend` | command | BOOL | `HeightSortChain.Hold` |
| `Beacon.amber` | command | BOOL | `HeightSortChain.Busy` |
| `Beacon.green` | command | BOOL | `HeightSortChain.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 62 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `HeightSortChain.Hold = false`, `HeightSortChain.Lift = false`, `HeightSortChain.Done = false` |
| from 0 ms, within 62000 ms | `fact:sorted:BinShort = true`, `fact:sorted:BinMedium = true`, `fact:sorted:BinTall = true` |
| at 62000 ms | `HeightSortChain.Done = true`, `HeightSortChain.Lift = false`, `HeightSortChain.MoveRight = false`, `HeightSortChain.MoveLeft = false` |
| always | `fact:misrouted:BinShort = false`, `fact:misrouted:BinMedium = false`, `fact:misrouted:BinTall = false`, `fact:itemsDropped = false` |

## Lessons that use this scene

- [Sort by height, chain transfer](../../learn/lessons/plant-height-chain.md)
- [Find the fault](../../learn/lessons/plant-fault-actions.md)
- [Sort by height, chain transfer in Ladder](../../learn/lessons/plant-height-chain-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/height-sorting-chain <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
