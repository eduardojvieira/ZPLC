---
title: "Sequential Function Chart file format"
sidebar_label: "SFC file format"
description: "The JSON Schema, the accepted values and a worked example of an SFC file (.sfc.json)."
tags: [reference, generated]
---

# Sequential Function Chart file format

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/format-sfc. Do not edit. >>> */}

A Sequential Function Chart program is a JSON file `src/*.sfc.json`: steps, the transitions between them with an ST condition each, and the actions a step runs under a qualifier. At least one step is initial. An `N` action runs while its step is active.

The schema, the lists and the examples below are read off `packages/zplc-ide/src/formats`, the module that the MCP resource `zplc://formats/sfc` serves too, so the page, the resource and the loader say the same. The descriptions inside the schema are in English in both languages.

## Where the file lives

`src/*.sfc.json`

## JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zplc://formats/sfc",
  "title": "ZPLC Sequential Function Chart (.sfc.json)",
  "type": "object",
  "required": [
    "name",
    "steps",
    "transitions"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "The program name; tasks in zplc.json name it as `<name>.sfc`."
    },
    "description": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "variables": {
      "type": "object",
      "required": [
        "local",
        "outputs"
      ],
      "properties": {
        "local": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string"
              },
              "comment": {
                "type": "string"
              }
            }
          }
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string"
              },
              "comment": {
                "type": "string"
              }
            }
          }
        },
        "outputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string"
              },
              "comment": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "steps": {
      "type": "array",
      "description": "At least one step has isInitial true.",
      "items": {
        "type": "object",
        "required": [
          "id",
          "name",
          "position"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "isInitial": {
            "type": "boolean"
          },
          "position": {
            "type": "object",
            "required": [
              "x",
              "y"
            ],
            "properties": {
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          },
          "actions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "actionName",
                "qualifier"
              ],
              "properties": {
                "actionName": {
                  "type": "string",
                  "minLength": 1,
                  "description": "The name of an entry of `actions`."
                },
                "qualifier": {
                  "enum": [
                    "N",
                    "S",
                    "R",
                    "L",
                    "D",
                    "P",
                    "P0",
                    "P1"
                  ]
                },
                "time": {
                  "type": "string",
                  "description": "For L and D: a TIME literal such as T#2s."
                },
                "comment": {
                  "type": "string"
                }
              }
            }
          },
          "comment": {
            "type": "string"
          }
        }
      }
    },
    "transitions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "fromStep",
          "toStep",
          "condition"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "fromStep": {
            "type": "string",
            "description": "A step id."
          },
          "toStep": {
            "type": "string",
            "description": "A step id."
          },
          "fromSteps": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Simultaneous convergence; the first is fromStep."
          },
          "toSteps": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Simultaneous divergence; the first is toStep."
          },
          "priority": {
            "type": "integer",
            "description": "Selection divergence: the lowest number is evaluated first."
          },
          "condition": {
            "type": "string",
            "description": "A BOOL expression in ST; `<stepId>.T` is the time in that step."
          },
          "position": {
            "type": "object",
            "required": [
              "x",
              "y"
            ],
            "properties": {
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          },
          "comment": {
            "type": "string"
          }
        }
      }
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "name",
          "body"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "type": {
            "enum": [
              "ST"
            ]
          },
          "body": {
            "type": "string"
          }
        }
      }
    },
    "metadata": {
      "type": "object"
    }
  }
}
```

## Accepted values

### Action qualifiers

`N`, `S`, `R`, `L`, `D`, `P`, `P0`, `P1`

### Action languages

`ST`

## Worked examples

### Two steps, Idle -> Run -> Idle, with an action in each and two transitions

```json
{
  "name": "Cycle",
  "description": "Idle until Start; Run drives the pump until Done or 10 s in the step, then back to Idle.",
  "version": "1.0.0",
  "variables": {
    "local": [],
    "inputs": [
      {
        "name": "Start",
        "type": "BOOL",
        "address": "%I0.0"
      },
      {
        "name": "Done",
        "type": "BOOL",
        "address": "%I0.1"
      }
    ],
    "outputs": [
      {
        "name": "Pump",
        "type": "BOOL",
        "address": "%Q0.0"
      }
    ]
  },
  "steps": [
    {
      "id": "idle",
      "name": "Idle",
      "isInitial": true,
      "position": {
        "x": 200,
        "y": 40
      },
      "actions": [
        {
          "qualifier": "N",
          "actionName": "StopPump"
        }
      ]
    },
    {
      "id": "run",
      "name": "Run",
      "isInitial": false,
      "position": {
        "x": 200,
        "y": 240
      },
      "actions": [
        {
          "qualifier": "N",
          "actionName": "RunPump"
        }
      ]
    }
  ],
  "transitions": [
    {
      "id": "t_start",
      "fromStep": "idle",
      "toStep": "run",
      "condition": "Start",
      "position": {
        "x": 200,
        "y": 140
      }
    },
    {
      "id": "t_done",
      "fromStep": "run",
      "toStep": "idle",
      "condition": "Done OR run.T >= T#10s",
      "position": {
        "x": 200,
        "y": 340
      }
    }
  ],
  "actions": [
    {
      "id": "StopPump",
      "name": "StopPump",
      "type": "ST",
      "body": "Pump := FALSE;"
    },
    {
      "id": "RunPump",
      "name": "RunPump",
      "type": "ST",
      "body": "Pump := TRUE;"
    }
  ]
}
```

{/* <<< END GENERATED: reference/format-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
