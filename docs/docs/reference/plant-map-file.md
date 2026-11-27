---
title: "Plant map file format"
sidebar_label: "Plant map file"
description: "The JSON Schema, the accepted values and a worked example of plant-map.json."
tags: [reference, generated]
---

# Plant map file format

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/plant-map-file. Do not edit. >>> */}

A plant map is the JSON file `plant-map.json`: the explicit binding of each plant signal to a program variable, `Program.Name`, with its direction and type. A command is a program output, a sensor a program input; an `INT` or `REAL` signal carries its scaling. No signal is bound by its name.

The schema, the lists and the examples below are read off `packages/zplc-ide/src/formats`, the module that the MCP resource `zplc://formats/plant-map` serves too, so the page, the resource and the loader say the same. The descriptions inside the schema are in English in both languages.

## Where the file lives

`plant-map.json`

## JSON Schema

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

## Accepted values

### Directions

`command`, `sensor`

### Types

`BOOL`, `INT`, `REAL`

### Plant models

`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`

### Keys of a range

`raw_min`, `raw_max`, `eng_min`, `eng_max`, `unit`

## Worked examples

### Four BOOL signals and one REAL signal with its range, bound to the Ladder example

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

This page is generated: to change it, change its source and run `bun run docs:generate`.
