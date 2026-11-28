---
title: "MCP tools and resources"
sidebar_label: "MCP server"
description: "Every tool and resource of the local zplc-mcp server, read off its source."
tags: [reference, generated]
---

# MCP tools and resources

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/mcp. Do not edit. >>> */}

`zplc-mcp` is a local server of the Model Context Protocol over standard input and output. It exposes 26 tools and 26 resources for one workspace. Every tool is read-only except `firmware_build`, `workspace_write`, `debug_session_start`, `debug_session_stop`, `debug_set_inputs`, `debug_breakpoints` and `debug_step`: `firmware_build` runs a local ephemeral cross-build, `workspace_write` writes project files inside the workspace after the check of `workspace_check_write`, and never deletes or renames one, and the `debug_` tools start, step and stop a host simulation that the server runs for the agent alone. No tool flashes, deploys, forces, opens a serial port or a shell, or starts or stops a program on a device or in a session a person runs. The results are evidence of a host run, not of hardware.

This table is read off the source file `packages/zplc-ide/src/mcp/server.ts`; its text is the source's own, so it is the same in English and in Spanish.

## Starting the server

```text
zplc-mcp --workspace <absolute-path-of-a-project> [--repository <absolute-path-of-a-checkout>] [--user-data <absolute-path-of-a-folder>] [--self-check]
```

## Protocol revision

The server serves the 2025 handshake (`initialize`) as well as revision 2026-07-28: its entry point starts the transport with `legacy: 'serve'`.

## Fields of a reply

| Field | Meaning |
| --- | --- |
| `evidenceLevel` | Stated once at the top of a reply: what kind of run the result is evidence of. The repeated note and scope texts of 2.0 are gone. |
| `execution` | The record of the job, as in 2.0: `schemaVersion`, `jobId`, `actor`, `permission`, `operation`, `outcome`, `startedAt`, `finishedAt`. It is unchanged in 2.1 and it is deprecated: a later release may remove it. |
| `audit` | Beside `execution` in every reply that carries it: `jobId` and `permission`, the same as in `execution`, and `durationMs`, the milliseconds the job took. `workspace_write` and `workspace_check_write` answer `audit` with the permission `project:write` or `project:read`, and the `debug_` tools with `tests:run`. |
| `validValues` | In a refusal of a wrong name (a scenario, a signal, a mode, a file, a session): the valid names sorted alphabetically, at most 32, with `more` counting the rest. The refusal also carries `error`, `message` and `nextStep`. |

## Tools

| Tool | Title | Input | Read only | Description |
| --- | --- | --- | --- | --- |
| `project_inspect` | Inspect project |   | yes | Read the manifest summary: name, version, tasks, target and the programs of src with their language. Call it first. |
| `project_validate` | Validate project |   | yes | Check that zplc.json, the tasks and each LD, FBD and SFC file load; a failure names the place and the accepted values. |
| `compiler_check` | Check compiler |   | yes | Compile every program in memory: pass or fail, the code size and the located diagnostics. Use it after each edit. |
| `compiler_compile` | Compile workspace |   | yes | Compile the project to .zplc bytecode and answer its digest, size and diagnostics; the bytes stay on the server. |
| `symbols_list` | List symbols |   | yes | List the compiled variables with type, region and address; use the exact names in scenarios and plant maps. |
| `safety_check` | Check declared interlocks |   | yes | Check that each incompatible output pair of zplc.json is covered by a NEVER expectation of a scenario in tests. |
| `tests_run` | Run workspace tests |   | yes | Run every scenario of tests on the host simulator: pass or fail per scenario, the failed checks, a trace digest. |
| `scenario_run` | Run one scenario | `scenarioId` | yes | Run one scenario, named by its id from scenarios_list, on the host simulator and answer its result and failed checks. |
| `simulation_start` | Start recorded simulation | `scenarioId` | yes | Run one scenario on the host simulator and answer its first recorded sample and trace digest; no session is kept. |
| `simulation_step` | Step recorded simulation | `scenarioId`, `cursor`, `traceSha256` | yes | Answer the recorded sample after cursor of a scenario run, pinned by its trace digest, to walk a run step by step. |
| `runtime_snapshot` | Read recorded snapshot | `scenarioId`, `cursor`, `traceSha256` | yes | Answer one recorded sample of a scenario run at cursor, pinned by its trace digest; a recording, not a live runtime. |
| `trace_get` | Get recorded trace | `scenarioId`, `mode`, `signals`, `includeInputs`, `watchSignals`, `fromMs`, `toMs`, `fromSample`, `limit` | yes | Run one scenario and answer its changes by default, a window, a summary, or mode full: the whole trace. |
| `boards_list` | List board profiles |   | yes | List the boards the repository declares and their validation level, without probing any hardware. Needs --repository. |
| `toolchain_inspect` | Inspect toolchain |   | yes | Check the local tools a firmware build needs (west, CMake, Ninja, Zephyr SDK) and which are ready. Needs --repository. |
| `firmware_build` | Build firmware | `ideId` | no | Run a local ephemeral cross-build of the runtime for one board, answer the image digest; it never flashes or deploys. |
| `plant_inspect` | Inspect plant scene and map | `sceneFile`, `mapFile` | yes | Read the plant scene, the signals it offers, the plant map and the map points the compiled program does not have. |
| `scenarios_list` | List scenarios |   | yes | List every scenario of tests with its id, timing, scene and a summary of each expectation; use the ids to run them. |
| `server_self_check` | Check this server |   | yes | Answer what this server serves: project name, optional folders, simulator, protocols, counts and the boundary. |
| `workspace_check_write` | Check a write | `files`, `compileCheck` | yes | Check 1 to 8 files to create or replace as workspace_write checks them; it writes nothing and names each problem. |
| `workspace_write` | Write project files | `files`, `requireCompile`, `expectedBaseSha256` | no | Check and write 1 to 8 files of src, tests, zplc.json, scene.json, plant-map.json; never deletes or renames. |
| `debug_session_start` | Start a private debug session | `withScene`, `sceneFile`, `mapFile` | no | Compile the project and start a host simulation private to you at 0 ms, with the scene; answers a sessionId. |
| `debug_session_stop` | Stop a private debug session | `sessionId` | no | Stop a private debug session: its simulator process ends, its plant and temporary state are removed. |
| `debug_set_inputs` | Set inputs of a private session | `sessionId`, `inputs`, `plantActions` | no | Set program inputs (IPI) by name, or operate, emit or fault in the scene, of a private debug session before stepping. |
| `debug_breakpoints` | Breakpoints of a private session | `sessionId`, `action`, `locations` | no | List, set, add, remove or clear breakpoints of a private session by file and line (ST, IL) or element (LD, FBD, SFC). |
| `debug_step` | Step a private session | `sessionId`, `mode`, `cycles`, `durationMs`, `maxCycles`, `watch`, `includeFacts` | no | Run a private session by cycles, by ms of virtual time, or continue until a breakpoint stops it mid-scan. |
| `debug_inspect` | Inspect a private session | `sessionId`, `signals`, `functionBlocks`, `includeSfc`, `includePlant` | yes | Read a private session by name: variables, function block members, active SFC steps, plant signals and facts. |

## Resources

| Resource | Kind |
| --- | --- |
| `zplc://project/manifest` | fixed |
| `zplc://project/programs` | fixed |
| `zplc://project/symbols` | fixed |
| `zplc://project/io-map` | fixed |
| `zplc://project/diagnostics` | fixed |
| `zplc://target/capabilities` | fixed |
| `zplc://runtime/trace` | fixed |
| `zplc://runtime/snapshot` | fixed |
| `zplc://course/progress` | fixed |
| `zplc://docs/evidence` | fixed |
| `zplc://docs/safety` | fixed |
| `zplc://docs/testing` | fixed |
| `zplc://project/scene` | fixed |
| `zplc://project/plant-map` | fixed |
| `zplc://project/scenarios` | fixed |
| `zplc://lesson/current` | fixed |
| `zplc://formats/ld` | fixed |
| `zplc://formats/fbd` | fixed |
| `zplc://formats/sfc` | fixed |
| `zplc://formats/scene` | fixed |
| `zplc://formats/plant-map` | fixed |
| `zplc://formats/scenario` | fixed |
| `zplc://project/source/{name}` | template |
| `zplc://project/scenario/{scenarioId}` | template |
| `zplc://runtime/trace/{scenarioId}` | template |
| `zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}` | template |

## The detail of a failed expectation

With `--json` (and in the MCP tools `tests_run` and `scenario_run`) the result has a `preview` with one entry per scenario in `scenarios`, and each entry lists its expectations in `assertions`: `kind`, `passed` and, when it has one, `atMs`. An expectation that failed also carries two optional fields. An expectation that passed never does, and a run in which every expectation passed is reported exactly as before. The values are the raw values of the run: `true` or `false` for a signal, and for a plant fact a number or a `{ min, max }` range, with no formatting, rounding, unit or translation. Only the `preview` carries these fields: the trace file and its hash do not change.

| Field | Meaning |
| --- | --- |
| `index` | The position of the expectation in the `expectations` list of the scenario file, counted from 0. |
| `checks` | The signals of the condition of the expectation, at most 8. Each one has `signal`, `expected` (the value the scenario asks for: `true` or `false`, or for a plant fact a number or a `{ min, max }` range) and `observed` (the value in the recorded sample at `atMs`, a boolean or for a plant fact a number; absent when the signal is not in the trace). |

{/* <<< END GENERATED: reference/mcp <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
