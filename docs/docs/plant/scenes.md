---
title: 'The shipped scenes'
sidebar_label: 'The shipped scenes'
description: 'The scenes that ship with ZPLC, what the program has to do in each and what its scenario checks.'
tags: [plant, scenes, generated]
---

# The shipped scenes

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes. Do not edit. >>> */}

These scenes ship with ZPLC, in order of difficulty. Each has a scene file, a plant map, a starter program, a scenario, a reference program that passes the scenario and a text in English and Spanish. The scenario runs on the native runtime and checks program outputs and facts of the plant. A fact name starts with `fact:`, such as `fact:count:EyeFar`. A check on a fact is a yes or no. Each scene has its own page, generated from its files.

| Scene | Length of the scenario | Parts |
| --- | --- | --- |
| [Belt to sensor](./scenes/belt-to-sensor.md) | 8 s | Belt conveyor, Item emitter, Diffuse optical sensor, Push button |
| [Latch between two sensors](./scenes/latch-two-sensors.md) | 8 s | Belt conveyor, Box, Diffuse optical sensor ×2 |
| [Timed tank](./scenes/timed-tank.md) | 25 s | Tank, Push button, Emergency stop, Stack light |
| [Counted queue](./scenes/counted-queue.md) | 20 s | Belt conveyor, Item emitter, Diffuse optical sensor ×2, Item remover, Push button, Indicator light |
| [Two-axis assembly](./scenes/two-axis-assembly.md) | 40 s | Belt conveyor ×3, Item emitter ×2, Stop blade ×2, Diffuse optical sensor ×2, Two-axis pick and place, Item remover, Push button, Stack light |
| [Two-axis assembly, numeric](./scenes/two-axis-assembly-numeric.md) | 40 s | Belt conveyor ×3, Item emitter ×2, Stop blade ×2, Diffuse optical sensor ×2, Two-axis pick and place, Item remover, Push button, Stack light |
| [Stacker-crane warehouse](./scenes/stacker-crane-warehouse.md) | 90 s | Stacker crane, Belt conveyor ×2, Item emitter, Item remover, Diffuse optical sensor, Push button ×4, Stack light |
| [Buffer and release](./scenes/buffer-release.md) | 36 s | Belt conveyor ×2, Item emitter, Stop blade, Diffuse optical sensor ×3, Item remover, Push button ×2, Indicator light ×2 |
| [Merge two lines](./scenes/merge-lines.md) | 25 s | Belt conveyor ×3, Item emitter ×2, Stop blade ×2, Diffuse optical sensor ×3, Item remover, Push button, Indicator light |
| [Lift with stacking](./scenes/lift-stacking.md) | 60 s | Belt conveyor ×3, Item emitter ×2, Lift, Item remover, Diffuse optical sensor ×3, Push button, Stack light |
| [Three-level lifts](./scenes/three-level-lifts.md) | 95 s | Belt conveyor ×3, Item emitter, Lift ×2, Item remover, Diffuse optical sensor ×3, Push button, Emergency stop, Stack light |
| [Tank level control](./scenes/tank-level-control.md) | 90 s | Tank, Potentiometer ×2, Numeric display, Stack light |
| [Layer palletizer](./scenes/layer-palletizer.md) | 60 s | Belt conveyor, Item emitter ×2, Diffuse optical sensor, Layer palletizer, Pallet, Push button, Stack light |
| [Transfer between belts](./scenes/belt-to-belt-transfer.md) | 45 s | Belt conveyor ×2, Item emitter, Stop blade, Diffuse optical sensor ×2, Two-axis pick and place, Item remover, Push button, Stack light |
| [Three-axis palletizing](./scenes/three-axis-palletizing.md) | 50 s | Belt conveyor, Item emitter, Stop blade, Diffuse optical sensor, Three-axis gantry, Pallet, Push button, Stack light |
| [Balanced production line](./scenes/balanced-production-line.md) | 80 s | Belt conveyor ×4, Item emitter, Diffuse optical sensor ×3, Diverter arm, Machining centre ×2, Item remover ×2, Push button, Stack light |
| [Colour separation](./scenes/colour-separation.md) | 50 s | Belt conveyor ×3, Item emitter, Stop blade, Diffuse optical sensor, Colour sensor, Pusher, Item remover ×2, Push button, Stack light |
| [Height sorting with turntable](./scenes/height-sorting-turntable.md) | 77 s | Belt conveyor ×4, Item emitter, Light array, Stop blade, Diffuse optical sensor ×2, Turntable, Item remover ×3, Push button, Stack light |
| [Height sorting with a chain transfer](./scenes/height-sorting-chain.md) | 62 s | Belt conveyor ×4, Item emitter, Chain transfer, Stop blade, Diffuse optical sensor ×3, Item remover ×3, Push button, Stack light |
| [Weight sorting](./scenes/weight-sorting.md) | 85 s | Belt conveyor ×3, Item emitter, Stop blade, Scale, Pusher, Item remover ×2, Push button, Stack light |
| [Vision sorting](./scenes/vision-sorting.md) | 78 s | Belt conveyor ×2, Item emitter, Vision sensor, Diverter arm, Item remover ×2, Push button, Stack light |

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](./clock.md)
- [Scene file format](./scene-format.md)
- [Plant parts reference](./parts.md)

{/* <<< END GENERATED: plant/scenes <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
