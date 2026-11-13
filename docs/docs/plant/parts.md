---
title: "Plant parts reference"
sidebar_label: "Parts reference"
description: "Every part of the plant catalogue with its settings, signals and fault actions, generated from the part definitions."
tags: [reference, generated]
---

# Plant parts reference

{/* >>> GENERATED (tools/docs/plant-parts-reference.ts): plant/parts. Do not edit. >>> */}

Every part of the plant catalogue, with its settings, signals and fault actions. A signal name on a plant is the name given to the part, a dot and the signal listed here.

## Items

### Box

`box`

A 0.4 by 0.3 m box with a chosen height and mass. Its position is the centre of its bottom face.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |

#### Signals

None.

#### Fault actions

None.

### Pallet

`pallet`

A 1.2 by 0.8 m pallet, 0.144 m high, 25 kg. Its position is the centre of its bottom face.

#### Settings

None.

#### Signals

None.

#### Fault actions

None.

### Lid

`lid`

A 0.4 by 0.3 m lid, 0.04 m high, with a chosen mass. It rests on a base. Its position is the centre of its bottom face.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `mass` | number | 0.1 to 50 | `1` | kg |

#### Signals

None.

#### Fault actions

None.

### Base

`base`

A 0.4 by 0.3 m base, 0.15 m high, with a chosen mass. A lid rests on it. Its position is the centre of its bottom face.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `mass` | number | 0.1 to 50 | `1` | kg |

#### Signals

None.

#### Fault actions

None.

## Sources

### Item emitter

`emitter`

Emits one item on each rising edge of its signal, and by itself every intervalMs when that is above zero (random mode, seeded). Kinds: box, pallet, lid, base; a lid or base takes its mass from the mass setting and ignores height.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `kind` | enum | `box`, `pallet`, `lid`, `base` | `box` |   |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |
| `intervalMs` | number | 0 to 600000 | `0` | ms |
| `maxItems` | number | 1 to 1000 | `10` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `emit` | command | BOOL |   |   |

#### Fault actions

None.

### Item remover

`remover`

A volume that removes every item whose centre enters it and counts them as delivered.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `width` | number | 0.2 to 2 | `0.6` | m |
| `depth` | number | 0.2 to 2 | `0.6` | m |
| `height` | number | 0.2 to 2 | `0.6` | m |

#### Signals

None.

#### Fault actions

None.

## Conveyors

### Belt conveyor

`belt`

A belt conveyor. Its position is the centre of the top surface; it runs along +x. Signals: run, runReverse.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `length` | number | 0.5 to 8 | `2` | m |
| `width` | number | 0.4 to 0.8 | `0.6` | m |
| `speedMps` | number | 0.1 to 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 to 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |

#### Fault actions

`stall`, `jam`

### Roller conveyor

`roller`

A roller conveyor. It moves items like a belt; the rollers are decoration. Signals: run, runReverse.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `length` | number | 0.5 to 8 | `2` | m |
| `width` | number | 0.4 to 0.8 | `0.6` | m |
| `speedMps` | number | 0.1 to 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 to 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |

#### Fault actions

`stall`, `jam`

### Curved conveyor

`curved`

A quarter-turn conveyor with the given centreline radius. Items travel at the catalogue speed along the centreline.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `radius` | number | 0.5 to 3 | `1` | m |
| `hand` | enum | `right`, `left` | `right` |   |
| `width` | number | 0.4 to 0.8 | `0.6` | m |
| `speedMps` | number | 0.1 to 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 to 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |

#### Fault actions

`stall`, `jam`

## Flow

### Stop blade

`stop-blade`

A plate across a belt at the part position (the centre of the belt surface). It takes 0.4 s to travel; extended and retracted report the limits. Signals: extend, extended, retracted. Fault: stuck.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `widthM` | number | 0.2 to 1 | `0.6` | m |
| `heightM` | number | 0.1 to 0.6 | `0.3` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `extend` | command | BOOL |   |   |
| `extended` | sensor | BOOL |   |   |
| `retracted` | sensor | BOOL |   |   |

#### Fault actions

`stuck`

## Sensors

### Diffuse optical sensor

`sensor-diffuse`

Detects any item that enters its beam. The beam starts at the part position, runs along +x for rangeM and sits heightM above it. Signal: detect. Faults: stuckOn, stuckOff.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 to 2 | `0.5` | m |
| `heightM` | number | 0 to 2 | `0.1` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Fault actions

`stuckOn`, `stuckOff`

### Retro-reflective optical sensor

`sensor-retro`

A beam to a reflector rangeM away; detects an item that breaks the beam. Signal: detect. Faults: stuckOn, stuckOff.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 to 2 | `1.5` | m |
| `heightM` | number | 0 to 2 | `0.1` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Fault actions

`stuckOn`, `stuckOff`

## Panel

### Push button

`push-button`

A button a person presses in the 3D view or by script. Signal: pressed.

#### Settings

None.

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `pressed` | sensor | BOOL |   |   |

#### Fault actions

None.

### Indicator light

`indicator-light`

A light the program switches on. Signal: lit.

#### Settings

None.

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `lit` | command | BOOL |   |   |

#### Fault actions

None.

### Selector switch

`selector-switch`

A rotary selector with 2 to 4 positions. Output "contacts": one BOOL contact per position (pos0, pos1, ...), only the selected one is TRUE. Output "integer": one INT signal, position, from 0 to positions - 1. Fault action: stuck (operation is ignored).

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `positions` | number | 2 to 4 | `3` |   |
| `output` | enum | `contacts`, `integer` | `contacts` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `pos0` | sensor | BOOL |   |   |
| `pos1` | sensor | BOOL |   |   |
| `pos2` | sensor | BOOL |   |   |

#### Fault actions

`stuck`

#### Variants

| Setting | Value | Signals |
| --- | --- | --- |
| `output` | `integer` | position INT |

### Emergency stop

`emergency-stop`

A latching mushroom button. Signals: pressed (TRUE once pushed, until it is twisted to release) and ok (the normally closed contact: TRUE while released). Fault action: wireBreak (ok reads FALSE as if the wire were cut).

#### Settings

None.

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `pressed` | sensor | BOOL |   |   |
| `ok` | sensor | BOOL |   |   |

#### Fault actions

`wireBreak`

### Potentiometer

`potentiometer`

A knob a person turns between min and max. Signal: value, a REAL in the configured unit, starting at initial. Fault action: stuck (operation is ignored).

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `min` | number | -1000 to 1000 | `0` |   |
| `max` | number | -1000 to 1000 | `100` |   |
| `initial` | number | -1000 to 1000 | `0` |   |
| `unit` | enum | `%`, `m`, `L/s`, `bar`, `V`, `C` | `%` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `value` | sensor | REAL | % | 0 to 100 |

#### Fault actions

`stuck`

### Stack light

`stack-light`

A three-lamp tower the program lights. Signals: red, amber, green, each on its own.

#### Settings

None.

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `red` | command | BOOL |   |   |
| `amber` | command | BOOL |   |   |
| `green` | command | BOOL |   |   |

#### Fault actions

None.

### Numeric display

`numeric-display`

A display that shows a number the program sends, clamped to its range, with its decimals and unit. Signal: value (REAL or INT).

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `type` | enum | `REAL`, `INT` | `REAL` |   |
| `min` | number | -1000 to 1000 | `0` |   |
| `max` | number | -1000 to 1000 | `100` |   |
| `unit` | enum | `%`, `m`, `L/s`, `bar`, `V`, `C` | `%` |   |
| `decimals` | number | 0 to 3 | `1` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `value` | command | REAL | % | 0 to 100 |

#### Fault actions

None.

#### Variants

| Setting | Value | Signals |
| --- | --- | --- |
| `type` | `INT` | value INT |

## Process

### Tank

`tank`

A tank filled through an inlet valve and drained by gravity through an outlet valve. The digital variant has on/off valves (fill, drain) and two level switches (levelLow, levelHigh); the numeric variant has proportional valves (fill, drain, 0 to 100 %) and meters (level in m, flowIn and flowOut in L/s). Facts: level, volume, spilledL, highs, inBand. Faults: inletStuck, outletStuck, levelStuck, leak. It is a numeric model, not a fluid simulation; the equations are listed below.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `numeric` |   |
| `widthM` | number | 0.2 to 2 | `0.4` | m |
| `depthM` | number | 0.2 to 2 | `0.25` | m |
| `heightM` | number | 0.3 to 2 | `1` | m |
| `initialFraction` | number | 0 to 1 | `0` |   |
| `inletMaxLps` | number | 1 to 50 | `20` | L/s |
| `outletCoef` | number | 1 to 50 | `12` | L/s per square root of m |
| `valveTauS` | number | 0 to 5 | `0.5` | s |
| `highFraction` | number | 0.5 to 1 | `0.8` |   |
| `lowFraction` | number | 0 to 0.5 | `0.2` |   |
| `bandLow` | number | 0 to 1 | `0` |   |
| `bandHigh` | number | 0 to 1 | `1` |   |
| `leakLps` | number | 0 to 10 | `1` | L/s |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `fill` | command | REAL | % | 0 to 100 |
| `drain` | command | REAL | % | 0 to 100 |
| `level` | sensor | REAL | m | 0 to 1 |
| `flowIn` | sensor | REAL | L/s | 0 to 20 |
| `flowOut` | sensor | REAL | L/s | 0 to 12 |

#### Fault actions

`inletStuck`, `outletStuck`, `levelStuck`, `leak`

#### Variants

| Setting | Value | Signals |
| --- | --- | --- |
| `variant` | `digital` | fill BOOL, drain BOOL, levelLow BOOL, levelHigh BOOL |

#### Equations

State: level h (m), valve openings uIn and uOut (0 to 1), spilled volume (L). Area A = widthM * depthM (m2); step dt = 0.005 s. Per step, in order: (1) valve target: digital TRUE is 1 and FALSE is 0, numeric is clamp(value, 0, 100) / 100; a stuck valve keeps its opening. (2) First-order valve lag: u = target if valveTauS &lt;= dt, else u = u + (target - u) * dt / valveTauS. (3) Flows in L/s: qIn = inletMaxLps * uIn; gravity discharge (Torricelli) qOut = outletCoef * uOut * sqrt(h); with the leak fault a constant leakLps also leaves. (4) Level: h = h + (qIn - qOut - qLeak) * dt / (1000 * A), never below 0. (5) Overflow: if h > heightM then spilled = spilled + (h - heightM) * 1000 * A and h = heightM. The square root is Newton iteration with + - * / only (40 iterations, seed (1 + h) / 2), so a run is bit for bit repeatable. At full opening a tank empties in finite time 2 * sqrt(h0) * 1000 * A / outletCoef.

{/* <<< END GENERATED: plant/parts <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
