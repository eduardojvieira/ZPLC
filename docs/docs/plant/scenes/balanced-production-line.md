---
title: 'Balanced production line'
sidebar_label: 'Balanced production line'
description: 'The scene balanced-production-line: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Balanced production line

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/balanced-production-line. Do not edit. >>> */}

Produce equal numbers of lids and bases with two machining centres. Blanks arrive on one belt and a diverter arm sends every second blank to the machine that makes bases; the other machine makes lids and is faster. The finished products leave on two belts.

## What it teaches

One function block used for two machines, and sharing the work of machines with different cycle times by alternating the blanks.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 4 |
| Item emitter | 1 |
| Diffuse optical sensor | 3 |
| Diverter arm | 1 |
| Machining centre | 2 |
| Item remover | 2 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `ProductionLine.Start` |
| `Gate.detect` | sensor | BOOL | `ProductionLine.Gate` |
| `EyeA.detect` | sensor | BOOL | `ProductionLine.EyeA` |
| `EyeB.detect` | sensor | BOOL | `ProductionLine.EyeB` |
| `MachineA.ready` | sensor | BOOL | `ProductionLine.ReadyA` |
| `MachineA.done` | sensor | BOOL | `ProductionLine.DoneA` |
| `MachineB.ready` | sensor | BOOL | `ProductionLine.ReadyB` |
| `MachineB.done` | sensor | BOOL | `ProductionLine.DoneB` |
| `Infeed.run` | command | BOOL | `ProductionLine.RunInfeed` |
| `BranchB.run` | command | BOOL | `ProductionLine.RunBranch` |
| `OutA.run` | command | BOOL | `ProductionLine.RunOutA` |
| `OutB.run` | command | BOOL | `ProductionLine.RunOutB` |
| `Arm1.divert` | command | BOOL | `ProductionLine.Divert` |
| `MachineA.feed` | command | BOOL | `ProductionLine.FeedA` |
| `MachineA.start` | command | BOOL | `ProductionLine.StartA` |
| `MachineB.feed` | command | BOOL | `ProductionLine.FeedB` |
| `MachineB.start` | command | BOOL | `ProductionLine.StartB` |
| `Beacon.green` | command | BOOL | `ProductionLine.Green` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 80 s
- Shortest pulse (`shortestPulseMs`): 400 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| always | `fact:itemsDropped = false`, `fact:misfires:MachineA = false`, `fact:misfires:MachineB = false` |
| from 0 ms, within 80000 ms | `fact:produced:MachineA = true`, `fact:produced:MachineB = true`, `fact:delivered:LidBin = true`, `fact:delivered:BaseBin = true` |
| at 80000 ms | `fact:produced:MachineA = 4`, `fact:produced:MachineB = 4`, `fact:delivered:LidBin = 4`, `fact:delivered:BaseBin = 4` |
| at 80000 ms | `ProductionLine.Green = true` |

## Lessons that use this scene

- [Balance a production line](../../learn/lessons/plant-production-line.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/balanced-production-line <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
