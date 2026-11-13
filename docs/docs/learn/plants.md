---
title: "Lesson plants"
sidebar_label: "Lesson plants"
description: "The simulated plants that lessons connect to your program, generated from the lesson packages."
tags: [learn, generated]
unlisted: true
---

# Lesson plants

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/plants. Do not edit. >>> */}

A plant is a simulated machine that a lesson connects to your program: the lesson maps the signals of the plant to the inputs and outputs of its starter project. This list is generated from the lesson packages.

| Plant | Used by |
| --- | --- |
| `conveyor-v1` | [Conveyor classification and safe jam](./lessons/conveyor-classification-jam.md), [Conveyor sorting as a chart](./lessons/conveyor-sorting-sfc.md) |
| `motor-v1` | [Command, feedback, and speed](./lessons/motor-plant-feedback.md), [Interlocks and permissives: a guard that stops the motor](./lessons/interlock-guard-permissive.md), [Interlocks and permissives in Function Block Diagram: a guard that stops the motor](./lessons/interlock-guard-permissive-fbd.md), [Instruction List: a guard as a permissive on the whole condition](./lessons/interlock-guard-permissive-il.md) |
| `pedestrian-v1` | [Pedestrian crossing and safe states](./lessons/pedestrian-crossing-states.md), [Pedestrian crossing as a chart](./lessons/pedestrian-crossing-sfc.md) |
| `tank-v1` | [Tank level, faults, and reset](./lessons/tank-level-fault-reset.md), [Tank level, faults and reset in Ladder: latches and the order of the rungs](./lessons/tank-level-fault-reset-ladder.md) |

## Scenes

A scene lesson runs your program on a scene of the plant simulation instead of a plant of the list above. Each scene has its own page.

| Scene | Used by |
| --- | --- |
| [Belt to sensor](../plant/scenes/belt-to-sensor.md) | [Move a box to a sensor](./lessons/plant-belt-to-sensor.md), [Build a belt scene from the empty floor](./lessons/plant-build-belt-scene.md), [Move a box to a sensor in Ladder](./lessons/plant-belt-to-sensor-ladder.md), [Build a belt scene from the empty floor](./lessons/plant-build-belt-scene-ladder.md) |
| [Latch between two sensors](../plant/scenes/latch-two-sensors.md) | [From sensor A to sensor B](./lessons/plant-latch-two-sensors.md), [From sensor A to sensor B in Ladder](./lessons/plant-latch-two-sensors-ladder.md) |
| [Timed tank](../plant/scenes/timed-tank.md) | [Fill and drain with timers](./lessons/plant-timed-tank.md), [Fill and drain with timers in Ladder](./lessons/plant-timed-tank-ladder.md) |
| [Counted queue](../plant/scenes/counted-queue.md) | [Load and unload three boxes](./lessons/plant-counted-queue.md), [Load and unload three boxes in Ladder](./lessons/plant-counted-queue-ladder.md) |
| [Two-axis assembly](../plant/scenes/two-axis-assembly.md) | [Assemble lids and bases](./lessons/plant-assembler.md), [Manual and automatic modes](./lessons/plant-manual-auto.md), [Manual and automatic modes](./lessons/plant-manual-auto-ladder.md) |
| [Two-axis assembly, numeric](../plant/scenes/two-axis-assembly-numeric.md) | [The same with numeric positions](./lessons/plant-assembler-numeric.md) |
| [Stacker-crane warehouse](../plant/scenes/stacker-crane-warehouse.md) | [Store and retrieve](./lessons/plant-warehouse.md) |
| [Buffer and release](../plant/scenes/buffer-release.md) | [Accumulate and release](./lessons/plant-buffer-release.md) |
| [Merge two lines](../plant/scenes/merge-lines.md) | [Merge two lines](./lessons/plant-merge-lines.md), [Change a scene: add the second emitter](./lessons/plant-change-scene.md), [Merge two lines in Ladder](./lessons/plant-merge-lines-ladder.md), [Change a scene: add the second emitter](./lessons/plant-change-scene-ladder.md) |
| [Lift with stacking](../plant/scenes/lift-stacking.md) | [Gather items into a crate](./lessons/plant-lift-stacking.md) |
| [Three-level lifts](../plant/scenes/three-level-lifts.md) | [Move boxes between three levels](./lessons/plant-three-level-lifts.md), [Emergency stop and interlocks](./lessons/plant-estop-interlocks.md), [Emergency stop and interlocks in Ladder](./lessons/plant-estop-interlocks-ladder.md) |
| [Tank level control](../plant/scenes/tank-level-control.md) | [Read the level](./lessons/plant-tank-level-scaling.md), [Hold the level with PID](./lessons/plant-tank-pid.md), [The same loop in function blocks](./lessons/plant-tank-pid-fbd.md), [Read the level in Ladder](./lessons/plant-tank-level-scaling-ladder.md) |
| [Layer palletizer](../plant/scenes/layer-palletizer.md) | [Palletize in layers](./lessons/plant-layer-palletizer.md) |
| [Transfer between belts](../plant/scenes/belt-to-belt-transfer.md) | [Pick from one belt, place on another](./lessons/plant-belt-transfer.md), [Pick from one belt, place on another in Ladder](./lessons/plant-belt-transfer-ladder.md) |
| [Three-axis palletizing](../plant/scenes/three-axis-palletizing.md) | [Palletize with a gantry](./lessons/plant-xyz-palletizing.md) |
| [Balanced production line](../plant/scenes/balanced-production-line.md) | [Balance a production line](./lessons/plant-production-line.md) |
| [Colour separation](../plant/scenes/colour-separation.md) | [Send each colour to its belt](./lessons/plant-colour-separation.md), [The same sorting in Instruction List](./lessons/plant-colour-separation-il.md), [Send each colour to its belt in Ladder](./lessons/plant-colour-separation-ladder.md) |
| [Height sorting with turntable](../plant/scenes/height-sorting-turntable.md) | [Sort by height, turntable](./lessons/plant-height-turntable.md) |
| [Height sorting with a chain transfer](../plant/scenes/height-sorting-chain.md) | [Sort by height, chain transfer](./lessons/plant-height-chain.md), [Find the fault](./lessons/plant-fault-actions.md), [Sort by height, chain transfer in Ladder](./lessons/plant-height-chain-ladder.md) |
| [Weight sorting](../plant/scenes/weight-sorting.md) | [Sort by weight](./lessons/plant-weight-sorting.md), [Sort by weight in Ladder](./lessons/plant-weight-sorting-ladder.md) |
| [Vision sorting](../plant/scenes/vision-sorting.md) | [Sort by identity code](./lessons/plant-vision-sorting.md) |

{/* <<< END GENERATED: learn/plants <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
