---
title: 'Buffer and release'
sidebar_label: 'Buffer and release'
description: 'The scene buffer-release: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Buffer and release

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/buffer-release. Do not edit. >>> */}

Load five boxes on a buffer belt, hold them at a stop blade, and release one box for each press of the release button. The next box must not follow the released one.

## What it teaches

Accumulating items and releasing them one at a time on a request.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 2 |
| Item emitter | 1 |
| Stop blade | 1 |
| Diffuse optical sensor | 3 |
| Item remover | 1 |
| Push button | 2 |
| Indicator light | 2 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `BufferRelease.Start` |
| `ReleaseButton.pressed` | sensor | BOOL | `BufferRelease.ReleaseCmd` |
| `EyeFull.detect` | sensor | BOOL | `BufferRelease.EyeFull` |
| `EyeBlade.detect` | sensor | BOOL | `BufferRelease.EyeBlade` |
| `EyeRelease.detect` | sensor | BOOL | `BufferRelease.EyeRelease` |
| `Buffer1.run` | command | BOOL | `BufferRelease.RunBuffer` |
| `Release1.run` | command | BOOL | `BufferRelease.RunRelease` |
| `Emitter1.emit` | command | BOOL | `BufferRelease.Emit` |
| `Blade1.extend` | command | BOOL | `BufferRelease.Hold` |
| `DoneLight.lit` | command | BOOL | `BufferRelease.Done` |
| `FaultLight.lit` | command | BOOL | `BufferRelease.Fault` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 36 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `BufferRelease.Hold = false`, `BufferRelease.Done = false` |
| at 8000 ms | `BufferRelease.Hold = true` |
| at 15500 ms | `BufferRelease.Hold = true`, `fact:count:EyeFull = true`, `fact:count:EyeBlade = true`, `fact:count:EyeRelease = false`, `fact:itemsRemoved = false` |
| at 18500 ms | `BufferRelease.Hold = true`, `fact:count:EyeRelease = true` |
| at 36000 ms | `BufferRelease.Done = true`, `BufferRelease.Hold = true` |
| from 0 ms, within 36000 ms | `fact:emitted:Emitter1 = true`, `fact:delivered:Remover1 = true` |
| always | `BufferRelease.Fault = false`, `fact:itemsDropped = false`, `fact:itemsCollided = false` |

## Lessons that use this scene

- [Accumulate and release](../../learn/lessons/plant-buffer-release.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/buffer-release <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
