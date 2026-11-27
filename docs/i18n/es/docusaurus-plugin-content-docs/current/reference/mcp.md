---
title: "Herramientas y recursos MCP"
sidebar_label: "Servidor MCP"
description: "Cada herramienta y recurso del servidor local zplc-mcp, leídos de su fuente."
tags: [reference, generated]
---

# Herramientas y recursos MCP

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/mcp. Do not edit. >>> */}

`zplc-mcp` es un servidor local del Model Context Protocol sobre entrada y salida estándar. Expone 26 herramientas y 26 recursos para un espacio de trabajo. Todas las herramientas son de solo lectura salvo `firmware_build`, `workspace_write`, `debug_session_start`, `debug_session_stop`, `debug_set_inputs`, `debug_breakpoints` y `debug_step`: `firmware_build` ejecuta una compilación cruzada local y efímera, `workspace_write` escribe archivos del proyecto dentro del espacio de trabajo tras la verificación de `workspace_check_write`, y nunca borra ni renombra uno, y las herramientas `debug_` arrancan, avanzan y detienen una simulación en el host que el servidor ejecuta solo para ese agente. Ninguna herramienta graba, despliega, fuerza, abre un puerto serie o una consola, ni arranca o detiene un programa en un equipo o en una sesión que maneja una persona. Los resultados son evidencia de una ejecución en el host, no del hardware.

Esta tabla se lee del archivo fuente `packages/zplc-ide/src/mcp/server.ts`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

## Arranque del servidor

```text
zplc-mcp --workspace <absolute-path-of-a-project> [--repository <absolute-path-of-a-checkout>] [--user-data <absolute-path-of-a-folder>] [--self-check]
```

## Revisión del protocolo

El servidor atiende el apretón de manos de 2025 (`initialize`) además de la revisión 2026-07-28: su punto de entrada inicia el transporte con `legacy: 'serve'`.

## Campos de una respuesta

| Campo | Significado |
| --- | --- |
| `evidenceLevel` | Se dice una vez al inicio de una respuesta: de qué clase de ejecución es evidencia el resultado. Los textos repetidos de nota y alcance de 2.0 ya no están. |
| `execution` | El registro del trabajo, como en 2.0: `schemaVersion`, `jobId`, `actor`, `permission`, `operation`, `outcome`, `startedAt`, `finishedAt`. No cambia en 2.1 y está obsoleto: una versión posterior puede quitarlo. |
| `audit` | Junto a `execution` en cada respuesta que lo lleva: `jobId` y `permission`, iguales a los de `execution`, y `durationMs`, los milisegundos que tardó el trabajo. `workspace_write` y `workspace_check_write` responden `audit` con el permiso `project:write` o `project:read`, y las herramientas `debug_` con `tests:run`. |
| `validValues` | En el rechazo de un nombre erróneo (un escenario, una señal, un modo, un archivo, una sesión): los nombres válidos en orden alfabético, como máximo 32, con `more` que cuenta el resto. El rechazo también lleva `error`, `message` y `nextStep`. |

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
| `trace_get` | Get recorded trace | `scenarioId`, `mode`, `signals`, `includeInputs`, `watchSignals`, `fromMs`, `toMs`, `fromSample`, `limit` | sí | Run one scenario and answer its changes by default, a window, a summary, or mode full: the whole trace. |
| `boards_list` | List board profiles |   | sí | List the boards the repository declares and their validation level, without probing any hardware. Needs --repository. |
| `toolchain_inspect` | Inspect toolchain |   | sí | Check the local tools a firmware build needs (west, CMake, Ninja, Zephyr SDK) and which are ready. Needs --repository. |
| `firmware_build` | Build firmware | `ideId` | no | Run a local ephemeral cross-build of the runtime for one board, answer the image digest; it never flashes or deploys. |
| `plant_inspect` | Inspect plant scene and map | `sceneFile`, `mapFile` | sí | Read the plant scene, the signals it offers, the plant map and the map points the compiled program does not have. |
| `scenarios_list` | List scenarios |   | sí | List every scenario of tests with its id, timing, scene and a summary of each expectation; use the ids to run them. |
| `server_self_check` | Check this server |   | sí | Answer what this server serves: project name, optional folders, simulator, protocols, counts and the boundary. |
| `workspace_check_write` | Check a write | `files`, `compileCheck` | sí | Check 1 to 8 files to create or replace as workspace_write checks them; it writes nothing and names each problem. |
| `workspace_write` | Write project files | `files`, `requireCompile`, `expectedBaseSha256` | no | Check and write 1 to 8 files of src, tests, zplc.json, scene.json, plant-map.json; never deletes or renames. |
| `debug_session_start` | Start a private debug session | `withScene`, `sceneFile`, `mapFile` | no | Compile the project and start a host simulation private to you at 0 ms, with the scene; answers a sessionId. |
| `debug_session_stop` | Stop a private debug session | `sessionId` | no | Stop a private debug session: its simulator process ends, its plant and temporary state are removed. |
| `debug_set_inputs` | Set inputs of a private session | `sessionId`, `inputs`, `plantActions` | no | Set program inputs (IPI) by name, or operate, emit or fault in the scene, of a private debug session before stepping. |
| `debug_breakpoints` | Breakpoints of a private session | `sessionId`, `action`, `locations` | no | List, set, add, remove or clear breakpoints of a private session by file and line (ST, IL) or element (LD, FBD, SFC). |
| `debug_step` | Step a private session | `sessionId`, `mode`, `cycles`, `durationMs`, `maxCycles`, `watch`, `includeFacts` | no | Run a private session by cycles, by ms of virtual time, or continue until a breakpoint stops it mid-scan. |
| `debug_inspect` | Inspect a private session | `sessionId`, `signals`, `functionBlocks`, `includeSfc`, `includePlant` | sí | Read a private session by name: variables, function block members, active SFC steps, plant signals and facts. |

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
