---
title: 'Timed tank'
sidebar_label: 'Timed tank'
description: 'The scene timed-tank: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Timed tank

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/timed-tank. Do not edit. >>> */}

Fill a tank for a set time with a timer, hold it, then drain it until the low level switch reports a low level. A press of the start button begins the cycle. The emergency stop closes both valves at any time and lights the red lamp.

## What it teaches

Sequencing a process with on-delay timers, and an emergency stop that wins over the sequence.

## Parts

| Part | Count |
| --- | --- |
| Tank | 1 |
| Push button | 1 |
| Emergency stop | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `TimedTank.Start` |
| `EStop1.ok` | sensor | BOOL | `TimedTank.EStopOk` |
| `Tank1.levelLow` | sensor | BOOL | `TimedTank.LevelLow` |
| `Tank1.levelHigh` | sensor | BOOL | `TimedTank.LevelHigh` |
| `Tank1.fill` | command | BOOL | `TimedTank.Fill` |
| `Tank1.drain` | command | BOOL | `TimedTank.Drain` |
| `StackLight1.green` | command | BOOL | `TimedTank.Green` |
| `StackLight1.amber` | command | BOOL | `TimedTank.Amber` |
| `StackLight1.red` | command | BOOL | `TimedTank.Red` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 25 s
- Shortest pulse (`shortestPulseMs`): 200 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `TimedTank.Fill = false`, `TimedTank.Drain = false`, `TimedTank.Green = false`, `TimedTank.Red = false` |
| at 800 ms | `TimedTank.Fill = true`, `TimedTank.Amber = true`, `TimedTank.Green = false` |
| at 1500 ms | `TimedTank.Fill = false`, `TimedTank.Drain = false`, `TimedTank.Red = true` |
| at 25000 ms | `TimedTank.Green = true`, `TimedTank.Drain = false`, `TimedTank.Red = false` |
| always | `fact:spilledL:Tank1 = false` |

## Lessons that use this scene

- [Fill and drain with timers](../../learn/lessons/plant-timed-tank.md)
- [Fill and drain with timers in Ladder](../../learn/lessons/plant-timed-tank-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/timed-tank <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
