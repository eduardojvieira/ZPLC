---
title: "Línea de comandos"
sidebar_label: "Línea de comandos"
description: "Cada comando, opción y código de salida de zplc-cli, leídos de su fuente."
tags: [reference, generated]
---

# Línea de comandos

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/cli. Do not edit. >>> */}

`zplc-cli` es la línea de comandos de la API de herramientas de ZPLC, las mismas operaciones que usan la aplicación ZPLC y el [servidor MCP](./mcp.md): 12 comandos. Nunca graba, despliega, fuerza ni pone en marcha un dispositivo. Cada comando recibe una carpeta de espacio de trabajo (o, para una compilación, la raíz del repositorio); `--json` imprime una línea de JSON, con la evidencia de la operación, en lugar de texto. Cada diagnóstico de una compilación fallida tiene un `code` (la lista son los [códigos de diagnóstico](./diagnostic-codes.md)), su mensaje, dónde empieza (`line`, `column`), dónde termina (`endLine`, `endColumn`) y su archivo (`path`); la salida de texto termina la línea con el código entre corchetes.

Esta tabla se lee del archivo fuente `packages/zplc-ide/src/cli/index.ts`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

## Comandos

| Comando | Uso | Descripción |
| --- | --- | --- |
| `inspect` | `zplc-cli inspect <workspace> --json` | Read the project file and list its tasks and sources. |
| `validate` | `zplc-cli validate <workspace> --json` | Validate the project file and its sources without compiling. |
| `check` | `zplc-cli check <workspace> --json` | Compile the project and discard the program: the build diagnostics only. |
| `safety-check` | `zplc-cli safety-check <workspace> [--json]` | Check that every pair of incompatible outputs declared in `zplc.json` is covered by the programs. |
| `symbols` | `zplc-cli symbols <workspace> [--json]` | List the public symbols of the project. |
| `migrate-preview` | `zplc-cli migrate-preview <workspace> [--json]` | Show what migrating a version 1 project file to version 2 would change. |
| `migrate` | `zplc-cli migrate <workspace> --output <manifest-v2.json> [--json]` | Write the version 2 project file that the migration produces. |
| `test` | `zplc-cli test <workspace> [--json] [--output <trace.json>]` | Run every scenario of the project on the native runtime and report each expectation. |
| `scenario-run` | `zplc-cli scenario-run <workspace> <scenario-id> [--json] [--output <trace.json>]` | Run one scenario by its identifier. |
| `toolchain-inspect` | `zplc-cli toolchain-inspect <zplc-repository-root> [--json]` | Report which firmware build prerequisites are present in a repository checkout. |
| `firmware-build` | `zplc-cli firmware-build <zplc-repository-root> <ide_id> [--json]` | Run a local, ephemeral cross-build of the firmware of one board; it never flashes or deploys. |
| `compile` | `zplc-cli compile <workspace\|source-file> [--json] [--output <file>] [--language ST\|IL\|LD\|FBD\|SFC]` | Compile a project or one source file to a program, or to its assembly listing with `--emit asm`. |
| `compile` | `zplc-cli compile <workspace\|source-file> --emit asm [--output <file>]` | Compile a project or one source file to a program, or to its assembly listing with `--emit asm`. |

## Opciones

| Opción | Descripción |
| --- | --- |
| `-h, --help` | Show this help |
| `-v, --version` | Show version |
| `-j, --json` | Output one JSON result line |
| `-o, --output <f>` | Write the requested artifact |
| `-l, --language <l>` | Source language (ST, IL, LD, FBD, SFC) |
| `--emit asm` | Print the assembly listing of the build, or write it to --output, instead of the artifact |

## Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | success |
| `1` | the command failed, or its arguments were invalid |
| `124` | timed out (FIRMWARE_BUILD_TIMEOUT, TEST_TIMEOUT) |
| `130` | cancelled (FIRMWARE_BUILD_CANCELLED, TEST_CANCELLED) |

Firmware builds are local POSIX ephemeral cross-builds only: they do not flash, deploy, or qualify hardware.

## El detalle de una expectativa fallida

Con `--json` (y en las herramientas MCP `tests_run` y `scenario_run`) el resultado tiene un `preview` con una entrada por escenario en `scenarios`, y cada entrada lista sus expectativas en `assertions`: `kind`, `passed` y, cuando la tiene, `atMs`. Una expectativa que falló lleva además dos campos opcionales. Una expectativa que pasó nunca los lleva, y una ejecución en la que todas las expectativas pasaron se informa exactamente como antes. Los valores son los valores crudos de la ejecución, `true` o `false`, sin formato, redondeo, unidad ni traducción. Solo el `preview` lleva estos campos: el archivo de traza y su hash no cambian.

| Campo | Significado |
| --- | --- |
| `index` | La posición de la expectativa en la lista `expectations` del archivo del escenario, contada desde 0. |
| `checks` | Las señales de la condición de la expectativa, como máximo 8. Cada una tiene `signal`, `expected` (el valor que el escenario pide: `true` o `false`, o para un hecho de la planta un número o un rango `{ min, max }`) y `observed` (el valor de la muestra registrada en `atMs`, un booleano o para un hecho de la planta un número; ausente cuando la señal no está en la traza). |

{/* <<< END GENERATED: reference/cli <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
