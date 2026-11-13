---
title: 'Colour separation'
sidebar_label: 'Colour separation'
description: 'The scene colour-separation: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Colour separation

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/colour-separation. Do not edit. >>> */}

Sort red and blue workpieces with a colour sensor. Each workpiece waits at a stop blade while the colour sensor reads it; a pusher sends red ones to a side belt and blue ones go straight on.

## What it teaches

Deciding from a sensor reading while the item is held, then acting once.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 3 |
| Item emitter | 1 |
| Stop blade | 1 |
| Diffuse optical sensor | 1 |
| Colour sensor | 1 |
| Pusher | 1 |
| Item remover | 2 |
| Push button | 1 |
| Stack light | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `ColourSeparation.Start` |
| `EyeStop.detect` | sensor | BOOL | `ColourSeparation.Waiting` |
| `Colour1.match` | sensor | BOOL | `ColourSeparation.IsRed` |
| `Pusher1.extended` | sensor | BOOL | `ColourSeparation.Extended` |
| `Pusher1.retracted` | sensor | BOOL | `ColourSeparation.Retracted` |
| `Infeed.run` | command | BOOL | `ColourSeparation.RunIn` |
| `Outfeed.run` | command | BOOL | `ColourSeparation.RunOut` |
| `SideBelt.run` | command | BOOL | `ColourSeparation.RunSide` |
| `Stop1.extend` | command | BOOL | `ColourSeparation.Hold` |
| `Pusher1.extend` | command | BOOL | `ColourSeparation.Push` |
| `Beacon.amber` | command | BOOL | `ColourSeparation.Busy` |
| `Beacon.green` | command | BOOL | `ColourSeparation.Done` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 50 s
- Shortest pulse (`shortestPulseMs`): 40 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `ColourSeparation.Hold = false`, `ColourSeparation.Push = false`, `ColourSeparation.Done = false` |
| at 1500 ms | `ColourSeparation.Hold = true`, `ColourSeparation.Busy = true`, `ColourSeparation.Done = false` |
| from 0 ms, within 50000 ms | `fact:sorted:RedBin = true`, `fact:sorted:BlueBin = true` |
| at 50000 ms | `ColourSeparation.Done = true`, `ColourSeparation.Push = false` |
| always | `fact:misrouted:RedBin = false`, `fact:misrouted:BlueBin = false`, `fact:itemsDropped = false` |

## Lessons that use this scene

- [Send each colour to its belt](../../learn/lessons/plant-colour-separation.md)
- [The same sorting in Instruction List](../../learn/lessons/plant-colour-separation-il.md)
- [Send each colour to its belt in Ladder](../../learn/lessons/plant-colour-separation-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/colour-separation <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
