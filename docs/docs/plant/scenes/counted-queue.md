---
title: 'Counted queue'
sidebar_label: 'Counted queue'
description: 'The scene counted-queue: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Counted queue

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/counted-queue. Do not edit. >>> */}

Send three boxes one after another and stop when three have left the belt. Each next box goes out when the previous one has left the emitter. A counter keeps the total.

## What it teaches

Counting events with a counter and releasing the next item only when the previous one has gone.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 1 |
| Item emitter | 1 |
| Diffuse optical sensor | 2 |
| Item remover | 1 |
| Push button | 1 |
| Indicator light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `CountedQueue.Start` |
| `EyeIn.detect` | sensor | BOOL | `CountedQueue.EyeIn` |
| `EyeOut.detect` | sensor | BOOL | `CountedQueue.EyeOut` |
| `Belt1.run` | command | BOOL | `CountedQueue.Run` |
| `Emitter1.emit` | command | BOOL | `CountedQueue.Emit` |
| `DoneLight.lit` | command | BOOL | `CountedQueue.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 20 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `CountedQueue.Run = false`, `CountedQueue.Done = false` |
| from 0 ms, within 20000 ms | `fact:delivered:Remover1 = true`, `fact:itemsEmitted = true` |
| at 20000 ms | `CountedQueue.Done = true`, `CountedQueue.Run = false` |
| always | `fact:itemsDropped = false`, `fact:itemsCollided = false` |

## Lessons that use this scene

- [Load and unload three boxes](../../learn/lessons/plant-counted-queue.md)
- [Load and unload three boxes in Ladder](../../learn/lessons/plant-counted-queue-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/counted-queue <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
