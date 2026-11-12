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

## Sources

### Item emitter

`emitter`

Emits one item on each rising edge of its signal, and by itself every intervalMs when that is above zero (random mode, seeded).

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `kind` | enum | `box`, `pallet` | `box` |   |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |
| `intervalMs` | number | 0 to 600000 | `0` | ms |
| `maxItems` | number | 1 to 1000 | `10` |   |

#### Signals

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `emit` | command | BOOL |   |

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

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `run` | command | BOOL |   |

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

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `run` | command | BOOL |   |

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

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `run` | command | BOOL |   |

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

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `extend` | command | BOOL |   |
| `extended` | sensor | BOOL |   |
| `retracted` | sensor | BOOL |   |

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

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |

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

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |

#### Fault actions

`stuckOn`, `stuckOff`

## Panel

### Push button

`push-button`

A button a person presses in the 3D view or by script. Signal: pressed.

#### Settings

None.

#### Signals

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `pressed` | sensor | BOOL |   |

#### Fault actions

None.

### Indicator light

`indicator-light`

A light the program switches on. Signal: lit.

#### Settings

None.

#### Signals

| Signal | Direction | Type | Unit |
| --- | --- | --- | --- |
| `lit` | command | BOOL |   |

#### Fault actions

None.

{/* <<< END GENERATED: plant/parts <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
