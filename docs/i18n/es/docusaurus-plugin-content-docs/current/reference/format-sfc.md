---
title: "Formato del archivo de diagrama funcional de secuencias"
sidebar_label: "Formato de archivo SFC"
description: "El esquema JSON, los valores aceptados y un ejemplo resuelto de un archivo SFC (.sfc.json)."
tags: [reference, generated]
---

# Formato del archivo de diagrama funcional de secuencias

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/format-sfc. Do not edit. >>> */}

Un programa de diagrama funcional de secuencias es un archivo JSON `src/*.sfc.json`: etapas, las transiciones entre ellas con una condición en ST cada una, y las acciones que una etapa ejecuta bajo un calificador. Al menos una etapa es inicial. Una acción `N` se ejecuta mientras su etapa está activa.

El esquema, las listas y los ejemplos de abajo se leen de `packages/zplc-ide/src/formats`, el módulo que también sirve el recurso MCP `zplc://formats/sfc`, así que la página, el recurso y el cargador dicen lo mismo. Las descripciones dentro del esquema están en inglés en los dos idiomas.

## Dónde está el archivo

`src/*.sfc.json`

## Esquema JSON

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

## Valores aceptados

### Calificadores de acción

`N`, `S`, `R`, `L`, `D`, `P`, `P0`, `P1`

### Lenguajes de acción

`ST`

## Ejemplos resueltos

### Dos etapas, Idle -> Run -> Idle, con una acción en cada una y dos transiciones

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

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
