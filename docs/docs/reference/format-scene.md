---
title: "Plant scene schema"
sidebar_label: "Scene schema"
description: "The JSON Schema, the catalogue parts with their settings and a worked example of scene.json."
tags: [reference, generated]
---

# Plant scene schema

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/format-scene. Do not edit. >>> */}

A plant scene is the JSON file `scene.json`: the parts of a 3D plant, each a catalogue part with a unique id and name, a position, a rotation and its settings, and the cameras. The parts give the plant signals (`<name>.<signal>`) that a plant map binds to the program. The [scene file format](../plant/scene-format.md) page explains the fields in prose.

The schema, the lists and the examples below are read off `packages/zplc-ide/src/formats`, the module that the MCP resource `zplc://formats/scene` serves too, so the page, the resource and the loader say the same. The descriptions inside the schema are in English in both languages.

## Where the file lives

`scene.json`

## JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zplc://formats/scene",
  "title": "ZPLC plant scene (scene.json)",
  "type": "object",
  "required": [
    "schemaVersion",
    "name",
    "parts",
    "cameras"
  ],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": {
      "const": 1
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "shortestPulseMs": {
      "type": "number",
      "description": "Greater than 0: the shortest pulse a person can give in the operate panel."
    },
    "parts": {
      "type": "array",
      "maxItems": 512,
      "items": {
        "type": "object",
        "required": [
          "id",
          "part",
          "name",
          "position",
          "rotationYDeg",
          "config"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]{0,31}$",
            "description": "Unique in the scene."
          },
          "part": {
            "enum": [
              "box",
              "workpiece",
              "pallet",
              "crate",
              "lid",
              "base",
              "belt",
              "roller",
              "curved",
              "emitter",
              "remover",
              "sensor-diffuse",
              "sensor-retro",
              "sensor-inductive",
              "sensor-capacitive",
              "sensor-colour",
              "stop-blade",
              "push-button",
              "indicator-light",
              "tank",
              "selector-switch",
              "emergency-stop",
              "potentiometer",
              "stack-light",
              "numeric-display",
              "pick-place",
              "gantry",
              "layer-palletizer",
              "light-array",
              "scale",
              "vision-sensor",
              "pusher",
              "diverter-arm",
              "chain-transfer",
              "turntable",
              "lift",
              "stacker-crane",
              "machining-centre",
              "limit-switch",
              "aligner",
              "chute"
            ]
          },
          "name": {
            "type": "string",
            "pattern": "^[A-Za-z][A-Za-z0-9_]{0,23}$",
            "description": "Unique in the scene; it prefixes the signals (`Belt1.run`) and the facts (`count:EyeFar`)."
          },
          "position": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "minItems": 3,
            "maxItems": 3,
            "description": "[x, y, z] in metres."
          },
          "rotationYDeg": {
            "type": "number"
          },
          "config": {
            "type": "object",
            "description": "Settings of the part, numbers, strings or booleans; acceptedValues `config.<part>` lists them.",
            "additionalProperties": {
              "type": [
                "number",
                "string",
                "boolean"
              ]
            }
          }
        }
      }
    },
    "cameras": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "name",
          "position",
          "target"
        ],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string"
          },
          "position": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "minItems": 3,
            "maxItems": 3
          },
          "target": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "minItems": 3,
            "maxItems": 3
          }
        }
      }
    }
  }
}
```

## Accepted values

### Parts of the catalogue

`box`, `workpiece`, `pallet`, `crate`, `lid`, `base`, `belt`, `roller`, `curved`, `emitter`, `remover`, `sensor-diffuse`, `sensor-retro`, `sensor-inductive`, `sensor-capacitive`, `sensor-colour`, `stop-blade`, `push-button`, `indicator-light`, `tank`, `selector-switch`, `emergency-stop`, `potentiometer`, `stack-light`, `numeric-display`, `pick-place`, `gantry`, `layer-palletizer`, `light-array`, `scale`, `vision-sensor`, `pusher`, `diverter-arm`, `chain-transfer`, `turntable`, `lift`, `stacker-crane`, `machining-centre`, `limit-switch`, `aligner`, `chute`

### Settings of each part

| Part | Settings |
| --- | --- |
| `box` | `height`, `mass`, `code` |
| `workpiece` | `colour`, `material`, `code`, `mass` |
| `lid` | `mass` |
| `base` | `mass` |
| `belt` | `length`, `width`, `speedMps`, `accelMps2`, `allowReverse` |
| `roller` | `length`, `width`, `speedMps`, `accelMps2`, `allowReverse` |
| `curved` | `radius`, `hand`, `width`, `speedMps`, `accelMps2`, `allowReverse` |
| `emitter` | `kind`, `vary`, `codes`, `colour`, `material`, `code`, `height`, `mass`, `intervalMs`, `maxItems` |
| `remover` | `width`, `depth`, `height`, `accepts`, `acceptsCode` |
| `sensor-diffuse` | `rangeM`, `heightM` |
| `sensor-retro` | `rangeM`, `heightM` |
| `sensor-inductive` | `rangeM`, `heightM` |
| `sensor-capacitive` | `rangeM`, `heightM` |
| `sensor-colour` | `rangeM`, `heightM`, `target` |
| `stop-blade` | `widthM`, `heightM` |
| `tank` | `variant`, `widthM`, `depthM`, `heightM`, `initialFraction`, `inletMaxLps`, `outletCoef`, `valveTauS`, `highFraction`, `lowFraction`, `bandLow`, `bandHigh`, `leakLps` |
| `selector-switch` | `positions`, `output` |
| `potentiometer` | `min`, `max`, `initial`, `unit` |
| `numeric-display` | `type`, `min`, `max`, `unit`, `decimals` |
| `pick-place` | `variant`, `gripper`, `strokeXM`, `strokeYM`, `speedMps`, `accelMps2`, `maxLoadKg` |
| `gantry` | `variant`, `gripper`, `strokeXM`, `strokeYM`, `strokeZM`, `speedMps`, `accelMps2`, `maxLoadKg` |
| `layer-palletizer` | `variant`, `strokeXM`, `strokeYM`, `speedMps`, `accelMps2`, `columns`, `rows`, `maxLoadKg` |
| `light-array` | `beams`, `pitchM`, `spanM` |
| `scale` | `rangeKg`, `lengthM`, `widthM`, `heightM`, `settleMs` |
| `vision-sensor` | `fieldM`, `heightM` |
| `pusher` | `strokeM`, `widthM`, `heightM`, `speedMps`, `accelMps2` |
| `diverter-arm` | `lengthM`, `heightM`, `angleDeg`, `degPerS` |
| `chain-transfer` | `lengthM`, `widthM`, `liftM`, `liftTravelMs`, `speedMps`, `accelMps2`, `allowReverse` |
| `turntable` | `sizeM`, `speedMps`, `accelMps2`, `angleDeg`, `degPerS`, `allowReverse` |
| `lift` | `levels`, `levelPitchM`, `lengthM`, `widthM`, `speedMps`, `travelSpeedMps`, `accelMps2`, `allowReverse` |
| `stacker-crane` | `columns`, `levels`, `bayPitchM`, `levelPitchM`, `forkStrokeM`, `speedXMps`, `speedYMps`, `forkSpeedMps`, `beltSpeedMps`, `accelMps2`, `maxLoadKg` |
| `machining-centre` | `product`, `cycleMs`, `lengthM`, `widthM`, `speedMps` |
| `limit-switch` | `reachM`, `heightM` |
| `aligner` | `widthM`, `gapM`, `lengthM` |
| `chute` | `lengthM`, `widthM`, `tiltDeg` |

## Worked examples

### A belt, an emitter, a diffuse sensor, a push button and a numeric display, with one camera

```json
{
  "schemaVersion": 1,
  "name": "Belt to sensor",
  "shortestPulseMs": 800,
  "parts": [
    {
      "id": "belt",
      "part": "belt",
      "name": "Belt1",
      "position": [
        0,
        0.5,
        0
      ],
      "rotationYDeg": 0,
      "config": {
        "length": 2.4,
        "speedMps": 0.5
      }
    },
    {
      "id": "emitter",
      "part": "emitter",
      "name": "Emitter1",
      "position": [
        -0.9,
        0.5,
        0
      ],
      "rotationYDeg": 0,
      "config": {
        "maxItems": 1
      }
    },
    {
      "id": "eye-far",
      "part": "sensor-diffuse",
      "name": "EyeFar",
      "position": [
        0.7,
        0.5,
        -0.5
      ],
      "rotationYDeg": 270,
      "config": {
        "rangeM": 1
      }
    },
    {
      "id": "start",
      "part": "push-button",
      "name": "StartButton",
      "position": [
        -0.9,
        0.5,
        -0.7
      ],
      "rotationYDeg": 0,
      "config": {}
    },
    {
      "id": "speed",
      "part": "numeric-display",
      "name": "SpeedShown",
      "position": [
        0.9,
        0.8,
        -0.7
      ],
      "rotationYDeg": 0,
      "config": {
        "type": "REAL",
        "min": 0,
        "max": 100,
        "unit": "%",
        "decimals": 0
      }
    }
  ],
  "cameras": [
    {
      "name": "Overview",
      "position": [
        0,
        2.2,
        2.6
      ],
      "target": [
        0,
        0.5,
        0
      ]
    }
  ]
}
```

{/* <<< END GENERATED: reference/format-scene <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
