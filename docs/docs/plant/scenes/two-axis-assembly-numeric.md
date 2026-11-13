---
title: 'Two-axis assembly, numeric'
sidebar_label: 'Two-axis assembly, numeric'
description: 'The scene two-axis-assembly-numeric: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Two-axis assembly, numeric

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/two-axis-assembly-numeric. Do not edit. >>> */}

The same task with the numeric variant: the program sets the X and Y positions of the pick and place in metres and reads its position back, instead of jogging to limit switches.

## What it teaches

Commanding positions with numeric signals and reading the position back.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 3 |
| Item emitter | 2 |
| Stop blade | 2 |
| Diffuse optical sensor | 2 |
| Two-axis pick and place | 1 |
| Item remover | 1 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `Assembler.Start` |
| `LidEye.detect` | sensor | BOOL | `Assembler.LidReady` |
| `BaseEye.detect` | sensor | BOOL | `Assembler.BaseReady` |
| `Pick1.gripped` | sensor | BOOL | `Assembler.Gripped` |
| `Pick1.xPos` | sensor | REAL | `Assembler.XPos` |
| `Pick1.yPos` | sensor | REAL | `Assembler.YPos` |
| `Pick1.grip` | command | BOOL | `Assembler.Grip` |
| `LidBelt.run` | command | BOOL | `Assembler.RunLid` |
| `BaseBelt.run` | command | BOOL | `Assembler.RunBase` |
| `ExitBelt.run` | command | BOOL | `Assembler.RunExit` |
| `LidBlade.extend` | command | BOOL | `Assembler.HoldLid` |
| `BaseBlade.extend` | command | BOOL | `Assembler.HoldBase` |
| `LidEmitter.emit` | command | BOOL | `Assembler.EmitLid` |
| `BaseEmitter.emit` | command | BOOL | `Assembler.EmitBase` |
| `StackLight1.green` | command | BOOL | `Assembler.Green` |
| `StackLight1.amber` | command | BOOL | `Assembler.Amber` |
| `Pick1.xSet` | command | REAL | `Assembler.XSet` |
| `Pick1.ySet` | command | REAL | `Assembler.YSet` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 40 s
- Shortest pulse (`shortestPulseMs`): 400 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `Assembler.Grip = false`, `Assembler.Green = false` |
| from 0 ms, within 40000 ms | `fact:itemsAssembled = true` |
| from 0 ms, within 40000 ms | `fact:delivered:Remover1 = true` |
| always | `fact:itemsDropped = false`, `fact:drops:Pick1 = false` |
| at 40000 ms | `Assembler.Green = true`, `Assembler.Grip = false` |

## Lessons that use this scene

- [The same with numeric positions](../../learn/lessons/plant-assembler-numeric.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/two-axis-assembly-numeric <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
