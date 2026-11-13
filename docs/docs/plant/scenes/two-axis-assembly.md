---
title: 'Two-axis assembly'
sidebar_label: 'Two-axis assembly'
description: 'The scene two-axis-assembly: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Two-axis assembly

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/two-axis-assembly. Do not edit. >>> */}

Put a lid on each base with a two-axis pick and place. Lids and bases arrive on two belts and wait at stop blades; the vacuum pad takes a lid and sets it down centred on a base, and the assembled base leaves on the exit belt.

## What it teaches

Sequencing a manipulator that moves to limit switches, and synchronising two incoming flows.

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
| `Pick1.xAtMin` | sensor | BOOL | `Assembler.XAtMin` |
| `Pick1.xAtMax` | sensor | BOOL | `Assembler.XAtMax` |
| `Pick1.yAtMin` | sensor | BOOL | `Assembler.YAtMin` |
| `Pick1.yAtMax` | sensor | BOOL | `Assembler.YAtMax` |
| `Pick1.gripped` | sensor | BOOL | `Assembler.Gripped` |
| `Pick1.xPlus` | command | BOOL | `Assembler.XPlus` |
| `Pick1.xMinus` | command | BOOL | `Assembler.XMinus` |
| `Pick1.yPlus` | command | BOOL | `Assembler.YPlus` |
| `Pick1.yMinus` | command | BOOL | `Assembler.YMinus` |
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

## The scenario

- Scan: 10 ms
- Length of the scenario: 40 s
- Shortest pulse (`shortestPulseMs`): 400 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `Assembler.XPlus = false`, `Assembler.YMinus = false`, `Assembler.Grip = false`, `Assembler.Green = false` |
| from 0 ms, within 40000 ms | `fact:itemsAssembled = true` |
| from 0 ms, within 40000 ms | `fact:delivered:Remover1 = true` |
| always | `fact:itemsDropped = false`, `fact:drops:Pick1 = false` |
| at 40000 ms | `Assembler.Green = true`, `Assembler.XPlus = false`, `Assembler.XMinus = false`, `Assembler.YPlus = false`, `Assembler.YMinus = false`, `Assembler.Grip = false` |

## Lessons that use this scene

- [Assemble lids and bases](../../learn/lessons/plant-assembler.md)
- [Manual and automatic modes](../../learn/lessons/plant-manual-auto.md)
- [Manual and automatic modes](../../learn/lessons/plant-manual-auto-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/two-axis-assembly <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
