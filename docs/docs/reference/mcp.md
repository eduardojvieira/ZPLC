---
title: "MCP tools and resources"
sidebar_label: "MCP server"
description: "Every tool and resource of the local zplc-mcp server, read off its source."
tags: [reference, generated]
---

# MCP tools and resources

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/mcp. Do not edit. >>> */}

`zplc-mcp` is a local server of the Model Context Protocol over standard input and output. It exposes 15 tools and 15 resources for one workspace. Every tool is read-only except `firmware_build`, which runs a local ephemeral cross-build: no tool flashes, deploys, forces, starts, stops or opens a serial port or a shell. The results are evidence of a recorded host run, not of hardware.

This table is read off the source file `packages/zplc-ide/src/mcp/server.ts`; its text is the source's own, so it is the same in English and in Spanish.

## Starting the server

```text
zplc-mcp --workspace <absolute-real-directory> [--repository <absolute-real-directory>] [--user-data <absolute-real-directory>]
```

## Protocol revision

The server speaks protocol revision 2026-07-28 and no older one: its entry point starts the transport with `legacy: 'reject'`. A client names the revision and its capabilities in the `_meta` of every request (`io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities`); there is no `initialize` step. An `initialize` of an older revision is answered with error `-32022`, `Unsupported protocol version: <revision>`, and `data.supported` lists `2026-07-28`. The exact answers are in [Use an AI assistant and MCP safely](../guides/ai-and-mcp.md#the-protocol-revision).

## Tools

| Tool | Title | Input | Read only | Description |
| --- | --- | --- | --- | --- |
| `project_inspect` | Inspect project |   | yes | Inspect the fixed ZPLC workspace. |
| `project_validate` | Validate project |   | yes | Validate the fixed ZPLC workspace. |
| `compiler_check` | Check compiler |   | yes | Check the fixed workspace without producing a program payload. |
| `compiler_compile` | Compile workspace |   | yes | Compile the fixed workspace and return evidence only. |
| `symbols_list` | List symbols |   | yes | List public compiler symbols for the fixed workspace. |
| `safety_check` | Check declared interlocks |   | yes | Check declared incompatible-output coverage. |
| `tests_run` | Run workspace tests |   | yes | Run deterministic native POSIX workspace tests. |
| `scenario_run` | Run one scenario | `scenarioId` | yes | Run one named deterministic workspace scenario. |
| `simulation_start` | Start recorded simulation | `scenarioId` | yes | Re-run a deterministic native POSIX scenario without retaining a session. |
| `simulation_step` | Step recorded simulation | `scenarioId`, `cursor`, `traceSha256` | yes | Return one deterministic recorded host sample with an explicit trace identity. |
| `runtime_snapshot` | Read recorded snapshot | `scenarioId`, `cursor`, `traceSha256` | yes | Read one explicit recorded host snapshot; no implicit runtime session exists. |
| `trace_get` | Get recorded trace | `scenarioId` | yes | Return a bounded, sanitized deterministic native POSIX trace. |
| `boards_list` | List board profiles |   | yes | List declared repository board profiles without probing hardware. |
| `toolchain_inspect` | Inspect toolchain |   | yes | Inspect local firmware-build prerequisites only. |
| `firmware_build` | Build firmware | `ideId` | no | Run a local ephemeral cross-build only; never flash or deploy. |

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
| `zplc://project/source/{name}` | template |
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
