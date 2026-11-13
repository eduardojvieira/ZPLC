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

A 0.4 by 0.3 m box with a chosen height and mass, and an optional code 1 to 9 (0 means none). Its position is the centre of its bottom face.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |
| `code` | number | 0 to 9 | `0` |   |

#### Signals

None.

#### Fault actions

None.

### Workpiece

`workpiece`

A 0.2 by 0.2 m block, 0.1 m high, in red or blue, plastic or metal, with an optional code 1 to 9 (0 means none) and a chosen mass. Sensors and removers read its colour, material and code. Its position is the centre of its bottom face.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `colour` | enum | `red`, `blue` | `red` |   |
| `material` | enum | `plastic`, `metal` | `plastic` |   |
| `code` | number | 0 to 9 | `0` |   |
| `mass` | number | 0.1 to 5 | `0.5` | kg |

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

Emits one item on each rising edge of its signal, and by itself every intervalMs when that is above zero (random mode, seeded). Kinds: box, pallet, lid, base, workpiece; a lid or base takes its mass from the mass setting and ignores height; a workpiece takes colour, material and code (0.5 kg). vary draws one seeded number per item: colour (workpiece), weight (box, 2 or 5 kg) or code (workpiece or box, 1 to codes); a vary that does not apply to the kind has no effect.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `kind` | enum | `box`, `pallet`, `lid`, `base`, `workpiece` | `box` |   |
| `vary` | enum | `none`, `colour`, `weight`, `code` | `none` |   |
| `codes` | number | 1 to 9 | `3` |   |
| `colour` | enum | `red`, `blue` | `red` |   |
| `material` | enum | `plastic`, `metal` | `plastic` |   |
| `code` | number | 0 to 9 | `0` |   |
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

A volume that removes every item whose centre enters it and counts them as delivered. When accepts is not any (red, blue, metal, plastic, light up to 3.5 kg, heavy, short up to 0.25 m, medium up to 0.35 m, tall, or code with acceptsCode), it also counts them as sorted when they match and misrouted when they do not; a pallet never matches a class.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `width` | number | 0.2 to 2 | `0.6` | m |
| `depth` | number | 0.2 to 2 | `0.6` | m |
| `height` | number | 0.2 to 2 | `0.6` | m |
| `accepts` | enum | `any`, `red`, `blue`, `metal`, `plastic`, `light`, `heavy`, `short`, `medium`, `tall`, `code` | `any` |   |
| `acceptsCode` | number | 0 to 9 | `0` |   |

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

### Chain transfer

`chain-transfer`

A module in a belt line. Its position is the centre of the top surface when lowered. Lowered, it moves items along +x like a belt (run, runReverse when reverse is allowed). With lift TRUE it rises liftM over liftTravelMs (0.4 s by default); raised, it moves items sideways: moveRight along +z, moveLeft along -z. The surface stops before it changes direction, and commands in conflict (run with lift, moveLeft with moveRight) do nothing. Signals: lift, run, runReverse, moveRight, moveLeft, raised, lowered. Faults: liftStuck, stall, jam.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `lengthM` | number | 0.4 to 2 | `0.8` | m |
| `widthM` | number | 0.4 to 0.8 | `0.6` | m |
| `liftM` | number | 0.02 to 0.2 | `0.05` | m |
| `liftTravelMs` | number | 100 to 2000 | `400` | ms |
| `speedMps` | number | 0.1 to 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 to 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `lift` | command | BOOL |   |   |
| `run` | command | BOOL |   |   |
| `moveRight` | command | BOOL |   |   |
| `moveLeft` | command | BOOL |   |   |
| `raised` | sensor | BOOL |   |   |
| `lowered` | sensor | BOOL |   |   |

#### Fault actions

`liftStuck`, `stall`, `jam`

### Turntable

`turntable`

A square platform whose position is the centre of its top surface. It turns about its vertical axis to three positions: centre, left (towards -z) and right (towards +z, the side of a belt's right edge), and its surface carries items along its own +x. toLeft or toRight chooses the position, neither returns to the centre, both hold the angle. The surface stops before the platform turns and starts again once it has arrived, so run can stay TRUE. Contradictory commands do nothing. Angles use a table in steps of 0.25 degrees. Signals: run, runReverse, toLeft, toRight, atCentre, atLeft, atRight (within 0.5 degrees). Faults: stall, turnStuck, jam.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `sizeM` | number | 0.6 to 1.2 | `0.9` | m |
| `speedMps` | number | 0.1 to 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 to 5 | `1` | m/s2 |
| `angleDeg` | number | 30 to 90 | `90` | deg |
| `degPerS` | number | 30 to 120 | `90` | deg/s |
| `allowReverse` | boolean |   | `false` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |
| `toLeft` | command | BOOL |   |   |
| `toRight` | command | BOOL |   |   |
| `atCentre` | sensor | BOOL |   |   |
| `atLeft` | sensor | BOOL |   |   |
| `atRight` | sensor | BOOL |   |   |

#### Fault actions

`stall`, `turnStuck`, `jam`

## Flow

### Pusher

`pusher`

A plate that pushes items sideways. Its position is the retracted centre of the plate, just above the surface; it moves along its own +z (right) by strokeM at speedMps, with accelMps2, while extend is TRUE and back otherwise. Settings: strokeM, widthM, heightM, speedMps, accelMps2. Signals: extend, extended, retracted (within 1 mm of an end). Fault: stuck freezes the plate.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `strokeM` | number | 0.2 to 1 | `0.6` | m |
| `widthM` | number | 0.2 to 0.8 | `0.4` | m |
| `heightM` | number | 0.1 to 0.4 | `0.25` | m |
| `speedMps` | number | 0.2 to 1.5 | `0.8` | m/s |
| `accelMps2` | number | 1 to 10 | `4` | m/s2 |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `extend` | command | BOOL |   |   |
| `extended` | sensor | BOOL |   |   |
| `retracted` | sensor | BOOL |   |   |

#### Fault actions

`stuck`

### Diverter arm

`diverter-arm`

A plate hinged at the part position that lies along its own +x at rest (home). While divert is TRUE it swings towards its own +z (right) by angleDeg at degPerS, with a short ramp, and back otherwise; a box that travels along +x is deflected to the right. Settings: lengthM, heightM, angleDeg (15 to 35: a steeper arm stops boxes against it), degPerS. The default length 0.8 m at 35 degrees reaches only 0.46 m across, so a scene that needs a side belt sets a longer arm. Signals: divert, diverted, home (within 0.5 degrees of an end). Fault: stuck freezes the arm.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `lengthM` | number | 0.4 to 1.2 | `0.8` | m |
| `heightM` | number | 0.1 to 0.4 | `0.25` | m |
| `angleDeg` | number | 15 to 35 | `35` | deg |
| `degPerS` | number | 30 to 180 | `90` | deg/s |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `divert` | command | BOOL |   |   |
| `diverted` | sensor | BOOL |   |   |
| `home` | sensor | BOOL |   |   |

#### Fault actions

`stuck`

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

### Inductive sensor

`sensor-inductive`

Detects metal items only; plastic items, boxes and pallets pass unseen. The beam starts at the part position, runs along +x for rangeM and sits heightM above it. Signal: detect. Faults: stuckOn, stuckOff.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.02 to 0.3 | `0.1` | m |
| `heightM` | number | 0 to 2 | `0.1` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Fault actions

`stuckOn`, `stuckOff`

### Capacitive sensor

`sensor-capacitive`

Detects any item or pallet, metal or not. The beam starts at the part position, runs along +x for rangeM and sits heightM above it. Signal: detect. Faults: stuckOn, stuckOff.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.02 to 0.5 | `0.15` | m |
| `heightM` | number | 0 to 2 | `0.1` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Fault actions

`stuckOn`, `stuckOff`

### Colour sensor

`sensor-colour`

Teach-in colour sensor: detect is TRUE for any item in its beam, match is TRUE when that item has the colour set in target (red or blue); an item without a colour never matches. The beam runs along +x for rangeM at heightM. Signals: detect, match. Faults: stuckOn, stuckOff, wrongColour (inverts match).

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 to 1 | `0.3` | m |
| `heightM` | number | 0 to 2 | `0.1` | m |
| `target` | enum | `red`, `blue` | `red` |   |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |
| `match` | sensor | BOOL |   |   |

#### Fault actions

`stuckOn`, `stuckOff`, `wrongColour`

### Light array

`light-array`

A row of beams across the line, one every pitchM, the first at half a pitch above the part. Signals: height (REAL, m, 0 to beams * pitchM) is the top edge of the highest tracked item that breaks a beam, in steps of pitchM (0.20, 0.30 and 0.40 for the three boxes at the default 0.05 m; a lid on a base reads the top of the lid), 0 when no beam is broken; detect (BOOL) is TRUE while any beam is broken. Fact: count (rising edges of detect). Faults: readingStuck holds the reading, readingOffset adds one pitch.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `beams` | number | 4 to 32 | `12` |   |
| `pitchM` | number | 0.025 to 0.1 | `0.05` | m |
| `spanM` | number | 0.4 to 1.2 | `0.8` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `height` | sensor | REAL | m | 0 to 0.6 |
| `detect` | sensor | BOOL |   |   |

#### Fault actions

`readingStuck`, `readingOffset`

### Scale

`scale`

A static scale: it adds the masses of the items and pallets whose centre is inside its weighing volume (lengthM along the part, widthM across, heightM up from the part). Signals: weight (REAL, kg, 0 to rangeKg) is that sum, rounded to 0.01 kg, only while stable, else 0 (a heavier load reads rangeKg); stable (BOOL) is TRUE once at least one item has been at rest (at most 0.05 m/s) for settleMs. It does not read contact force. Faults: readingStuck holds the weight, readingOffset adds 2 kg.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `rangeKg` | number | 5 to 200 | `20` | kg |
| `lengthM` | number | 0.3 to 1.5 | `0.6` | m |
| `widthM` | number | 0.3 to 1.2 | `0.6` | m |
| `heightM` | number | 0.2 to 1 | `0.5` | m |
| `settleMs` | number | 0 to 2000 | `300` | ms |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `weight` | sensor | REAL | kg | 0 to 20 |
| `stable` | sensor | BOOL |   |   |

#### Fault actions

`readingStuck`, `readingOffset`

### Vision sensor

`vision-sensor`

Reads the identity of the item in view as a code, not an image. The field is a square fieldM by fieldM centred on the part, from its position up heightM. Signals: code (INT, 0 to 9) is the code of the item whose centre is nearest to the field centre, 0 when the field is empty or the item is unlabelled; detect (BOOL) is TRUE while any item is in the field. Faults: blind reads 0, misread reads another code.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `fieldM` | number | 0.2 to 1 | `0.5` | m |
| `heightM` | number | 0.2 to 1 | `0.5` | m |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `code` | sensor | INT | code | 0 to 9 |
| `detect` | sensor | BOOL |   |   |

#### Fault actions

`blind`, `misread`

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

## Manipulators

### Two-axis pick and place

`pick-place`

A two-axis manipulator with a vacuum or clamp gripper (setting gripper). X runs along the part, Y is up. Its position is the floor point under the pad at axis position 0; the pad bottom is at the part height plus the Y position. Digital variant: hold-to-move commands (xPlus, xMinus, yPlus, yMinus) and limit sensors (xAtMin, xAtMax, yAtMin, yAtMax); both directions together do not move. Numeric variant: setpoints (xSet, ySet) and positions (xPos, yPos) in metres, clamped to the stroke. Both variants have grip (vacuum on or jaws close) and gripped. A grip on a moving item misses, and an item above maxLoadKg is never held. Faults: stuckX, stuckY, gripFail, dropLoad, grippedStuckOn, grippedStuckOff. Facts: picked, placed and drops per part (picked\:Name, placed\:Name, drops\:Name) and the axis positions (axis\:Name\:x, axis\:Name\:y) in metres, rounded to 0.001.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `digital` |   |
| `gripper` | enum | `vacuum`, `clamp` | `vacuum` |   |
| `strokeXM` | number | 0.4 to 3 | `1.2` | m |
| `strokeYM` | number | 0.2 to 1.2 | `0.5` | m |
| `speedMps` | number | 0.1 to 2 | `0.8` | m/s |
| `accelMps2` | number | 0.5 to 10 | `3` | m/s2 |
| `maxLoadKg` | number | 1 to 25 | `5` | kg |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `xPlus` | command | BOOL |   |   |
| `xMinus` | command | BOOL |   |   |
| `yPlus` | command | BOOL |   |   |
| `yMinus` | command | BOOL |   |   |
| `xAtMin` | sensor | BOOL |   |   |
| `xAtMax` | sensor | BOOL |   |   |
| `yAtMin` | sensor | BOOL |   |   |
| `yAtMax` | sensor | BOOL |   |   |
| `grip` | command | BOOL |   |   |
| `gripped` | sensor | BOOL |   |   |

#### Fault actions

`stuckX`, `stuckY`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`

#### Variants

| Setting | Value | Signals |
| --- | --- | --- |
| `variant` | `numeric` | xSet REAL, ySet REAL, xPos REAL, yPos REAL, grip BOOL, gripped BOOL |

#### Equations

Per axis and plant step dt = 0.005 s: the velocity moves toward the target velocity by at most accel * dt, then p = p + v * dt, clamped to 0..stroke (v = 0 at a stop). Jog: target velocity is the held direction times speed. Setpoint: the axis brakes when the remaining distance is at most v * v / (2 * accel), and snaps to the setpoint within 0.5 mm. A stuck axis does not move.

### Three-axis gantry

`gantry`

A three-axis manipulator with a vacuum or clamp gripper (setting gripper). X runs along the part, Y is up, Z runs across it. Its position is the floor point under the pad at axis position 0; the pad bottom is at the part height plus the Y position. Digital variant: hold-to-move commands (xPlus, xMinus, yPlus, yMinus) and limit sensors (xAtMin, xAtMax, yAtMin, yAtMax); both directions together do not move. Numeric variant: setpoints (xSet, ySet) and positions (xPos, yPos) in metres, clamped to the stroke. Both variants have grip (vacuum on or jaws close) and gripped. A grip on a moving item misses, and an item above maxLoadKg is never held. Faults: stuckX, stuckY, stuckZ, gripFail, dropLoad, grippedStuckOn, grippedStuckOff. Facts: picked, placed and drops per part (picked\:Name, placed\:Name, drops\:Name) and the axis positions (axis\:Name\:x, axis\:Name\:y, axis\:Name\:z) in metres, rounded to 0.001.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `digital` |   |
| `gripper` | enum | `vacuum`, `clamp` | `vacuum` |   |
| `strokeXM` | number | 0.4 to 3 | `1.2` | m |
| `strokeYM` | number | 0.2 to 1.2 | `0.5` | m |
| `strokeZM` | number | 0.4 to 3 | `1` | m |
| `speedMps` | number | 0.1 to 2 | `0.8` | m/s |
| `accelMps2` | number | 0.5 to 10 | `3` | m/s2 |
| `maxLoadKg` | number | 1 to 25 | `5` | kg |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `xPlus` | command | BOOL |   |   |
| `xMinus` | command | BOOL |   |   |
| `yPlus` | command | BOOL |   |   |
| `yMinus` | command | BOOL |   |   |
| `zPlus` | command | BOOL |   |   |
| `zMinus` | command | BOOL |   |   |
| `xAtMin` | sensor | BOOL |   |   |
| `xAtMax` | sensor | BOOL |   |   |
| `yAtMin` | sensor | BOOL |   |   |
| `yAtMax` | sensor | BOOL |   |   |
| `zAtMin` | sensor | BOOL |   |   |
| `zAtMax` | sensor | BOOL |   |   |
| `grip` | command | BOOL |   |   |
| `gripped` | sensor | BOOL |   |   |

#### Fault actions

`stuckX`, `stuckY`, `stuckZ`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`

#### Variants

| Setting | Value | Signals |
| --- | --- | --- |
| `variant` | `numeric` | xSet REAL, ySet REAL, zSet REAL, xPos REAL, yPos REAL, zPos REAL, grip BOOL, gripped BOOL |

#### Equations

Per axis and plant step dt = 0.005 s: the velocity moves toward the target velocity by at most accel * dt, then p = p + v * dt, clamped to 0..stroke (v = 0 at a stop). Jog: target velocity is the held direction times speed. Setpoint: the axis brakes when the remaining distance is at most v * v / (2 * accel), and snaps to the setpoint within 0.5 mm. A stuck axis does not move.

## Stations

### Layer palletizer

`layer-palletizer`

A station that squares boxes into a layer, lifts the whole layer with a clamp head and sets it on a pallet. Axes follow the world: X is the transfer along the part (local +x), Y is up. The part position is the floor point under the head at home, which is the centre of the forming zone; the pad bottom is at the part height plus the Y position. The forming zone is columns x 0.4 m by rows x 0.3 m; fixed plates close it at +x and -z, and the squaring pusher closes +z (it takes 0.4 s); boxes arrive from a belt at -x (snap point infeed). The pad is as large as the zone. Place the pallet centre at strokeXM along the part. The clamp closes in 0.3 s and takes up to columns x rows boxes at rest within 0.25 m under the pad; the layer is taken only if its total mass is at most maxLoadKg. layerReady is TRUE when exactly columns x rows boxes lie at rest in the zone. Variant digital: xPlus, xMinus, yPlus, yMinus (hold to move) and the limit sensors xAtMin, xAtMax, yAtMin, yAtMax; variant numeric: xSet, ySet and xPos, yPos in metres. Both: square, squared, layerReady, grip, gripped. Facts: picked, placed and drops count boxes; axis:&lt;Name>\:x and axis:&lt;Name>\:y are positions in metres. Faults: stuckX, stuckY, squareStuck, gripFail, dropLoad, grippedStuckOn, grippedStuckOff, layerReadyStuckOff. The axes start at 0, with the head at its lowest: raise it first.

#### Settings

| Setting | Kind | Range or values | Default | Unit |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `digital` |   |
| `strokeXM` | number | 0.8 to 3 | `1.6` | m |
| `strokeYM` | number | 0.3 to 1.5 | `0.8` | m |
| `speedMps` | number | 0.1 to 2 | `0.8` | m/s |
| `accelMps2` | number | 0.5 to 10 | `3` | m/s2 |
| `columns` | number | 1 to 3 | `2` |   |
| `rows` | number | 1 to 3 | `2` |   |
| `maxLoadKg` | number | 5 to 60 | `40` | kg |

#### Signals

| Signal | Direction | Type | Unit | Range |
| --- | --- | --- | --- | --- |
| `xPlus` | command | BOOL |   |   |
| `xMinus` | command | BOOL |   |   |
| `yPlus` | command | BOOL |   |   |
| `yMinus` | command | BOOL |   |   |
| `xAtMin` | sensor | BOOL |   |   |
| `xAtMax` | sensor | BOOL |   |   |
| `yAtMin` | sensor | BOOL |   |   |
| `yAtMax` | sensor | BOOL |   |   |
| `square` | command | BOOL |   |   |
| `squared` | sensor | BOOL |   |   |
| `layerReady` | sensor | BOOL |   |   |
| `grip` | command | BOOL |   |   |
| `gripped` | sensor | BOOL |   |   |

#### Fault actions

`stuckX`, `stuckY`, `squareStuck`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`, `layerReadyStuckOff`

#### Variants

| Setting | Value | Signals |
| --- | --- | --- |
| `variant` | `numeric` | xSet REAL, ySet REAL, xPos REAL, yPos REAL, square BOOL, squared BOOL, layerReady BOOL, grip BOOL, gripped BOOL |

#### Equations

Axis law per 5 ms step with a = accelMps2, v_max = speedMps: v moves toward the target velocity by at most a * dt; p = p + v * dt, clamped to 0..stroke. A set value brakes when \|d - v * dt\| &lt;= v * v / (2 * a), d = target - p. Pusher: travel t moves 0..400 ms at 1 ms per ms; squared when t = 400 ms.

{/* <<< END GENERATED: plant/parts <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
