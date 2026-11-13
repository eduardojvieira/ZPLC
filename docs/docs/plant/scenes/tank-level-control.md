---
title: 'Tank level control'
sidebar_label: 'Tank level control'
description: 'The scene tank-level-control: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Tank level control

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/tank-level-control. Do not edit. >>> */}

Hold the level of a tank at a set point with a PID loop. The set point comes from a potentiometer in metres, a second potentiometer opens the discharge valve as a disturbance, and a numeric display shows the level. The level and the set point arrive as INT raw values and the valves take REAL percentages.

## What it teaches

Closing a control loop on numeric signals, scaling raw counts and holding a set point against a disturbance.

## Parts

| Part | Count |
| --- | --- |
| Tank | 1 |
| Potentiometer | 2 |
| Numeric display | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `Tank1.level` | sensor | INT | `TankLevel.LevelRaw` |
| `SetPoint.value` | sensor | INT | `TankLevel.SetPointRaw` |
| `DrainPot.value` | sensor | INT | `TankLevel.DrainRaw` |
| `Tank1.fill` | command | REAL | `TankLevel.FillCmd` |
| `Tank1.drain` | command | REAL | `TankLevel.DrainCmd` |
| `LevelDisplay.value` | command | REAL | `TankLevel.LevelShown` |
| `StackLight1.green` | command | BOOL | `TankLevel.Green` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 90 s
- Shortest pulse (`shortestPulseMs`): 200 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| from 30000 ms, for 8000 ms | `fact:inBand:Tank1 = true` |
| from 40000 ms, within 20000 ms | `fact:inBand:Tank1 = true` |
| from 60000 ms, for 8000 ms | `fact:inBand:Tank1 = true` |
| from 85000 ms, for 5000 ms | `fact:inBand:Tank1 = false` |
| always | `fact:spilledL:Tank1 = false` |

## Lessons that use this scene

- [Read the level](../../learn/lessons/plant-tank-level-scaling.md)
- [Hold the level with PID](../../learn/lessons/plant-tank-pid.md)
- [The same loop in function blocks](../../learn/lessons/plant-tank-pid-fbd.md)
- [Read the level in Ladder](../../learn/lessons/plant-tank-level-scaling-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/tank-level-control <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
