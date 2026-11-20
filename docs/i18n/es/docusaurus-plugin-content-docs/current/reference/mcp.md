---
title: "Herramientas y recursos MCP"
sidebar_label: "Servidor MCP"
description: "Cada herramienta y recurso del servidor local zplc-mcp, leídos de su fuente."
tags: [reference, generated]
---

# Herramientas y recursos MCP

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/mcp. Do not edit. >>> */}

`zplc-mcp` es un servidor local del Model Context Protocol sobre entrada y salida estándar. Expone 15 herramientas y 15 recursos para un espacio de trabajo. Todas las herramientas son de solo lectura salvo `firmware_build`, que ejecuta una compilación cruzada local y efímera: ninguna herramienta graba, despliega, fuerza, arranca, detiene ni abre un puerto serie o una consola. Los resultados son evidencia de una ejecución registrada en el host, no del hardware.

Esta tabla se lee del archivo fuente `packages/zplc-ide/src/mcp/server.ts`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

## Arranque del servidor

```text
zplc-mcp --workspace <absolute-real-directory> [--repository <absolute-real-directory>] [--user-data <absolute-real-directory>]
```

## Revisión del protocolo

El servidor habla la revisión 2026-07-28 del protocolo y ninguna anterior: su punto de entrada inicia el transporte con `legacy: 'reject'`. Un cliente nombra la revisión y sus capacidades en el `_meta` de cada solicitud (`io.modelcontextprotocol/protocolVersion` y `io.modelcontextprotocol/clientCapabilities`); no hay paso `initialize`. Un `initialize` de una revisión anterior se responde con el error `-32022`, `Unsupported protocol version: <revisión>`, y `data.supported` lista `2026-07-28`. Las respuestas exactas están en [Usar un asistente de IA y MCP con seguridad](../guides/ai-and-mcp.md#la-revisión-del-protocolo).

## Herramientas

| Herramienta | Título | Entrada | Solo lectura | Descripción |
| --- | --- | --- | --- | --- |
| `project_inspect` | Inspect project |   | sí | Inspect the fixed ZPLC workspace. |
| `project_validate` | Validate project |   | sí | Validate the fixed ZPLC workspace. |
| `compiler_check` | Check compiler |   | sí | Check the fixed workspace without producing a program payload. |
| `compiler_compile` | Compile workspace |   | sí | Compile the fixed workspace and return evidence only. |
| `symbols_list` | List symbols |   | sí | List public compiler symbols for the fixed workspace. |
| `safety_check` | Check declared interlocks |   | sí | Check declared incompatible-output coverage. |
| `tests_run` | Run workspace tests |   | sí | Run deterministic native POSIX workspace tests. |
| `scenario_run` | Run one scenario | `scenarioId` | sí | Run one named deterministic workspace scenario. |
| `simulation_start` | Start recorded simulation | `scenarioId` | sí | Re-run a deterministic native POSIX scenario without retaining a session. |
| `simulation_step` | Step recorded simulation | `scenarioId`, `cursor`, `traceSha256` | sí | Return one deterministic recorded host sample with an explicit trace identity. |
| `runtime_snapshot` | Read recorded snapshot | `scenarioId`, `cursor`, `traceSha256` | sí | Read one explicit recorded host snapshot; no implicit runtime session exists. |
| `trace_get` | Get recorded trace | `scenarioId` | sí | Return a bounded, sanitized deterministic native POSIX trace. |
| `boards_list` | List board profiles |   | sí | List declared repository board profiles without probing hardware. |
| `toolchain_inspect` | Inspect toolchain |   | sí | Inspect local firmware-build prerequisites only. |
| `firmware_build` | Build firmware | `ideId` | no | Run a local ephemeral cross-build only; never flash or deploy. |

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
| `zplc://project/source/{name}` | plantilla |
| `zplc://runtime/trace/{scenarioId}` | plantilla |
| `zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}` | plantilla |

## El detalle de una expectativa fallida

Con `--json` (y en las herramientas MCP `tests_run` y `scenario_run`) el resultado tiene un `preview` con una entrada por escenario en `scenarios`, y cada entrada lista sus expectativas en `assertions`: `kind`, `passed` y, cuando la tiene, `atMs`. Una expectativa que falló lleva además dos campos opcionales. Una expectativa que pasó nunca los lleva, y una ejecución en la que todas las expectativas pasaron se informa exactamente como antes. Los valores son los valores crudos de la ejecución, `true` o `false`, sin formato, redondeo, unidad ni traducción. Solo el `preview` lleva estos campos: el archivo de traza y su hash no cambian.

| Campo | Significado |
| --- | --- |
| `index` | La posición de la expectativa en la lista `expectations` del archivo del escenario, contada desde 0. |
| `checks` | Las señales de la condición de la expectativa, como máximo 8. Cada una tiene `signal`, `expected` (el valor que el escenario pide) y `observed` (el valor de la muestra registrada en `atMs`; ausente cuando la señal no está en la traza). |

{/* <<< END GENERATED: reference/mcp <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
