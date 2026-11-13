---
title: 'Sorting sensors and diverting parts'
sidebar_label: 'Sorting and diverting'
description: 'How the plant tells items apart and sends them to different places: item properties, classes and thresholds, the sorting sensors, the diverting parts and the grading of a remover.'
tags: [plant, reference]
---

# Sorting sensors and diverting parts

A sorting scene gives your program items that differ, sensors that tell them apart and parts that send each one to a destination. The [parts reference](./parts.md) lists every setting, signal and fault action; this page explains the rules that connect them. The thresholds below are the values of this release, not physical truths.

## Item properties

An item carries properties that sensors read. A box has a height, a mass and an optional code. A `workpiece` is a 0.2 by 0.2 m block, 0.1 m high, of 0.5 kg by default.

| Property | Values                  | Item                   | Read by                                                  |
| -------- | ----------------------- | ---------------------- | -------------------------------------------------------- |
| Colour   | red, blue               | workpiece              | the colour sensor (`match`), the remover (`red`, `blue`) |
| Material | plastic, metal          | workpiece              | the inductive sensor, the remover (`metal`, `plastic`)   |
| Code     | 0 to 9 (0 means none)   | workpiece, box         | the vision sensor, the remover (`code`)                  |
| Height   | 0.2, 0.3 or 0.4 m (box) | box                    | the light array, the remover (`short`, `medium`, `tall`) |
| Mass     | 2 or 5 kg (box)         | box, workpiece, pallet | the scale, the remover (`light`, `heavy`)                |

The emitter sets the properties. Its `vary` setting draws one seeded number per item: `colour` (workpiece), `weight` (box, 2 or 5 kg) or `code` (workpiece or box, from 1 to `codes`). A `vary` that does not apply to the kind has no effect. Because the draw is seeded, the same scene gives the same sequence of items.

## Classes and thresholds

A remover with `accepts` other than `any` grades what it receives.

| Class              | An item belongs when                    |
| ------------------ | --------------------------------------- |
| `short`            | height is 0.25 m or less                |
| `medium`           | height is above 0.25 m and up to 0.35 m |
| `tall`             | height is above 0.35 m                  |
| `light`            | mass is 3.5 kg or less                  |
| `heavy`            | mass is above 3.5 kg                    |
| `red`, `blue`      | its colour is that colour               |
| `metal`, `plastic` | its material is that material           |
| `code`             | its code equals `acceptsCode`           |

The height edges sit 50 mm from the three box heights, and the weight edge sits between the two box masses. A pallet matches no class, only `any`.

### Sorted and misrouted

A remover removes every item whose centre enters its volume and counts it as `delivered`. With `accepts` other than `any` it also publishes two facts: `sorted` for the items that match and `misrouted` for the items that do not. `sorted` plus `misrouted` always equals `delivered`. A scenario asserts on them like any other fact.

## Sorting sensors

Every beam sensor casts a beam along its own +x at `heightM` above the part, for `rangeM`. The 3D view draws the beam to its real range.

| Sensor         | Signals           | Rule                                                                                    |
| -------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Diffuse, retro | `detect`          | Any body that breaks the beam.                                                          |
| Inductive      | `detect`          | Metal items only. Plastic items, boxes and pallets pass unseen.                         |
| Capacitive     | `detect`          | Any item or pallet, metal or not. The floor and belts never count.                      |
| Colour         | `detect`, `match` | `detect` for any item. `match` when the item has the colour set in `target` (teach-in). |

An item without a colour never matches the colour sensor.

### Numeric sensors

Three sensors give a number instead of a switch. They are [numeric signals](./numeric-signals.md) and follow its scaling.

- **Light array.** A row of `beams` beams across the line, one every `pitchM`, the first at half a pitch above the part. `height` (`REAL`, metres) is the top edge of the highest item that breaks a beam, **in steps of `pitchM`**: at the default 0.05 m the three boxes read 0.20, 0.30 and 0.40. It reads 0 when no beam is broken.
- **Scale.** It adds the masses of the items whose centre is inside its weighing volume. `weight` (`REAL`, kg) is that sum rounded to 0.01 kg **only while the load is at rest**, and 0 otherwise. `stable` is TRUE once an item has been at rest (at most 0.05 m/s) for `settleMs`. A load above `rangeKg` reads `rangeKg`. The scale is static: it does not read contact force.
- **Vision sensor.** `code` (`INT`, 0 to 9) is the code of the item nearest to the centre of its field, and 0 when the field is empty or the item has no code. It reads a code, not an image.

## Diverting parts

Four parts send an item sideways or onto another line. In all of them **right is +z** in the part's own frame.

| Part             | Commands                               | Limits and sensors              | Rule                                                                             |
| ---------------- | -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `pusher`         | `extend`                               | `extended`, `retracted`         | A plate that moves `strokeM` along +z while `extend` is TRUE and back otherwise. |
| `diverter-arm`   | `divert`                               | `diverted`, `home`              | A hinged plate that swings `angleDeg` towards +z while `divert` is TRUE.         |
| `chain-transfer` | `lift`, `run`, `moveRight`, `moveLeft` | `raised`, `lowered`             | Lowered it is a belt. Raised, it moves items sideways.                           |
| `turntable`      | `run`, `toLeft`, `toRight`             | `atCentre`, `atLeft`, `atRight` | It turns to left, centre or right and carries items along its own +x.            |

- **Stop, then turn.** The surface of a chain transfer and of a turntable stops before it changes direction (a chain transfer's sideways move) or turns (a turntable). It starts again once it has arrived, so `run` can stay TRUE. Commands in conflict do nothing.
- **Diverter arm angle.** `angleDeg` runs from 15 to 35 degrees, because a steeper arm stops boxes against it. The default arm, 0.8 m at 35 degrees, reaches about 0.46 m across, so a scene that needs a side belt sets a longer arm.
- **Angular rate.** The arm and the turntable ramp their angular rate, so they never start with a jump.

## Faults and what they teach

| Part                 | Fault                       | What it does                           | What it teaches                           |
| -------------------- | --------------------------- | -------------------------------------- | ----------------------------------------- |
| Beam sensors         | `stuckOn`, `stuckOff`       | `detect` stays TRUE or FALSE           | Check a reading against another signal    |
| Colour sensor        | `wrongColour`               | Inverts `match`                        | A sensor can be taught the wrong colour   |
| Light array, scale   | `readingStuck`              | The reading holds                      | A frozen value looks valid                |
| Light array, scale   | `readingOffset`             | Adds one pitch (array) or 2 kg (scale) | A constant error shifts every decision    |
| Vision sensor        | `blind`, `misread`          | Reads 0, or another code               | Do not trust one reading to route an item |
| Pusher, diverter arm | `stuck`                     | The plate stops where it is            | Use the limit signals, not time           |
| Chain transfer       | `liftStuck`, `stall`, `jam` | The lift or the surface stops          | Detect a part that does not arrive        |
| Turntable            | `turnStuck`, `stall`, `jam` | The turn or the surface stops          | Detect a part that does not arrive        |

An empty scale that is not stable, with `readingOffset` on, reads 2 kg: the offset is added to the 0 of an unstable scale.

## Limits of this model

- The scale is static and reads no contact force.
- Angles use a table with a resolution of 0.25 degrees.
- The plates of the diverters are the only bodies of those parts.
- The plant is a model. A result here does not say how a real sorting machine behaves.

## What is measured

The plant core is deterministic and its trace is pinned on Linux; macOS and Windows are not yet measured. Frame rate, link latency and cost per cycle are not yet measured on the reference machines, so this page gives no figure for them.
