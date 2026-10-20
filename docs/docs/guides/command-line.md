---
slug: /guides/command-line
id: command-line
title: Use the command line
sidebar_label: Command line
description: "Validate, build and test a project from a terminal or a CI job with zplc-cli, the same operations the ZPLC application and the MCP server use."
tags: [how-to, cli, ci]
---

# Use the command line

`zplc-cli` runs the operations of the ZPLC tool API from a terminal: the same ones
that the ZPLC application and the MCP server use, with the same result. Use it in a script or in a
continuous-integration job to validate a project, build it and run its scenario
tests without opening the ZPLC application.

:::note What it never does
`zplc-cli` never flashes a board, deploys a program, forces a value or starts or
stops a device. Its `firmware-build` command is a local cross-build, and nothing
more.
:::

## Get it

- **From a release:** the releases after 2.0.0-rc.3 carry `zplc-cli-<version>-<system>-<architecture>`
  as a standalone executable for Linux, macOS and Windows on x64 and arm64. It needs
  no Node.js, Bun or checkout. It is not signed: verify it as the
  [install page](../getting-started/install.md#verify-the-download) says.
- **From a checkout:** `bun run setup` once, then `bun run simulate <project>` runs the
  tests of a project, and `bun packages/zplc-ide/src/cli/index.ts <command>` runs any
  command.

`zplc-cli --version` prints the version, and `zplc-cli --help` lists every command.

## Check a project

Each command takes the folder of a project. This is what the commands print for the
example `blinky_st`:

```bash
zplc-cli inspect packages/zplc-ide/projects/blinky_st
zplc-cli validate packages/zplc-ide/projects/blinky_st
zplc-cli check packages/zplc-ide/projects/blinky_st
```

Each prints its name and `passed` (`inspect passed`, `validate passed`, `check passed`)
and exits with 0. `inspect` reads the project file and lists its tasks and sources,
`validate` checks the project file and its sources without compiling, and `check`
compiles and discards the program, so that only the build diagnostics remain.

## Build

```bash
zplc-cli compile packages/zplc-ide/projects/blinky_st --output blinky.zplc
zplc-cli compile packages/zplc-ide/projects/blinky_st --emit asm
```

The first command writes the program and prints `compile passed (contract draft 6)`:
the number is the draft of the binary contract, which a runtime of another draft
refuses. The second prints the assembly listing instead of the program, or writes it
to `--output`. A diagnostic names the file, the line and the column.

## Test

```bash
zplc-cli test packages/zplc-ide/projects/blinky_st
zplc-cli scenario-run packages/zplc-ide/projects/blinky_st BlinkyST
```

`test` runs every scenario of the project on the native runtime, headless and on a
virtual clock, and prints `test passed` or the failing assertion. `scenario-run` runs
one scenario by its `id`. The runtime must be built (`bun run build:runtime`) or named
by `ZPLC_NATIVE_SIM_BIN`. [Scenario tests](./scenario-tests.md) shows how to write one.

## Other commands

| Command | What it does |
| --- | --- |
| `zplc-cli safety-check <workspace>` | Checks that every pair of incompatible outputs declared in `zplc.json` has a scenario that asserts it never happens |
| `zplc-cli symbols <workspace>` | Lists the public symbols of the project |
| `zplc-cli migrate-preview <workspace>` | Shows what migrating a version 1 project file to version 2 would change |
| `zplc-cli migrate <workspace> --output <file>` | Writes the version 2 project file that the migration produces |
| `zplc-cli toolchain-inspect <repository>` | Reports which firmware build prerequisites a checkout has |
| `zplc-cli firmware-build <repository> <ide-id>` | A local cross-build of the firmware of one board, named by its identifier in the ZPLC application |

## In a script

Add `--json` for one line of JSON with the evidence of the operation, and use the exit
code, which is 0 on success, 1 when the command failed or its arguments were invalid,
124 when it timed out and 130 when it was cancelled:

```bash
zplc-cli check . --json && zplc-cli test . --json
```

The [command line reference](../reference/cli.md) lists every command, option and exit
code, read off the source.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| The commands print what this page says and exit as it says | The commands were run on the example for this page; unit tests cover each operation | Host |
| A scenario gives the same result from the command line, the ZPLC application and the MCP server | A test runs every bundled project, each scenario by itself, through the three | Host |
| The standalone executable runs with no Bun, Node or checkout | A test builds it and runs it with no JavaScript runtime on the path | Host |
| `firmware-build` produces an image that runs | Not tested: it is a cross-build | None |

## See also

- [Command line reference](../reference/cli.md) and the [MCP server](../reference/mcp.md).
- [Write and run scenario tests](./scenario-tests.md).
