---
title: 'Stations: lifts, crates, cranes and machining'
sidebar_label: 'Stations'
description: 'How the crate, the lift, the stacker crane with its rack and the machining centre work in the plant: levels, the transfer sequences, the interlocks, the facts and the faults.'
tags: [plant, reference]
---

# Stations: lifts, crates, cranes and machining

These parts move items between levels, store them in a rack and transform them. The [parts reference](./parts.md) lists every setting, signal and fault action; this page explains the rules that connect them. The sizes and thresholds below are the values of this release, not physical truths.

## The crate

A `crate` is an open box, 0.8 by 0.6 m and 0.25 m high, of 4 kg: a floor and four 0.02 m walls in one rigid body. Its position is the centre of its bottom face. A crate can be placed in the scene or emitted: an emitter of crates ignores `vary`, `height` and `mass`.

- **Stacking.** A second crate rests on the rims of the first and stays there.
- **Catching.** Items dropped into a crate stay inside it. A crate rides a belt like any item.
- **What counts as loaded.** The fact `loaded:crate:N` counts the items other than crates that are at rest with their centre inside the interior of crate number N (inside the walls, above the floor and below the rim). N counts the crates in the order of the scene, from 0. The interior is read as a box aligned with the axes, so the fact is exact for a crate squared to them.

## The lift

A `lift` is a platform with a belt surface that travels vertically between 2 to 4 `levels`.

| Rule             | Value                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Level convention | The part position is the centre of the top surface at **level 1**, the lowest. Level K is (K - 1) times `levelPitchM` above it. |
| Commands         | `up` moves it up and `down` moves it down at `travelSpeedMps`, with `accelMps2`. Both or neither hold it. It stops at the ends. |
| Surface          | `run` carries items along the platform's own +x at `speedMps`. `runReverse` exists only when `allowReverse` is TRUE.            |
| Sensors          | `atLevelK` is TRUE within 0.01 m of level K once the platform moves at 0.02 m/s or less. There is one per level.                |
| Landings         | `in1` to `inN` and `out1` to `outN`, one pair per level, at the height of that level.                                           |

The defaults are 2 levels 0.6 m apart, a travel speed of 0.4 m/s and a surface speed of 0.5 m/s. `lengthM` and `widthM` size the platform.

- **Do not confuse it with the chain transfer.** Its `lift` signal raises a short module. Here the commands are `up` and `down`.
- **Known limit.** The plant inhibits nothing. A platform that travels while its surface runs may lose its load, so stop the surface before you move and start it once an `atLevelK` is TRUE.

The fact `axis:Name:y` is the height of the platform above level 1, in metres.

## The stacker crane

A `stacker-crane` stores boxes in a rack and takes them out again.

### The four axes

| Axis  | Moves            | Command                      | Sensor                                    |
| ----- | ---------------- | ---------------------------- | ----------------------------------------- |
| X     | along the aisle  | `bay` (INT, 0 to `columns`)  | `inPosition`                              |
| Y     | the mast         | `level` (INT, 0 to `levels`) | `inPosition`                              |
| Fork  | across the aisle | `forkLeft`, `forkRight`      | `forkCentre`, `forkAtLeft`, `forkAtRight` |
| Raise | the fork, 0.06 m | `raise`                      | `raised`                                  |

`bay` sends X to bay times `bayPitchM` and `level` sends Y to level times `levelPitchM`. `inPosition` is TRUE when both are within 5 mm and at rest.

- **Range.** A `bay` or a `level` is an address, not a quantity. When a person or the API applies one outside its range, it is refused with a message that names the signal, the value and the limit, and nothing changes. A value from the program is clamped to the range by the exchange. A REAL command still saturates at its range. A value that is not a finite number is refused.
- **The fork.** `forkLeft` extends it towards -z and `forkRight` towards +z. Holding the command extends it, releasing it centres it, and both hold it. The fork surface is a belt: `beltRight` runs it towards +z and `beltLeft` towards -z. Both do nothing.
- **The dock and the rack.** Level 0 is the dock: the rack shelves are levels 1 and up. The dock belts go with their top 0.13 m over the part position, ending at the fork tip (snap points `dockIn` at -z and `dockOut` at +z). The rack is on the +z side. Column c and level l are a pair of rails 0.24 m apart, with their tops at l times `levelPitchM` plus 0.1 m over the part position. A box 0.3 m wide and 0.4 m long rests on both rails and the 0.16 m wide fork passes between them.
- **Loaded.** `loaded` is TRUE while a box rests on the centre of the fork.

### Storing and retrieving

The transfer is a sequence of commands. The crane does not do it for you.

| Transfer     | Sequence                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| **Store**    | Raise the fork loaded, extend it to the right, lower it, then retract it. |
| **Retrieve** | Extend it lowered, raise it, then retract it.                             |

A cell counts as stored when a box rests at rest on both rails of that cell. A box on the raised fork sits 0.03 m over the rails, so it is not stored until you lower the fork.

### The inhibition and `blocked`

X and Y hold while the fork is out of the centre, and also while the load on the fork is above `maxLoadKg` (10 kg by default). A change of `bay` or `level` that the crane refuses for either reason is counted once, on its rising edge, in the fact `blocked:Name`. A second setpoint that arrives while the request is still refused is the same request. When the fork is centred again, the held setpoints are honoured.

The crane does not inhibit the fork: `forkLeft` and `forkRight` move it also while X and Y are not in position. A program is responsible for waiting for `inPosition` before it extends the fork. The plant does not model a collision of the fork with the rack.

### Facts

| Fact                      | Meaning                                                |
| ------------------------- | ------------------------------------------------------ |
| `stored:Name`             | The number of cells with a box at rest.                |
| `cell:Name:C:L`           | TRUE for each occupied cell (column C, level L).       |
| `blocked:Name`            | The number of refused requests.                        |
| `axis:Name:x`, `:y`, `:z` | The positions in metres. Z is signed, 0 at the centre. |

Known limits: one rack, on one side, one box deep. The crane starts at bay 0, level 0, with the fork lowered and centred.

## The machining centre

A `machining-centre` turns a workpiece into a lid or a base. Its position is the centre of the top surface of its integrated belt.

1. **Feed.** The belt runs along +x while `feed` is TRUE and the cycle is not running. The chamber is `lengthM` by `widthM`, with a door at each end that rises in 0.4 s.
2. **Ready.** `ready` is TRUE when exactly one blank lies at rest in the chamber and nothing else does. A blank is a workpiece: an item with a colour and no tag. Boxes, lids and bases are not blanks. Stop the belt first, so the blank comes to rest.
3. **Start.** A rising edge of `start` while `ready` closes the doors and starts a cycle of `cycleMs` (4000 ms by default). The belt holds and `busy` is TRUE. `doorClosed` is TRUE once the doors are up.
4. **Done.** At the end of the cycle the blank is removed and one product appears in its place at the chamber centre in the same step: a lid or a base, as `product` says, of 1 kg. The doors lower and `done` is TRUE until the product leaves the chamber or the next `start`.

### The swap is a model event

The change of the blank into the product is a **model event**, not physics: it changes what the item is, not where it is, as the level of a tank is a model. Everything else is carried, blocked and pushed by the physics. The blank leaves and the product appears in the same step, never one without the other.

### Misfires

A `start` edge while the part is not ready, or while its door is stuck, does nothing except add one to the fact `misfires:Name`. The fact `produced:Name` counts the finished cycles.

## Completion parts

Three small parts complete the catalogue.

| Part           | What it does                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `limit-switch` | A lever `reachM` long along +x, 0.1 m across and `heightM` tall. `contact` is TRUE while the centre of an item or pallet is inside it. The fact `count:Name` counts each rise. It does not stop the item.          |
| `aligner`      | Two guides at the sides of a belt. `align` TRUE closes them from `widthM` to `gapM` in 0.4 s and releasing it opens them. `aligned` and `open` report the limits. A `gapM` wider than `widthM` closes to `widthM`. |
| `chute`        | A fixed plate tilted `tiltDeg` (5 to 35) that descends along +x, from the `in` landing at the high end to the `out` landing at the low end. It has no signals and no faults.                                       |

**The chute needs a tilt.** The plate has a friction of 0.2 and a box has 0.6. The combined friction is the square root of 0.6 times 0.2, about 0.346, so a box slides only when the tangent of the tilt is above it: 20 degrees (tangent 0.364) or more. The default tilt is 20 degrees; below it a box stays on the plate. The plate has no sides, and nothing slows the item.

## Faults and what they teach

| Part             | Fault                 | What it does                           | What it teaches                                |
| ---------------- | --------------------- | -------------------------------------- | ---------------------------------------------- |
| Lift             | `stuck`               | The platform stops where it is         | Use the level signals, not time                |
| Lift             | `stall`               | The surface stops                      | Detect an item that does not arrive            |
| Lift             | `levelStuckOff`       | Every `atLevelK` reads FALSE           | A sensor can fail while the part is in place   |
| Stacker crane    | `stuckX`, `stuckY`    | That axis stops where it is            | Compare `inPosition` with what was commanded   |
| Stacker crane    | `forkStuck`           | The fork stops where it is             | Use the fork limits, not time                  |
| Stacker crane    | `loadedStuckOff`      | `loaded` reads FALSE                   | Confirm a load with the fork and the belt      |
| Stacker crane    | `beltStall`           | The fork belt stops                    | Detect a box that does not move                |
| Machining centre | `doorStuck`           | The doors hold; a `start` is a misfire | Do not wait for `doorClosed` for ever          |
| Machining centre | `cycleSlow`           | The cycle lasts twice `cycleMs`        | A slow cycle needs a time limit                |
| Machining centre | `readyStuckOff`       | `ready` reads FALSE                    | A step that waits for one sensor needs a limit |
| Machining centre | `stall`               | The belt stops                         | Detect a blank that does not arrive            |
| Limit switch     | `stuckOn`, `stuckOff` | `contact` stays TRUE or FALSE          | Check a reading against another signal         |
| Aligner          | `stuck`               | The guides hold where they are         | Use `aligned`, not time                        |

A fault never changes what the 3D view draws of a physical part: a lift with `levelStuckOff` stays drawn where it is. An action that the part does not have is refused with a located message. The chute has none.

## Limits of this model

- The lift and the crane do not model the collision of the platform or the fork with the frame or the rack.
- The swap of the machining centre is a model event, and it handles one blank at a time.
- The rack of the crane is one rack, on one side, one box deep.
- The interior of a crate is read as a box aligned with the axes.
- The plant is a model. A result here does not say how a real lift, crane or machining centre behaves.

## What is measured

The plant core is deterministic and its trace is pinned on Linux; macOS and Windows are not yet measured. Frame rate, link latency and cost per cycle are not yet measured on the reference machines, so this page gives no figure for them.
