---
title: "Formato del archivo de escenario"
sidebar_label: "Archivos de escenario"
description: "Los campos, las clases de expectativa y los límites de un archivo de prueba de escenario."
tags: [reference, generated]
---

# Formato del archivo de escenario

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/scenario-file. Do not edit. >>> */}

Un escenario es un archivo JSON en la carpeta `tests/` de un proyecto, llamado `*.scenario.json`. Escribe entradas BOOL en instantes elegidos, ejecuta el programa en el runtime nativo con un reloj virtual y comprueba salidas BOOL. Una señal se escribe `Programa.variable`, o solo el nombre de una `VAR_GLOBAL`. `zplc-cli test` ejecuta todos los escenarios de un proyecto; `zplc-cli scenario-run` ejecuta uno.

Esta tabla se lee del archivo fuente `packages/zplc-ide/src/test-engine/index.ts`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

## Campos de un escenario

| Campo | Descripción |
| --- | --- |
| `schemaVersion` | Always 1. |
| `id` | Name of the scenario; `scenario-run` and the MCP tool `scenario_run` select it by this name. |
| `tickMs` | Milliseconds of simulated time per scan, a positive integer. |
| `durationMs` | Length of the scenario in milliseconds, a multiple of `tickMs`. |
| `events` | Inputs to write, in time order; may be empty. |
| `expectations` | What the outputs must do; at least one. |
| `plant` | Optional: one of the plant models below, which drives its own inputs from the outputs of the program. |

## Eventos

Un evento tiene `atMs` y `set`.

| Campo | Descripción |
| --- | --- |
| `atMs` | Time of the event, a multiple of `tickMs`. |
| `set` | BOOL input signals to write, `{"Program.variable": true}`. |

## Expectativas

| Clase | Campos | Significado |
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

### Campos de una expectativa

| Campo | Descripción |
| --- | --- |
| `kind` | The kind of expectation, from the table above. |
| `atMs` | Time of the sample, a multiple of `tickMs`. |
| `condition` | BOOL output signals and the value each must hold, `{"Program.variable": false}`. |
| `fromMs` | Start of the window, a multiple of `tickMs`. |
| `withinMs` | Length of the window, a multiple of `tickMs`. |
| `forMs` | Length of the window, a multiple of `tickMs`. |
| `until` | BOOL input signals and the value each must hold to end the window. |

## Modelos de planta

`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`. Un modelo de planta exige `tickMs` 10 y las variables de su propio programa.

## Límites

| Límite | Valor |
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

## Ejemplo

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

{/* <<< END GENERATED: reference/scenario-file <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
