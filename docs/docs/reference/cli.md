---
title: "Command line"
sidebar_label: "Command line"
description: "Every command, option and exit code of zplc-cli, read off its source."
tags: [reference, generated]
---

# Command line

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/cli. Do not edit. >>> */}

`zplc-cli` is the command line of the ZPLC tool API, the same operations that Studio and the [MCP server](./mcp.md) use: 12 commands. It never flashes, deploys, forces or runs a device. Every command takes a workspace folder (or, for a build, a repository root); `--json` prints one line of JSON, with the evidence of the operation, instead of text. Each diagnostic of a failed build has a `code` (the list is the [diagnostic codes](./diagnostic-codes.md)), its message, where it starts (`line`, `column`), where it ends (`endLine`, `endColumn`) and its file (`path`); the text output ends the line with the code in brackets.

This table is read off the source file `packages/zplc-ide/src/cli/index.ts`; its text is the source's own, so it is the same in English and in Spanish.

## Commands

| Command | Usage | Description |
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

## Options

| Option | Description |
| --- | --- |
| `-h, --help` | Show this help |
| `-v, --version` | Show version |
| `-j, --json` | Output one JSON result line |
| `-o, --output <f>` | Write the requested artifact |
| `-l, --language <l>` | Source language (ST, IL, LD, FBD, SFC) |
| `--emit asm` | Print the assembly listing of the build, or write it to --output, instead of the artifact |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | the command failed, or its arguments were invalid |
| `124` | timed out (FIRMWARE_BUILD_TIMEOUT, TEST_TIMEOUT) |
| `130` | cancelled (FIRMWARE_BUILD_CANCELLED, TEST_CANCELLED) |

Firmware builds are local POSIX ephemeral cross-builds only: they do not flash, deploy, or qualify hardware.

{/* <<< END GENERATED: reference/cli <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
