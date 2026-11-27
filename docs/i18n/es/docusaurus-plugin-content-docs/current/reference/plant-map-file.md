---
title: "Formato del archivo de mapa de planta"
sidebar_label: "Archivo de mapa de planta"
description: "El esquema JSON, los valores aceptados y un ejemplo resuelto de plant-map.json."
tags: [reference, generated]
---

# Formato del archivo de mapa de planta

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/plant-map-file. Do not edit. >>> */}

Un mapa de planta es el archivo JSON `plant-map.json`: el enlace explícito de cada señal de la planta con una variable del programa, `Programa.Nombre`, con su dirección y su tipo. Un comando es una salida del programa, un sensor una entrada del programa; una señal `INT` o `REAL` lleva su escala. Ninguna señal se enlaza por su nombre.

El esquema, las listas y los ejemplos de abajo se leen de `packages/zplc-ide/src/formats`, el módulo que también sirve el recurso MCP `zplc://formats/plant-map`, así que la página, el recurso y el cargador dicen lo mismo. Las descripciones dentro del esquema están en inglés en los dos idiomas.

## Dónde está el archivo

`plant-map.json`

## Esquema JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zplc://formats/plant-map",
  "title": "ZPLC plant map (plant-map.json)",
  "description": "Schema 2 binds scene or plant signals of any type; schema 1 (`plant`, `reads`, `drives`, BOOL only) is still read.",
  "type": "object",
  "anyOf": [
    {
      "type": "object",
      "description": "Schema 2: write this one.",
      "required": [
        "schemaVersion",
        "target",
        "signals"
      ],
      "additionalProperties": false,
      "properties": {
        "schemaVersion": {
          "const": 2
        },
        "target": {
          "type": "object",
          "description": "Exactly one of `scene` (the scene id) or `plant` (a 2.0 plant).",
          "anyOf": [
            {
              "type": "object",
              "required": [
                "scene"
              ],
              "additionalProperties": false,
              "properties": {
                "scene": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            {
              "type": "object",
              "required": [
                "plant"
              ],
              "additionalProperties": false,
              "properties": {
                "plant": {
                  "enum": [
                    "motor-v1",
                    "conveyor-v1",
                    "tank-v1",
                    "pedestrian-v1"
                  ]
                }
              }
            }
          ]
        },
        "signals": {
          "type": "object",
          "description": "Plant signal name (`<part name>.<signal>`) -> its binding; at least one.",
          "additionalProperties": {
            "type": "object",
            "required": [
              "direction",
              "type",
              "point"
            ],
            "additionalProperties": false,
            "properties": {
              "direction": {
                "enum": [
                  "command",
                  "sensor"
                ],
                "description": "command: program to plant (an output); sensor: plant to program (an input)."
              },
              "type": {
                "enum": [
                  "BOOL",
                  "INT",
                  "REAL"
                ],
                "description": "INT is the 16-bit integer."
              },
              "point": {
                "type": "string",
                "pattern": "^[A-Za-z_][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*$",
                "description": "`Program.Name`."
              },
              "range": {
                "type": "object",
                "required": [
                  "raw_min",
                  "raw_max",
                  "eng_min",
                  "eng_max",
                  "unit"
                ],
                "additionalProperties": false,
                "description": "Linear scaling: raw_min..raw_max of the program variable is eng_min..eng_max of the plant. raw_max > raw_min; INT raw fits -32768..32767. Required for INT and REAL, absent for BOOL.",
                "properties": {
                  "raw_min": {
                    "type": "number"
                  },
                  "raw_max": {
                    "type": "number"
                  },
                  "eng_min": {
                    "type": "number"
                  },
                  "eng_max": {
                    "type": "number"
                  },
                  "unit": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      "type": "object",
      "description": "Schema 1: still read; write schema 2. Every signal of the plant is bound, and only those.",
      "required": [
        "schemaVersion",
        "plant",
        "reads",
        "drives"
      ],
      "additionalProperties": false,
      "properties": {
        "schemaVersion": {
          "const": 1
        },
        "plant": {
          "enum": [
            "motor-v1",
            "conveyor-v1",
            "tank-v1",
            "pedestrian-v1"
          ]
        },
        "reads": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "pattern": "^[A-Za-z_][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*$"
          },
          "description": "Plant command signal -> the program output that drives it."
        },
        "drives": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "pattern": "^[A-Za-z_][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*$"
          },
          "description": "Plant sensor signal -> the program input it drives."
        }
      }
    }
  ]
}
```

## Valores aceptados

### Direcciones

`command`, `sensor`

### Tipos

`BOOL`, `INT`, `REAL`

### Modelos de planta

`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`

### Claves de un rango

`raw_min`, `raw_max`, `eng_min`, `eng_max`, `unit`

## Ejemplos resueltos

### Cuatro señales BOOL y una señal REAL con su rango, enlazadas con el ejemplo de escalera

```json
{
  "schemaVersion": 2,
  "target": {
    "scene": "belt-to-sensor"
  },
  "signals": {
    "StartButton.pressed": {
      "direction": "sensor",
      "type": "BOOL",
      "point": "Belt.Start"
    },
    "EyeFar.detect": {
      "direction": "sensor",
      "type": "BOOL",
      "point": "Belt.EyeFar"
    },
    "Belt1.run": {
      "direction": "command",
      "type": "BOOL",
      "point": "Belt.Run"
    },
    "Emitter1.emit": {
      "direction": "command",
      "type": "BOOL",
      "point": "Belt.Emit"
    },
    "SpeedShown.value": {
      "direction": "command",
      "type": "REAL",
      "point": "Belt.Speed",
      "range": {
        "raw_min": 0,
        "raw_max": 100,
        "eng_min": 0,
        "eng_max": 100,
        "unit": "%"
      }
    }
  }
}
```

{/* <<< END GENERATED: reference/plant-map-file <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
