---
title: "Herramientas y recursos MCP"
sidebar_label: "Servidor MCP"
description: "Cada herramienta y recurso del servidor local zplc-mcp, leídos de su fuente."
tags: [reference, generated]
---

# Herramientas y recursos MCP

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/mcp. Do not edit. >>> */}

`zplc-mcp` es un servidor local del Model Context Protocol sobre entrada y salida estándar. Expone 18 herramientas y 26 recursos para un espacio de trabajo. Todas las herramientas son de solo lectura salvo `firmware_build`, que ejecuta una compilación cruzada local y efímera: ninguna herramienta graba, despliega, fuerza, arranca, detiene ni abre un puerto serie o una consola. Los resultados son evidencia de una ejecución registrada en el host, no del hardware.

Esta tabla se lee del archivo fuente `packages/zplc-ide/src/mcp/server.ts`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

## Arranque del servidor

```text
zplc-mcp --workspace <absolute-path-of-a-project> [--repository <absolute-path-of-a-checkout>] [--user-data <absolute-path-of-a-folder>] [--self-check]
```

## Revisión del protocolo

El servidor atiende el apretón de manos de 2025 (`initialize`) además de la revisión 2026-07-28: su punto de entrada inicia el transporte con `legacy: 'serve'`.

## Herramientas

| Herramienta | Título | Entrada | Solo lectura | Descripción |
| --- | --- | --- | --- | --- |
| `project_inspect` | Inspect project |   | sí | Read the manifest summary: name, version, tasks, target and the programs of src with their language. Call it first. |
| `project_validate` | Validate project |   | sí | Check that zplc.json, the tasks and each LD, FBD and SFC file load; a failure names the place and the accepted values. |
| `compiler_check` | Check compiler |   | sí | Compile every program in memory: pass or fail, the code size and the located diagnostics. Use it after each edit. |
| `compiler_compile` | Compile workspace |   | sí | Compile the project to .zplc bytecode and answer its digest, size and diagnostics; the bytes stay on the server. |
| `symbols_list` | List symbols |   | sí | List the compiled variables with type, region and address; use the exact names in scenarios and plant maps. |
| `safety_check` | Check declared interlocks |   | sí | Check that each incompatible output pair of zplc.json is covered by a NEVER expectation of a scenario in tests. |
| `tests_run` | Run workspace tests |   | sí | Run every scenario of tests on the host simulator: pass or fail per scenario, the failed checks, a trace digest. |
| `scenario_run` | Run one scenario | `scenarioId` | sí | Run one scenario, named by its id from scenarios_list, on the host simulator and answer its result and failed checks. |
| `simulation_start` | Start recorded simulation | `scenarioId` | sí | Run one scenario on the host simulator and answer its first recorded sample and trace digest; no session is kept. |
| `simulation_step` | Step recorded simulation | `scenarioId`, `cursor`, `traceSha256` | sí | Answer the recorded sample after cursor of a scenario run, pinned by its trace digest, to walk a run step by step. |
| `runtime_snapshot` | Read recorded snapshot | `scenarioId`, `cursor`, `traceSha256` | sí | Answer one recorded sample of a scenario run at cursor, pinned by its trace digest; a recording, not a live runtime. |
| `trace_get` | Get recorded trace | `scenarioId`, `mode`, `signals`, `includeInputs`, `watchSignals`, `fromMs`, `toMs`, `fromSample`, `limit` | sí | Run one scenario on the host simulator and answer its trace: whole, or as changes, a window or a summary with inputs. |
| `boards_list` | List board profiles |   | sí | List the boards the repository declares and their validation level, without probing any hardware. Needs --repository. |
| `toolchain_inspect` | Inspect toolchain |   | sí | Check the local tools a firmware build needs (west, CMake, Ninja, Zephyr SDK) and which are ready. Needs --repository. |
| `firmware_build` | Build firmware | `ideId` | no | Run a local ephemeral cross-build of the runtime for one board, answer the image digest; it never flashes or deploys. |
| `plant_inspect` | Inspect plant scene and map | `sceneFile`, `mapFile` | sí | Read the plant scene, the signals it offers, the plant map and the map points the compiled program does not have. |
| `scenarios_list` | List scenarios |   | sí | List every scenario of tests with its id, timing, scene and a summary of each expectation; use the ids to run them. |
| `server_self_check` | Check this server |   | sí | Answer what this server serves: project name, optional folders, simulator, protocols, counts and the boundary. |

## Recursos

| Recurso | Clase |
| --- | --- |
| `zplc://project/manifest` | fijo |
| `zplc://project/programs` | fijo |
| `zplc://project/symbols` | fijo |
| `zplc://project/io-map` | fijo |
| `zplc://project/diagnostics` | fijo |
| `zplc://target/capabilities` | fijo |
| `zplc://runtime/trace` | fijo |
| `zplc://runtime/snapshot` | fijo |
| `zplc://course/progress` | fijo |
| `zplc://docs/evidence` | fijo |
| `zplc://docs/safety` | fijo |
| `zplc://docs/testing` | fijo |
| `zplc://project/scene` | fijo |
| `zplc://project/plant-map` | fijo |
| `zplc://project/scenarios` | fijo |
| `zplc://lesson/current` | fijo |
| `zplc://formats/ld` | fijo |
| `zplc://formats/fbd` | fijo |
| `zplc://formats/sfc` | fijo |
| `zplc://formats/scene` | fijo |
| `zplc://formats/plant-map` | fijo |
| `zplc://formats/scenario` | fijo |
| `zplc://project/source/{name}` | plantilla |
| `zplc://project/scenario/{scenarioId}` | plantilla |
| `zplc://runtime/trace/{scenarioId}` | plantilla |
| `zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}` | plantilla |

## El detalle de una expectativa fallida

Con `--json` (y en las herramientas MCP `tests_run` y `scenario_run`) el resultado tiene un `preview` con una entrada por escenario en `scenarios`, y cada entrada lista sus expectativas en `assertions`: `kind`, `passed` y, cuando la tiene, `atMs`. Una expectativa que falló lleva además dos campos opcionales. Una expectativa que pasó nunca los lleva, y una ejecución en la que todas las expectativas pasaron se informa exactamente como antes. Los valores son los valores crudos de la ejecución: `true` o `false` para una señal, y para un hecho de la planta un número o un rango `{ min, max }`, sin formato, redondeo, unidad ni traducción. Solo el `preview` lleva estos campos: el archivo de traza y su hash no cambian.

| Campo | Significado |
| --- | --- |
| `index` | La posición de la expectativa en la lista `expectations` del archivo del escenario, contada desde 0. |
| `checks` | Las señales de la condición de la expectativa, como máximo 8. Cada una tiene `signal`, `expected` (el valor que el escenario pide: `true` o `false`, o para un hecho de la planta un número o un rango `{ min, max }`) y `observed` (el valor de la muestra registrada en `atMs`, un booleano o para un hecho de la planta un número; ausente cuando la señal no está en la traza). |

{/* <<< END GENERATED: reference/mcp <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
