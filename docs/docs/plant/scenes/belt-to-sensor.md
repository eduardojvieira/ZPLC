---
title: 'Belt to sensor'
sidebar_label: 'Belt to sensor'
description: 'The scene belt-to-sensor: its goal, parts, signals and what its scenario checks, generated from its files.'
tags: [plant, scenes, generated]
unlisted: true
---

# Belt to sensor

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/belt-to-sensor. Do not edit. >>> */}

Start the belt and send one box. The belt stops when the far sensor sees the box.

## What it teaches

Starting an actuator from a button press, remembering that it runs, and stopping it from a sensor.

## Parts

| Part | Count |
| --- | --- |
| Belt conveyor | 1 |
| Item emitter | 1 |
| Diffuse optical sensor | 1 |
| Push button | 1 |

## Signals

| Signal | Direction | Type | Point |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `BeltToSensor.Start` |
| `EyeFar.detect` | sensor | BOOL | `BeltToSensor.EyeFar` |
| `Belt1.run` | command | BOOL | `BeltToSensor.Run` |
| `Emitter1.emit` | command | BOOL | `BeltToSensor.Emit` |

## The scenario

- Scan: 10 ms
- Length of the scenario: 8 s
- Shortest pulse (`shortestPulseMs`): 800 ms

### What the scenario checks

| When | Condition |
| --- | --- |
| at 100 ms | `BeltToSensor.Run = false` |
| from 0 ms, within 8000 ms | `fact:count:EyeFar = true` |
| at 8000 ms | `BeltToSensor.Run = false` |
| always | `fact:itemsDropped = false` |

## Lessons that use this scene

- [Move a box to a sensor](../../learn/lessons/plant-belt-to-sensor.md)
- [Build a belt scene from the empty floor](../../learn/lessons/plant-build-belt-scene.md)
- [Move a box to a sensor in Ladder](../../learn/lessons/plant-belt-to-sensor-ladder.md)
- [Build a belt scene from the empty floor](../../learn/lessons/plant-build-belt-scene-ladder.md)

## What is not claimed

The scene runs in the headless plant core. This page gives no frame rate and no latency for it: it is not yet measured on the reference machines.

## See also

- [The plant clock](../clock.md)
- [Scene file format](../scene-format.md)
- [Plant parts reference](../parts.md)

{/* <<< END GENERATED: plant/scenes/belt-to-sensor <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
