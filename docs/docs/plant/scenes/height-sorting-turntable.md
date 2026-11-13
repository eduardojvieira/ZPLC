---
title: 'Height sorting with turntable'
sidebar_label: 'Height sorting with turntable'
description: 'The scene height-sorting-turntable: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Height sorting with turntable

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/height-sorting-turntable. Do not edit. >>> */}

Sort boxes by height into three bins with a light array and a turntable. The light array reads each box's height as it passes; the box stops on the turntable, which turns to send short boxes straight on, medium boxes to the right and tall boxes to the left. The height arrives as a REAL value.

## What it teaches

Classifying a number into three classes with thresholds and routing each class to its own output.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 4 |
| Item emitter | 1 |
| Light array | 1 |
| Stop blade | 1 |
| Diffuse optical sensor | 2 |
| Turntable | 1 |
| Item remover | 3 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `HeightSort.Start` |
| `LightArray1.detect` | sensor | BOOL | `HeightSort.ArrayBusy` |
| `EyeStop.detect` | sensor | BOOL | `HeightSort.AtBlade` |
| `EyeTable.detect` | sensor | BOOL | `HeightSort.OnTable` |
| `Table1.atCentre` | sensor | BOOL | `HeightSort.AtCentre` |
| `Table1.atLeft` | sensor | BOOL | `HeightSort.AtLeft` |
| `Table1.atRight` | sensor | BOOL | `HeightSort.AtRight` |
| `LightArray1.height` | sensor | REAL | `HeightSort.HeightCm` |
| `Infeed.run` | command | BOOL | `HeightSort.RunIn` |
| `Table1.run` | command | BOOL | `HeightSort.RunTable` |
| `OutCentre.run` | command | BOOL | `HeightSort.RunCentre` |
| `OutRight.run` | command | BOOL | `HeightSort.RunRight` |
| `OutLeft.run` | command | BOOL | `HeightSort.RunLeft` |
| `Stop1.extend` | command | BOOL | `HeightSort.Hold` |
| `Table1.toLeft` | command | BOOL | `HeightSort.ToLeft` |
| `Table1.toRight` | command | BOOL | `HeightSort.ToRight` |
| `Beacon.amber` | command | BOOL | `HeightSort.Busy` |
| `Beacon.green` | command | BOOL | `HeightSort.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 77 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `HeightSort.Hold = false`, `HeightSort.Busy = false`, `HeightSort.Done = false` |
| always | `fact:misrouted:BinShort = false`, `fact:misrouted:BinMedium = false`, `fact:misrouted:BinTall = false`, `fact:itemsDropped = false` |
| from 0 ms, within 77000 ms | `fact:sorted:BinShort = true`, `fact:sorted:BinMedium = true`, `fact:sorted:BinTall = true` |
| at 77000 ms | `HeightSort.Done = true`, `HeightSort.Busy = false` |

## Lessons that use this scene

- [Sort by height, turntable](../../learn/lessons/plant-height-turntable.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/height-sorting-turntable <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
