---
title: 'Manipulators and gripping'
sidebar_label: 'Manipulators and gripping'
description: 'How a pick and place, a gantry and the layer palletizer move and hold items in the plant: axes, digital and numeric variants, the gripping rules, the facts and the faults.'
tags: [plant, reference]
---

# Manipulators and gripping

A manipulator moves a pad along one, two or three axes and holds an item with it. The plant has three of them: the two-axis `pick-place`, the three-axis `gantry` and the `layer-palletizer` station. The [parts reference](./parts.md) lists every setting, signal and fault action; this page explains how they work together.

## Axes

Every manipulator uses the same three letters.

- **X** runs along the part, in the direction the part faces. `rotationYDeg` turns it.
- **Y** is up.
- **Z** runs across the part. Only the gantry has it.

The position of the part is the floor point under the pad when every axis is at 0. The bottom of the pad is at the height of the part plus the Y position. An axis position goes from 0 to its stroke (`strokeXM`, `strokeYM`, `strokeZM`) and never leaves that range.

The pad is the only body of a manipulator: a box of 0.3 by 0.03 by 0.2 m. The frame and the beam that the 3D view draws do not collide with anything. This is a known limit: a pad can cross its own frame without a trace, and an item can pass through where the frame is drawn.

## How an axis moves

An axis has a speed (`speedMps`) and an acceleration (`accelMps2`). On every plant step of 5 ms its velocity moves toward the target velocity by at most `accelMps2 * 0.005`, and then the position advances by the velocity times the step. At an end of the stroke the position stops and the velocity is 0. An axis that is `stuck` does not move.

The motion is trapezoidal: it speeds up, cruises at `speedMps` and brakes. With a setpoint the axis starts braking when the distance that remains is at most `v * v / (2 * accelMps2)`, tested on the velocity the next step would reach, so the axis does not pass the setpoint by more than 1 mm. Within 0.5 mm of the setpoint it stops exactly on it.

## Digital and numeric variants

The `variant` setting chooses how the program drives the axes.

| Variant | Commands                                  | Sensors                                     |
| ------- | ----------------------------------------- | ------------------------------------------- |
| digital | `xPlus`, `xMinus`, `yPlus`, `yMinus`, ... | `xAtMin`, `xAtMax`, `yAtMin`, `yAtMax`, ... |
| numeric | `xSet`, `ySet`, ... in metres (`REAL`)    | `xPos`, `yPos`, ... in metres (`REAL`)      |

Both variants also have the command `grip` and the sensor `gripped`.

- **Digital.** An axis moves only while its command is held. With `xPlus` and `xMinus` both TRUE it does not move. When the command is released the axis brakes at `accelMps2`, so it travels `v * v / (2 * accelMps2)` more before it stops. `AtMin` is TRUE within 1 mm of position 0 and `AtMax` within 1 mm of the stroke. The program has to find its own stopping point with the sensors of the scene.
- **Numeric.** The axis goes to the setpoint and `Pos` reports where it is. A setpoint outside the stroke is limited to it. A setpoint that is not a finite number is ignored and the previous setpoint stays. The ranges are `0` to the stroke, in `m`, the same as the range the [signal map](./numeric-signals.md) must declare.

### Worked example: a two-axis move

A `pick-place` with the numeric variant and the default strokes (X 1.2 m, Y 0.5 m) takes a 0.3 m box that stands at X 0 and puts it down at X 1. The part stands at the height of the surface under the box.

1. `ySet = 0.3`. The pad bottom goes down to the top of the box.
2. `grip = TRUE`. When `gripped` reads TRUE the box is held.
3. `ySet = 0.5`. The pad lifts the box to the top of the stroke.
4. `xSet = 1`. The pad carries the box along X. `xPos` reads about 1 when it arrives.
5. `ySet = 0.3`. The pad lowers the box until it is close to the surface under it.
6. `grip = FALSE`. The box is put down.

The digital variant makes the same trip by holding `yMinus`, `yPlus` and `xPlus` for the time each move takes; the program decides that time.

## How a grip works

Every step in which `grip` is TRUE and the gripper holds fewer items than it can, it looks for an item to take. The values below are the **current values of this release**. They are starting values of the model, not properties of a real gripper.

An item is taken when all of these hold.

- **It is a plant item**: a box, a pallet, a lid or a base.
- **Its mass is at most `maxLoadKg`.** A heavier item is never taken. The layer palletizer applies the limit to the total of the layer.
- **It is not moving**: its speed relative to the pad is at most 0.05 m/s. A grip on a moving item **misses**. A program that closes the gripper on a box that rides a belt must stop the box first, with a stop blade for example.
- **It is in reach.** A _vacuum_ pad takes an item whose top face is between 0.005 m above and 0.02 m below the bottom of the pad, with the centre of the pad over the footprint of the item. A _clamp_ takes an item whose centre is within 0.05 m of the centre of the pad (or within the pad, if that is wider) and whose top face is 0 to 0.25 m below the pad, once the jaws have closed. The jaws take 0.3 s to close.

When several items are in reach the gripper takes the nearest one in the horizontal plane (items within 1 mm of each other count as equally near), then the highest one, then the one with the lowest identifier. The pick and place and the gantry hold one item. The layer palletizer holds up to `columns * rows` items.

A held item is fixed to the pad and moves with it. `grip = FALSE` releases it with the velocity it has. `gripped` reads TRUE while the gripper holds at least one item.

### Placed and dropped

The facts count each item once.

- **`picked`** counts the items that the gripper took.
- **`placed`** counts a released item that comes to rest (speed at most 0.05 m/s) within 0.01 m of the surface under it, for 100 ms, within 3 s of the release.
- **`drops`** counts the rest: an item released more than 0.05 m above the surface under it, an item that does not settle within 3 s, an item that falls out of the plant, and every item that the fault `dropLoad` drops.

An item that rests on the floor never counts as placed, so a box dropped on the floor is a drop even when it ends up at rest. A drop is never also a place.

## Facts

| Fact                      | Meaning                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `picked:<Name>`           | Items taken by the part `<Name>`.                                                 |
| `placed:<Name>`           | Items it put down and that came to rest.                                          |
| `drops:<Name>`            | Items it dropped.                                                                 |
| `axis:<Name>:x`, `y`, `z` | Position of each axis in metres, rounded to 0.001.                                |
| `itemsAssembled`          | Lids that have rested on a base for 40 plant steps (0.2 s), centred within 0.1 m. |
| `stacked:pallet:<n>`      | Items that rest on the pallet number `<n>`, directly or through other items.      |
| `layers:pallet:<n>`       | Height of the tallest stack on that pallet, in items.                             |

The numbering of pallets follows the order in which the scene creates them, from 0. `stacked`, `layers` and `itemsAssembled` describe the state of the plant, not what the program did: they read the same for a pallet that arrived on a belt as for one that a gripper loaded, they ignore items that are moving, and an item must rest on its supporter within 5 mm to count. Each pallet counts an item only when at least 30 % of the footprint of the item lies over its supporter. A scenario can check any of these with `fact:`.

## The layer palletizer

The `layer-palletizer` has the axes X and Y and a clamp head as wide as its forming zone. The zone measures `columns * 0.4` by `rows * 0.3` m. Boxes arrive from a belt on the infeed side, against two fixed plates; the command `square` extends a pusher (0.4 s) that squares them into a block. `squared` reports the end of the travel.

- `layerReady` is TRUE when exactly `columns * rows` boxes lie at rest in the zone.
- `maxLoadKg` is the limit of the whole layer: the clamp does not close on a layer that weighs more.
- The head starts at its lowest position, with Y at 0, so the program has to raise it before the boxes arrive.
- The pallet goes at the end of the transfer: the centre of the pallet at `strokeXM` along the part.

## Faults

A scenario or a person can trigger these fault actions on a manipulator part. Each one teaches a check that a real program needs.

| Action                       | Effect                                                                 | What it teaches                                                           |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `stuckX`, `stuckY`, `stuckZ` | That axis stops where it is; the others keep working.                  | Compare the position or the limit sensor with what the program commanded. |
| `squareStuck`                | The pusher of the palletizer stays where it is.                        | Do not wait forever for `squared`; give up with an alarm.                 |
| `gripFail`                   | The gripper never takes an item; items it already holds stay.          | A grip is a request: check `gripped` before the lift.                     |
| `dropLoad`                   | The gripper drops everything it holds, and each item counts as a drop. | Watch `gripped` during the carry, not only at the start.                  |
| `grippedStuckOn`             | `gripped` reads TRUE even with nothing held.                           | A sensor can lie: confirm with the position and the count.                |
| `grippedStuckOff`            | `gripped` reads FALSE even while holding.                              | The same, in the other direction.                                         |
| `layerReadyStuckOff`         | `layerReady` reads FALSE with a full layer.                            | A step that waits for one sensor needs a time limit.                      |

An action that a part does not have is refused with a located message.

## Limits of the model

- The pad is the only body. The frame, the beam and the jaws are drawn, not simulated.
- The gripping thresholds are the values of this release and can change.
- Positions are exact to the model, not to a real axis: there is no backlash, vibration or following error.
- The plant repeats exactly: the same scene, program and script give the same trace. This is pinned on Linux; macOS and Windows are not yet measured.
- No frame rate, latency or hardware result is stated for manipulators. They are not yet measured on the reference machines.
- A map for a gantry with numeric signals can exceed the exchange span of 64 bytes. See [Numeric signals](./numeric-signals.md#the-exchange-span).
