---
slug: /guides/ai-and-mcp
id: ai-and-mcp
title: Use an AI assistant and MCP safely
sidebar_label: AI and MCP
description: 'Give an AI assistant read access to one project through the local MCP server, what it can ask for, what it can never do, and how to review what it proposes.'
tags: [how-to, ai, mcp, safety]
---

# Use an AI assistant and MCP safely

`zplc-mcp` is a local server of the Model Context Protocol. It lets an AI assistant inspect one project, read the source of its programs, compile it, run its scenario tests and read the evidence, so the assistant works from what the build and the simulator say and not from a guess. It runs on your computer and talks to the assistant over standard input and output. It opens no network port and no serial port.

:::danger The assistant cannot touch a machine
No tool of the server flashes a board, deploys a program, forces a value, starts or stops a device, opens a serial port or runs a shell (AGENTS.md rule 8). Those actions stay in ZPLC, where a person chooses them. The only tool that is not read-only, `firmware_build`, runs a local cross-build and stops there.
:::

## What the assistant may and may not do

| The assistant may                                                          | The assistant may not                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Read the saved source of your programs and a summary of the project        | Read unsaved editor content, or any file outside the project folder    |
| Validate the project file, compile, list symbols                           | Write outside the project, write a credential, delete or rename a file |
| Write a program, `zplc.json`, a scenario or the plant files, checked first | Write while a lesson hides its solutions                               |
| Run your scenario tests on the simulator and read the trace                | Flash, deploy, force, run, stop, step a device, recover a board        |
| Read which lessons of the course you passed (a read-only resource)         | Change your progress, or unlock a lesson                               |
| Describe the boards of the manifest, with no probe of hardware             | Open a serial port, a socket or a shell                                |

AI inside ZPLC follows the same boundary and has its own data rules: see [AI, privacy and human review](../ide/ai-privacy.md).

## 1. Start the server for one folder

The server serves the one folder you name, and nothing outside it. The folder is the absolute path of a ZPLC project, a real directory and not a link. A start that fails says why on standard error and exits with 1, or with 2 when the command line is wrong:

| What went wrong                       | Message                                                                                         | Exit |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| No arguments                          | `ZPLC MCP: no arguments given; start it with a project folder.` and the usage                   | 2    |
| A relative path                       | `ZPLC MCP: the workspace folder must be an absolute path: <path>`                               | 2    |
| A folder that does not exist          | `ZPLC MCP: <path> does not exist`                                                               | 1    |
| A folder that is not a project        | `ZPLC MCP: <path> is not a ZPLC project: it has no zplc.json`                                   | 1    |
| A bad `--repository` or `--user-data` | `ZPLC MCP: repository is unavailable: <cause>` or `ZPLC MCP: user data is unavailable: <cause>` | 1    |

`zplc-mcp --version` prints the version and exits with 0.

`zplc-mcp --workspace <folder> --self-check` prints a JSON report: the folder, the project name, the tool and resource counts, the protocol revisions served, whether the host simulator `zplc_runtime` is found, the boundary of AGENTS.md rule 8, and each problem with its cause and next step. It exits with 0 when the server is ready and 1 when not. It only looks at files: it starts no server, process, board or port. The `server_self_check` tool answers the same, naming the project instead of the folder.

```bash
zplc-mcp --workspace /home/me/plants/line-3
```

From a checkout, the same server runs from the package of the ZPLC application:

```bash
bun run --cwd=packages/zplc-ide mcp --workspace /home/me/plants/line-3
```

The releases after 2.0.0-rc.3 carry `zplc-mcp-<version>-<system>-<architecture>` as a standalone executable, unsigned, to verify as the [install page](../getting-started/install.md#verify-the-download) says. Two options add what a project folder cannot hold:

- `--repository <directory>` is a checkout of ZPLC. `boards_list`, `toolchain_inspect` and `firmware_build` need it. Without it they answer `MCP_CAPABILITY_UNAVAILABLE`.
- `--user-data <directory>` is the folder where ZPLC keeps your lesson progress. The `zplc://course/progress` resource needs it, and `zplc://lesson/current` reads from it whether solutions are hidden.

## 2. Connect an assistant

Most clients that run a local MCP server take a command and its arguments in a configuration entry. This entry has the form such clients read. The file and its place belong to the client, not to ZPLC.

```json
{
  "mcpServers": {
    "zplc": {
      "command": "zplc-mcp",
      "args": ["--workspace", "/home/me/plants/line-3"]
    }
  }
}
```

### One action in the app

Open the project, then open **Preferences** and find **Connect an AI agent (MCP)**, or run **Connect an AI agent (MCP)** from the command palette, which opens that panel. Choose **Claude Code**, **Cursor** or **VS Code**. The panel shows the exact file and the exact text it would write, all inside the project folder:

| Client      | File               | Key               |
| ----------- | ------------------ | ----------------- |
| Claude Code | `.mcp.json`        | `mcpServers.zplc` |
| Cursor      | `.cursor/mcp.json` | `mcpServers.zplc` |
| VS Code     | `.vscode/mcp.json` | `servers.zplc`    |

- **Write config** asks you to confirm, then writes only the text you were shown. Your other entries stay. If the file already exists, the previous file is kept next to it as `<file>.bak`; the first backup is never overwritten, the next ones are `.bak.1`, `.bak.2` and so on, up to ten, and ZPLC refuses to write when ten exist. It also refuses to write when `.cursor` or `.vscode` is a link, so a write never leaves the project folder, and the new one is written to a temporary file and renamed, so a failure never leaves half a file. A file that is not valid JSON (comments included) is refused and left as it is.
- **Copy command** copies the line `claude mcp add zplc -- zplc-mcp --workspace "<folder>"` for Claude Code, or the entry snippet for Cursor and VS Code.
- The entry holds the `zplc-mcp` command, `--workspace` and, when ZPLC knows it, `--user-data`. It never holds a key or a secret. ZPLC finds `zplc-mcp` itself: first `ZPLC_MCP_BIN`, which must be the full path of an executable file, then the folders of your `PATH`. The entry holds the full path it found. `zplc-mcp` is a separate release asset, not part of the app: download the one for your system. When ZPLC cannot find it, the panel says so and keeps **Write config** and **Run self-check** off until you set `ZPLC_MCP_BIN` or add its folder to the `PATH` and start ZPLC again.
- **Run self-check** runs `zplc-mcp --self-check` on the open project and shows whether it is ready, with the cause and the next step of each problem. It reads files only: it does not touch a device, a serial port or the network.

The panel works on the folder that is open, so for a lesson it fills in the lesson folder for you, `<userData>/learn-workspaces/<lessonId>`, and the `--user-data` folder. That folder is `~/.config/zplc` on Linux, `~/Library/Application Support/zplc` on macOS and `%APPDATA%\zplc` on Windows.

### The protocol revision

The server serves both eras of the protocol, as the SDK it uses does by default. A client of revision 2026-07-28 has no `initialize` step: it names the revision and its capabilities in the `_meta` of every request.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

A client of the 2025 era, such as 2025-11-25, opens with `initialize`, then `notifications/initialized`, and lists the tools as before. The server answers with the revision the client asked for. A request that names no revision is served as a request of that older era.

## 3. Ask for evidence

Ask for what a tool returns, so every claim of the assistant has a result behind it.

| Ask                                       | Tool or resource                                                    | What comes back                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "Is this project file valid?"             | `project_validate`                                                  | `ok` and the diagnostics                                                                                  |
| "Does it compile, and what does it need?" | `compiler_check`, `symbols_list`                                    | The size of the program, the diagnostics, the public symbols                                              |
| "Do its scenarios pass?"                  | `tests_run`, `scenario_run`                                         | One result per scenario, with the digest of its trace                                                     |
| "What happened at cycle 40?"              | `trace_get`, `runtime_snapshot`                                     | A bounded, sanitised trace of a recorded run                                                              |
| "Show me the program"                     | `zplc://project/programs`, `zplc://project/source/{name}`           | The list of the programs of `src` with their language, and the text and language of one of them           |
| "Which boards are described?"             | `boards_list`                                                       | The boards of the manifest and their level, with no probe of hardware                                     |
| "Which lessons have I passed?"            | `zplc://course/progress`                                            | The lessons passed, how many are done and how many exist                                                  |
| "What does the plant offer?"              | `plant_inspect`, `zplc://project/scene`, `zplc://project/plant-map` | The parts of the scene, the signals it offers, the plant map and the map points the program does not have |
| "Which scenarios are there?"              | `scenarios_list`, `zplc://project/scenario/{scenarioId}`            | Each scenario with its timing and expectations, and the whole file of one                                 |
| "What does this lesson ask?"              | `zplc://lesson/current`                                             | The goal, objectives and hints of the lesson, never its solution                                          |
| "How is a Ladder file written?"           | `zplc://formats/{ld,fbd,sfc,scene,plant-map,scenario}`              | The JSON Schema, the accepted values and worked examples of the format                                    |

[The MCP reference](../reference/mcp.md) lists all 26 tools and 26 resources. Every result states its `evidenceLevel` once, and the server gives a client instructions on how to work.

- **Program resources.** Both are read-only. They return the saved source of a program in any of the five languages, within the size limits of the project reader. `zplc://project/source/{name}` takes the file name as written in the URI (a space is `%20`). A name that is not in `src` answers `MCP_NOT_FOUND`, a name with a separator answers `MCP_INVALID_ARGUMENTS`, and a project the reader refuses answers `MCP_WORKSPACE_UNREADABLE`.
- **Course progress.** The resource reads the progress file ZPLC keeps and answers which lessons are passed. It has no operation that writes progress, and a progress file of the first release is migrated in memory only, never written back. Without `--user-data` it answers `MCP_CAPABILITY_UNAVAILABLE`.
- **Lesson.** `zplc://lesson/current` answers the lesson of a workspace that ZPLC keeps under `learn-workspaces`: its goal, objectives and hints, never its solution. Whether solutions are hidden is read from the classroom setting in `--user-data`; a missing or unreadable setting, or no `--user-data`, means hidden, and no tool or argument changes it.
- **Bounded answers.** The scene, the map, the scenarios and the lesson are cut to at most 64 items per list, 256 characters per text and 8 levels of nesting, and say `truncated: true` when something was cut.
- **Traces.** `trace_get` with only `scenarioId` answers the whole recorded trace, as in 2.0; a trace over 512 KiB answers `MCP_OUTPUT_LIMIT` with the modes that read it. `mode: "changes"` answers the first sample, every change, the samples of failed expectations and the last sample, and a change sample carries only the values that changed. Every change of a program signal counts, REAL values included; a `fact:` plant fact that is not a whole number, such as a box position, counts only when `signals` names it; `mode: "window"` answers every sample from `fromMs` or `fromSample` to `toMs`, `limit` at a time, with `nextCursor` for the next page (a page that would pass 512 KiB is cut to the samples that fit); `mode: "summary"` answers each signal's first and last value, its transitions, when it was true and the range of a number. These modes also return the inputs the run wrote (`includeInputs`, on by default), the raw plant facts, and the program variables or block members `watchSignals` names (`Program.T1.ET`), read after each step. The recorded trace and its `traceSha256` stay the same whichever mode you ask. A wrong `scenarioId`, signal or watched name answers `MCP_NOT_FOUND` with `validValues`, and a recorded trace over 16 MiB answers `MCP_TRACE_TOO_LARGE` with a next step.
- **Scenarios.** A scenario runs on the simulator of your computer, so its result is evidence of a simulated run, not of the plant.
- **Writing project files.** `workspace_write` creates or replaces one to eight files of the project: a program of `src` in any of the five languages, `zplc.json`, a scenario of `tests`, `scene.json` and `plant-map.json`. `workspace_check_write` runs the same check and writes nothing. A file is written only when it loads as ZPLC loads it and the project still loads; a refused batch writes nothing, and each diagnostic names the file, the place and the accepted values. A Ladder, FBD or SFC file is stored in the editors' stable form. The server refuses a path outside the project, a `..`, an absolute path, a symbolic link, any other file, and a credential in `zplc.json` (`MCP_SENSITIVE_FIELD`, which names the field and never its value). Each file is written to a temporary file beside it and renamed, so a reader sees the old file or the new one; a batch of several files is not atomic as a set, and when a rename fails the files already written are put back. No tool deletes or renames a file: do that in ZPLC or on disk. In a lesson whose solutions are hidden, `workspace_write` is refused (`MCP_SOLUTIONS_HIDDEN`).
- **Debugging in the private simulation.** `debug_session_start` compiles the saved project and starts a simulation on your computer that the server runs for the assistant alone, at 0 ms on a virtual clock, with the scene and the plant map when the project has both. It answers a `sessionId`, and the other five tools take it: `debug_breakpoints` stops the program at a line of ST or IL, or at a rung or cell of LD, a block of FBD, or a step, transition or action of SFC (`rung:r1`, `block:ton_1`, `step:s1`); a stop happens in the middle of the scan, at that place. `debug_step` runs a number of scans, a time, or until a breakpoint; `debug_set_inputs` sets program inputs by name, or operates a panel signal, emits an item or faults a part of the scene; `debug_inspect` reads variables, the members of a function block such as a `TON`, the active SFC steps, and the plant signals and facts, always by name, never by address. An input the scene drives is refused (`MCP_DEBUG_INPUT_OWNED_BY_PLANT`), and a wrong file, place or name answers `MCP_NOT_FOUND` with `validValues`. At most two sessions are open at once (`MCP_DEBUG_SESSION_LIMIT` names them); a session is stopped after 300 s without a call, and every session stops when the client disconnects, with its process and its temporary files. Breakpoints need a project with one task. This simulation never reaches the simulation you run in ZPLC, a board or a serial port (AGENTS.md rule 8), and its results are host evidence, not evidence of hardware. In a lesson the session runs your own program, never the solution.

## 4. Review what the assistant proposes

1. No tool or resource of the server changes your project: every tool is read-only, and `firmware_build` builds in an ephemeral place. When the client of the assistant edits files, read the change as a difference before you keep it.
2. Compile and run the scenarios yourself, or ask for `compiler_check` and `tests_run` and read the diagnostics.
3. For a change that moves an output, read the [safety page](../safety-and-limitations.md) and ask for `safety_check`, which checks the coverage of the incompatible outputs the project declares, before the change goes near a board.
4. Put a program on a board only from ZPLC, where a person chooses the action.

AI inside ZPLC reads the open program and a project summary, and proposes a change set of up to four files that you review and save. It also proposes editor actions and display settings that you apply with a click. A multi-file save has no rollback. All of that is on [AI, privacy and human review](../ide/ai-privacy.md).

## What is verified, and what is not

| Part                                                                                                                                                                                                                                            | Verified                                                                                                                                                                                      | Level |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| The server lists 15 tools when asked; `project_validate`, `compiler_check` and `tests_run` pass on a bundled project; `boards_list` answers with `--repository`; a client that opens with `initialize` of revision 2025-11-25 lists the tools   | Run by hand with a script that sends the requests over standard input and output, through `bun run --cwd=packages/zplc-ide mcp`, on the bundled project `pico_blinky_ton`; not repeated by CI | Host  |
| The built executable starts and lists its tools the way a 2026-07-28 client asks                                                                                                                                                                | The release build starts the executable and counts the tools                                                                                                                                  | Host  |
| No tool reaches a device, a socket or a serial port                                                                                                                                                                                             | A test lists the registered tools and resources of the live server and traps every socket and serial entry point                                                                              | Host  |
| The two program resources return the text and language of each of the five languages, and refuse a name that is not a program of `src`, a link and an oversized file; only `workspace_write` writes, inside the project                         | `packages/zplc-ide/src/mcp/server.test.ts` and `deviceLink.test.ts`                                                                                                                           | Host  |
| `workspace_write` writes the five languages, `zplc.json`, a scenario, a scene and a plant map only when they pass `workspace_check_write`, leaves a refused file byte for byte, and refuses a path outside the project, a link and a credential | `packages/zplc-ide/src/mcp/workspaceWrite.test.ts`                                                                                                                                            | Host  |
| The course resource reports passed lessons and writes nothing                                                                                                                                                                                   | `packages/zplc-ide/src/mcp/server.test.ts`                                                                                                                                                    | Host  |
| A named assistant product works with the entry above                                                                                                                                                                                            | Not verified: no client product was run for this page                                                                                                                                         | None  |
| An assistant's change is correct                                                                                                                                                                                                                | Never implied: only the build and the scenarios say so                                                                                                                                        | None  |

## See also

- [The MCP server reference](../reference/mcp.md) and [Use the command line](./command-line.md).
- [AI, privacy and human review](../ide/ai-privacy.md).
- [Safety and limitations](../safety-and-limitations.md).
