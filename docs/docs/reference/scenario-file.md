---
title: "Scenario file format"
sidebar_label: "Scenario files"
description: "The fields, expectation kinds and limits of a scenario test file."
tags: [reference, generated]
---

# Scenario file format

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/scenario-file. Do not edit. >>> */}

A scenario is a JSON file in the `tests/` folder of a project, named `*.scenario.json`. It writes BOOL inputs at chosen times, runs the program on the native runtime on a virtual clock, and checks BOOL outputs. A signal is written `Program.variable`, or the name of a `VAR_GLOBAL` alone. `zplc-cli test` runs every scenario of a project; `zplc-cli scenario-run` runs one.

This table is read off the source file `packages/zplc-ide/src/test-engine/index.ts`; its text is the source's own, so it is the same in English and in Spanish.

## Fields of a scenario

| Field | Description |
| --- | --- |
| `schemaVersion` | Always 1. |
| `id` | Name of the scenario; `scenario-run` and the MCP tool `scenario_run` select it by this name. |
| `tickMs` | Milliseconds of simulated time per scan, a positive integer. |
| `durationMs` | Length of the scenario in milliseconds, a multiple of `tickMs`. |
| `events` | Inputs to write, in time order; may be empty. |
| `expectations` | What the outputs must do; at least one. |
| `plant` | Optional: one of the plant models below, which drives its own inputs from the outputs of the program. |
| `scene` | Optional, and exclusive with `plant`: a scene plant file, its signal map file and a script of timed `operate`, `emit` and `fault` events (keys `file`, `map`, `script`). |

## Events

An event has `atMs` and `set`.

| Field | Description |
| --- | --- |
| `atMs` | Time of the event, a multiple of `tickMs`. |
| `set` | BOOL input signals to write, `{"Program.variable": true}`. |

## Expectations

| Kind | Fields | Meaning |
| --- | --- | --- |
| `AT` | `atMs`, `condition` | The condition holds at the sample of `atMs`. |
| `WITHIN` | `fromMs`, `withinMs`, `condition` | The condition holds at some sample from `fromMs` to `fromMs + withinMs`. |
| `FOR` | `fromMs`, `forMs`, `condition` | The condition holds at every sample from `fromMs` to `fromMs + forMs`. |
| `EVENTUALLY` | `fromMs`, `withinMs`, `condition` | The condition holds at some sample from `fromMs` to `fromMs + withinMs`. |
| `ALWAYS` | `condition` | The condition holds at every sample of the scenario. |
| `NEVER` | `condition` | The condition holds at no sample of the scenario. |
| `UNTIL` | `fromMs`, `condition`, `until` | From `fromMs` the condition holds at every sample until the first sample at which the inputs of `until` match. |
| `RISING` | `fromMs`, `withinMs`, `condition` | The one output of the condition goes TRUE between two consecutive samples, from `fromMs` to `fromMs + withinMs`. |
| `FALLING` | `fromMs`, `withinMs`, `condition` | The one output of the condition goes FALSE between two consecutive samples, from `fromMs` to `fromMs + withinMs`. |

### Fields of an expectation

| Field | Description |
| --- | --- |
| `kind` | The kind of expectation, from the table above. |
| `atMs` | Time of the sample, a multiple of `tickMs`. |
| `condition` | BOOL output signals and the value each must hold, `{"Program.variable": false}`. |
| `fromMs` | Start of the window, a multiple of `tickMs`. |
| `withinMs` | Length of the window, a multiple of `tickMs`. |
| `forMs` | Length of the window, a multiple of `tickMs`. |
| `until` | BOOL input signals and the value each must hold to end the window. |

## Plant models

`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`. A plant model requires `tickMs` 10 and the variables of its own program.

## Limits

| Limit | Value |
| --- | --- |
| Events in one scenario | `256` |
| Expectations in one scenario | `256` |
| Distinct signals in one scenario | `64` |
| Samples of one scenario (`durationMs / tickMs + 1`) | `10000` |
| Values of one trace (samples times signals) | `1000000` |
| Largest `tickMs`, in milliseconds | `60000` |
| Largest `durationMs`, in milliseconds | `3600000` |
| Longest `id`, in characters | `128` |
| Bytes of one scenario file | `131072` |
| Scenario files in one project | `64` |
| Bytes of all the scenario files of one project | `524288` |

## Example

```json
{
  "schemaVersion": 1,
  "id": "BlinkyST",
  "tickMs": 10,
  "durationMs": 2100,
  "events": [],
  "expectations": [
    { "kind": "AT", "atMs": 250, "condition": { "Blinky.LED_Output": false } },
    { "kind": "AT", "atMs": 750, "condition": { "Blinky.LED_Output": true } },
    { "kind": "AT", "atMs": 1250, "condition": { "Blinky.LED_Output": false } },
    { "kind": "AT", "atMs": 1750, "condition": { "Blinky.LED_Output": true } },
    { "kind": "FOR", "fromMs": 0, "forMs": 490, "condition": { "Blinky.LED_Output": false } },
    { "kind": "RISING", "fromMs": 490, "withinMs": 30, "condition": { "Blinky.LED_Output": true } },
    { "kind": "FOR", "fromMs": 510, "forMs": 490, "condition": { "Blinky.LED_Output": true } },
    { "kind": "FALLING", "fromMs": 1000, "withinMs": 30, "condition": { "Blinky.LED_Output": false } },
    { "kind": "FOR", "fromMs": 1020, "forMs": 480, "condition": { "Blinky.LED_Output": false } },
    { "kind": "RISING", "fromMs": 1500, "withinMs": 40, "condition": { "Blinky.LED_Output": true } },
    { "kind": "FOR", "fromMs": 1530, "forMs": 490, "condition": { "Blinky.LED_Output": true } },
    { "kind": "FALLING", "fromMs": 2020, "withinMs": 30, "condition": { "Blinky.LED_Output": false } }
  ]
}
```

## The file as a schema

The schema, the accepted values and worked examples of `tests/*.scenario.json`. A scenario with a `scene` block runs on the project scene: its script presses the panel, and its expectations can read plant facts (`fact:<name>`).

### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zplc://formats/scenario",
  "title": "ZPLC test scenario (tests/*.scenario.json)",
  "type": "object",
  "required": [
    "schemaVersion",
    "id",
    "tickMs",
    "durationMs",
    "events",
    "expectations"
  ],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": {
      "const": 1
    },
    "id": {
      "type": "string",
      "minLength": 1,
      "description": "At most 128 characters."
    },
    "tickMs": {
      "type": "integer",
      "minimum": 1,
      "description": "The task interval; a multiple of the plant step (5 ms) with a scene."
    },
    "durationMs": {
      "type": "integer",
      "minimum": 1,
      "description": "A multiple of tickMs; at most 10000 samples."
    },
    "plant": {
      "enum": [
        "motor-v1",
        "conveyor-v1",
        "tank-v1",
        "pedestrian-v1"
      ],
      "description": "A 2.0 plant; excludes `scene`."
    },
    "scene": {
      "type": "object",
      "required": [
        "file",
        "map",
        "script"
      ],
      "additionalProperties": false,
      "description": "Runs on the project scene; excludes `plant`.",
      "properties": {
        "file": {
          "type": "string",
          "description": "scene.json"
        },
        "map": {
          "type": "string",
          "description": "plant-map.json"
        },
        "script": {
          "type": "array",
          "description": "Each event has atMs and exactly one of operate, emit, fault.",
          "items": {
            "type": "object",
            "required": [
              "atMs"
            ],
            "properties": {
              "atMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "operate": {
                "type": "object",
                "required": [
                  "signal",
                  "value"
                ],
                "properties": {
                  "signal": {
                    "type": "string"
                  },
                  "value": {
                    "type": [
                      "boolean",
                      "number"
                    ]
                  }
                }
              },
              "emit": {
                "type": "object",
                "required": [
                  "kind",
                  "at"
                ],
                "properties": {
                  "kind": {
                    "type": "string"
                  },
                  "at": {
                    "type": "array",
                    "items": {
                      "type": "number"
                    }
                  }
                }
              },
              "fault": {
                "type": "object",
                "required": [
                  "part",
                  "action"
                ],
                "properties": {
                  "part": {
                    "type": "string"
                  },
                  "action": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "atMs",
          "set"
        ],
        "additionalProperties": false,
        "properties": {
          "atMs": {
            "type": "integer",
            "minimum": 0,
            "description": "Milliseconds, a multiple of tickMs, at most durationMs."
          },
          "set": {
            "type": "object",
            "description": "`Program.Input` -> true/false: inputs (IPI) the plant does not own.",
            "additionalProperties": {
              "type": "boolean"
            }
          }
        }
      }
    },
    "expectations": {
      "type": "array",
      "minItems": 1,
      "items": {
        "anyOf": [
          {
            "type": "object",
            "required": [
              "kind",
              "atMs",
              "condition"
            ],
            "additionalProperties": false,
            "properties": {
              "kind": {
                "enum": [
                  "AT"
                ]
              },
              "atMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "condition": {
                "type": "object",
                "description": "`Program.Output` -> true/false (an output, OPI). In a scene scenario also `fact:<name>` -> true/false, an exact whole number for an integer fact, or { \"min\", \"max\" } (either or both) for a real fact. 1-64 entries.",
                "additionalProperties": {
                  "type": [
                    "boolean",
                    "number",
                    "object"
                  ]
                }
              }
            }
          },
          {
            "type": "object",
            "required": [
              "kind",
              "fromMs",
              "withinMs",
              "condition"
            ],
            "additionalProperties": false,
            "properties": {
              "kind": {
                "enum": [
                  "WITHIN",
                  "EVENTUALLY",
                  "RISING",
                  "FALLING"
                ]
              },
              "fromMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "withinMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "condition": {
                "type": "object",
                "description": "`Program.Output` -> true/false (an output, OPI). In a scene scenario also `fact:<name>` -> true/false, an exact whole number for an integer fact, or { \"min\", \"max\" } (either or both) for a real fact. 1-64 entries.",
                "additionalProperties": {
                  "type": [
                    "boolean",
                    "number",
                    "object"
                  ]
                }
              }
            }
          },
          {
            "type": "object",
            "required": [
              "kind",
              "fromMs",
              "forMs",
              "condition"
            ],
            "additionalProperties": false,
            "properties": {
              "kind": {
                "enum": [
                  "FOR"
                ]
              },
              "fromMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "forMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "condition": {
                "type": "object",
                "description": "`Program.Output` -> true/false (an output, OPI). In a scene scenario also `fact:<name>` -> true/false, an exact whole number for an integer fact, or { \"min\", \"max\" } (either or both) for a real fact. 1-64 entries.",
                "additionalProperties": {
                  "type": [
                    "boolean",
                    "number",
                    "object"
                  ]
                }
              }
            }
          },
          {
            "type": "object",
            "required": [
              "kind",
              "fromMs",
              "condition",
              "until"
            ],
            "additionalProperties": false,
            "properties": {
              "kind": {
                "enum": [
                  "UNTIL"
                ]
              },
              "fromMs": {
                "type": "integer",
                "minimum": 0,
                "description": "Milliseconds, a multiple of tickMs, at most durationMs."
              },
              "condition": {
                "type": "object",
                "description": "`Program.Output` -> true/false (an output, OPI). In a scene scenario also `fact:<name>` -> true/false, an exact whole number for an integer fact, or { \"min\", \"max\" } (either or both) for a real fact. 1-64 entries.",
                "additionalProperties": {
                  "type": [
                    "boolean",
                    "number",
                    "object"
                  ]
                }
              },
              "until": {
                "type": "object",
                "description": "`Program.Input` -> true/false: inputs (IPI) the plant does not own.",
                "additionalProperties": {
                  "type": "boolean"
                }
              }
            }
          },
          {
            "type": "object",
            "required": [
              "kind",
              "condition"
            ],
            "additionalProperties": false,
            "properties": {
              "kind": {
                "enum": [
                  "ALWAYS",
                  "NEVER"
                ]
              },
              "condition": {
                "type": "object",
                "description": "`Program.Output` -> true/false (an output, OPI). In a scene scenario also `fact:<name>` -> true/false, an exact whole number for an integer fact, or { \"min\", \"max\" } (either or both) for a real fact. 1-64 entries.",
                "additionalProperties": {
                  "type": [
                    "boolean",
                    "number",
                    "object"
                  ]
                }
              }
            }
          }
        ]
      }
    }
  }
}
```

### Accepted values

#### Kinds of expectation

`AT`, `WITHIN`, `FOR`, `EVENTUALLY`, `ALWAYS`, `NEVER`, `UNTIL`, `RISING`, `FALLING`

#### Plant models

`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`

#### Events of a scene script

`operate`, `emit`, `fault`

#### Integer facts (compared as a count)

`itemsEmitted`, `itemsRemoved`, `itemsDropped`, `itemsCollided`, `itemsAssembled`, `emitted:<Name>`, `delivered:<Name>`, `count:<Name>`, `highs:<Name>`, `picked:<Name>`, `placed:<Name>`, `drops:<Name>`, `sorted:<Name>`, `misrouted:<Name>`, `stored:<Name>`, `produced:<Name>`, `misfires:<Name>`, `blocked:<Name>`, `stacked:pallet:<index>`, `layers:pallet:<index>`, `loaded:crate:<index>`

#### Real facts (compared with min and max)

`position:<box\|pallet>:<index>`, `level:<Name>`, `volume:<Name>`, `spilledL:<Name>`, `axis:<Name>:<x\|y\|z>`

#### Boolean facts

`inBand:<Name>`, `cell:<Name>:<column>:<level>`

### Worked examples

#### Plain I/O: events drive the inputs, five kinds of expectation

```json
{
  "schemaVersion": 1,
  "id": "belt-latch",
  "tickMs": 10,
  "durationMs": 2000,
  "events": [
    {
      "atMs": 100,
      "set": {
        "Belt.Start": true
      }
    },
    {
      "atMs": 200,
      "set": {
        "Belt.Start": false
      }
    },
    {
      "atMs": 1000,
      "set": {
        "Belt.EyeFar": true
      }
    }
  ],
  "expectations": [
    {
      "kind": "AT",
      "atMs": 50,
      "condition": {
        "Belt.Run": false
      }
    },
    {
      "kind": "WITHIN",
      "fromMs": 100,
      "withinMs": 50,
      "condition": {
        "Belt.Run": true
      }
    },
    {
      "kind": "FOR",
      "fromMs": 300,
      "forMs": 600,
      "condition": {
        "Belt.Run": true
      }
    },
    {
      "kind": "EVENTUALLY",
      "fromMs": 1000,
      "withinMs": 100,
      "condition": {
        "Belt.Run": false
      }
    },
    {
      "kind": "NEVER",
      "condition": {
        "Belt.Late": true
      }
    }
  ]
}
```

#### On the scene, with a fact count and a real fact range

```json
{
  "schemaVersion": 1,
  "id": "belt-to-sensor",
  "tickMs": 10,
  "durationMs": 8000,
  "scene": {
    "file": "scene.json",
    "map": "plant-map.json",
    "script": [
      {
        "atMs": 200,
        "operate": {
          "signal": "StartButton.pressed",
          "value": true
        }
      },
      {
        "atMs": 400,
        "operate": {
          "signal": "StartButton.pressed",
          "value": false
        }
      }
    ]
  },
  "events": [],
  "expectations": [
    {
      "kind": "AT",
      "atMs": 100,
      "condition": {
        "Belt.Run": false
      }
    },
    {
      "kind": "EVENTUALLY",
      "fromMs": 0,
      "withinMs": 8000,
      "condition": {
        "fact:count:EyeFar": true
      }
    },
    {
      "kind": "AT",
      "atMs": 8000,
      "condition": {
        "Belt.Run": false,
        "fact:position:box:0": {
          "min": 0.2,
          "max": 1.2
        }
      }
    },
    {
      "kind": "ALWAYS",
      "condition": {
        "fact:itemsDropped": false
      }
    }
  ]
}
```

{/* <<< END GENERATED: reference/scenario-file <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
