---
title: "Esquema de la escena de planta"
sidebar_label: "Esquema de escena"
description: "El esquema JSON, las partes del catálogo con sus ajustes y un ejemplo resuelto de scene.json."
tags: [reference, generated]
---

# Esquema de la escena de planta

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/format-scene. Do not edit. >>> */}

Una escena de planta es el archivo JSON `scene.json`: las partes de una planta 3D, cada una una parte del catálogo con un id y un nombre únicos, una posición, una rotación y sus ajustes, y las cámaras. Las partes dan las señales de la planta (`<nombre>.<señal>`) que un mapa de planta enlaza con el programa. La página [formato del archivo de escena](../plant/scene-format.md) explica los campos con palabras.

El esquema, las listas y los ejemplos de abajo se leen de `packages/zplc-ide/src/formats`, el módulo que también sirve el recurso MCP `zplc://formats/scene`, así que la página, el recurso y el cargador dicen lo mismo. Las descripciones dentro del esquema están en inglés en los dos idiomas.

## Dónde está el archivo

`scene.json`

## Esquema JSON

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

## Valores aceptados

### Partes del catálogo

`box`, `workpiece`, `pallet`, `crate`, `lid`, `base`, `belt`, `roller`, `curved`, `emitter`, `remover`, `sensor-diffuse`, `sensor-retro`, `sensor-inductive`, `sensor-capacitive`, `sensor-colour`, `stop-blade`, `push-button`, `indicator-light`, `tank`, `selector-switch`, `emergency-stop`, `potentiometer`, `stack-light`, `numeric-display`, `pick-place`, `gantry`, `layer-palletizer`, `light-array`, `scale`, `vision-sensor`, `pusher`, `diverter-arm`, `chain-transfer`, `turntable`, `lift`, `stacker-crane`, `machining-centre`, `limit-switch`, `aligner`, `chute`

### Ajustes de cada parte

| Parte | Ajustes |
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

## Ejemplos resueltos

### Una cinta, un emisor, un sensor difuso, un pulsador y un visualizador numérico, con una cámara

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

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
