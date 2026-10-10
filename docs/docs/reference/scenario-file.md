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
    {"kind": "AT", "atMs": 250, "condition": {"Blinky.LED_Output": false}},
    {"kind": "AT", "atMs": 750, "condition": {"Blinky.LED_Output": true}},
    {"kind": "AT", "atMs": 1250, "condition": {"Blinky.LED_Output": false}},
    {"kind": "AT", "atMs": 1750, "condition": {"Blinky.LED_Output": true}},
    {"kind": "FOR", "fromMs": 0, "forMs": 490, "condition": {"Blinky.LED_Output": false}},
    {"kind": "RISING", "fromMs": 490, "withinMs": 30, "condition": {"Blinky.LED_Output": true}},
    {"kind": "FOR", "fromMs": 510, "forMs": 490, "condition": {"Blinky.LED_Output": true}},
    {"kind": "FALLING", "fromMs": 1000, "withinMs": 30, "condition": {"Blinky.LED_Output": false}},
    {"kind": "FOR", "fromMs": 1020, "forMs": 480, "condition": {"Blinky.LED_Output": false}},
    {"kind": "RISING", "fromMs": 1500, "withinMs": 40, "condition": {"Blinky.LED_Output": true}},
    {"kind": "FOR", "fromMs": 1530, "forMs": 490, "condition": {"Blinky.LED_Output": true}},
    {"kind": "FALLING", "fromMs": 2020, "withinMs": 30, "condition": {"Blinky.LED_Output": false}}
  ]
}
```

{/* <<< END GENERATED: reference/scenario-file <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
