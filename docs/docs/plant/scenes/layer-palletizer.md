---
title: 'Layer palletizer'
sidebar_label: 'Layer palletizer'
description: 'The scene layer-palletizer: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Layer palletizer

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/layer-palletizer. Do not edit. >>> */}

Form layers of four boxes with a layer palletizer and stack three layers on a pallet. The pusher squares each layer against the plates before the clamp lifts it. The head starts at its lowest position, so the program raises it before boxes arrive.

## What it teaches

A station sequence made of several machine steps, counted by layer and by pallet.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 1 |
| Item emitter | 2 |
| Diffuse optical sensor | 1 |
| Layer palletizer | 1 |
| Pallet | 1 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `LayerPalletizer.Start` |
| `EyeIn.detect` | sensor | BOOL | `LayerPalletizer.Eye` |
| `Palletizer1.xAtMin` | sensor | BOOL | `LayerPalletizer.XMin` |
| `Palletizer1.xAtMax` | sensor | BOOL | `LayerPalletizer.XMax` |
| `Palletizer1.yAtMin` | sensor | BOOL | `LayerPalletizer.YMin` |
| `Palletizer1.yAtMax` | sensor | BOOL | `LayerPalletizer.YMax` |
| `Palletizer1.squared` | sensor | BOOL | `LayerPalletizer.Squared` |
| `Palletizer1.layerReady` | sensor | BOOL | `LayerPalletizer.LayerReady` |
| `Palletizer1.gripped` | sensor | BOOL | `LayerPalletizer.Gripped` |
| `Infeed.run` | command | BOOL | `LayerPalletizer.Run` |
| `Emitter1.emit` | command | BOOL | `LayerPalletizer.Emit1` |
| `Emitter2.emit` | command | BOOL | `LayerPalletizer.Emit2` |
| `Palletizer1.xPlus` | command | BOOL | `LayerPalletizer.XPlus` |
| `Palletizer1.xMinus` | command | BOOL | `LayerPalletizer.XMinus` |
| `Palletizer1.yPlus` | command | BOOL | `LayerPalletizer.YPlus` |
| `Palletizer1.yMinus` | command | BOOL | `LayerPalletizer.YMinus` |
| `Palletizer1.square` | command | BOOL | `LayerPalletizer.Square` |
| `Palletizer1.grip` | command | BOOL | `LayerPalletizer.Grip` |
| `StackLight1.amber` | command | BOOL | `LayerPalletizer.Amber` |
| `StackLight1.green` | command | BOOL | `LayerPalletizer.Green` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 60 s
- Shortest pulse (`shortestPulseMs`): 20 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `LayerPalletizer.Green = false`, `LayerPalletizer.Amber = false`, `LayerPalletizer.Grip = false`, `LayerPalletizer.Run = false` |
| at 1000 ms | `LayerPalletizer.Amber = true`, `LayerPalletizer.Green = false` |
| from 0 ms, within 60000 ms | `fact:placed:Palletizer1 = true`, `fact:stacked:pallet:0 = true`, `fact:layers:pallet:0 = true` |
| always | `fact:itemsDropped = false`, `fact:drops:Palletizer1 = false` |
| at 60000 ms | `LayerPalletizer.Green = true`, `LayerPalletizer.Grip = false`, `LayerPalletizer.Run = false`, `LayerPalletizer.XPlus = false`, `LayerPalletizer.XMinus = false`, `LayerPalletizer.YPlus = false`, `LayerPalletizer.YMinus = false`, `LayerPalletizer.Square = false` |

## Lessons that use this scene

- [Palletize in layers](../../learn/lessons/plant-layer-palletizer.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/layer-palletizer <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
