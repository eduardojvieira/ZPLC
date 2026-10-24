---
slug: /guides/ai-and-mcp
id: ai-and-mcp
title: Use an AI assistant and MCP safely
sidebar_label: AI and MCP
description: 'Give an AI assistant read access to one project through the local MCP server, what it can ask for, what it can never do, and how to review what it proposes.'
tags: [how-to, ai, mcp, safety]
---

# Use an AI assistant and MCP safely

`zplc-mcp` is a local server of the Model Context Protocol. It lets an AI assistant
inspect one project, read the source of its programs, compile it, run its scenario tests and read the evidence, so
that the assistant works from what the build and the simulator say and not from a
guess. It runs on your computer and talks to the assistant over standard input and
output; it opens no network port and no serial port.

:::danger The assistant cannot touch a machine
No tool of the server flashes a board, deploys a program, forces a value, starts or
stops a device, opens a serial port or runs a shell. Those actions stay in ZPLC,
where a person chooses them. The only tool that is not read-only, `firmware_build`,
runs a local cross-build and stops there.
:::

## 1. Start the server for one folder

The server serves the one folder that you name, and nothing outside it. The folder is
the absolute path of a ZPLC project, a real directory and not a link; on any other folder
the server prints `ZPLC MCP workspace is unavailable` and exits with 1:

```bash
zplc-mcp --workspace /home/me/plants/line-3
```

From a checkout, the same server runs from the package of the ZPLC application:

```bash
bun run --cwd=packages/zplc-ide mcp --workspace /home/me/plants/line-3
```

The releases after 2.0.0-rc.3 carry `zplc-mcp-<version>-<system>-<architecture>` as a
standalone executable, unsigned, to verify as the
[install page](../getting-started/install.md#verify-the-download) says. Two options add
what a project folder cannot hold:

- `--repository <directory>` is a checkout of ZPLC. It is what `boards_list`,
  `toolchain_inspect` and `firmware_build` need; without it they answer
  `MCP_CAPABILITY_UNAVAILABLE`.
- `--user-data <directory>` is the folder where ZPLC keeps the lesson progress, for
  the `zplc://course/progress` resource.

## 2. Connect an assistant

Most clients that run a local MCP server take a command and its arguments in a
configuration entry. This is an entry in the form that such clients read; the file
and its place are the client's, not ZPLC's:

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

### The protocol revision

The server speaks one revision of the protocol, 2026-07-28, and no older one. Its entry
point starts the transport with `legacy: 'reject'`, where the SDK it uses would serve the
2025 handshake by default; the repository records no reason for that choice, so take it
as how the server is and not as a promise. A client has no `initialize` step: it names the
revision and its capabilities in the `_meta` of every request.

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

A client that opens with `initialize` of an older revision gets this answer, and the
connection stays open for a request of the supported revision:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version: 2025-06-18",
    "data": { "supported": ["2026-07-28"], "requested": "2025-06-18" }
  }
}
```

A request that names no revision gets the same code and the message
`Unsupported protocol version: the request did not name a protocol version`. One that
names the revision and leaves out `io.modelcontextprotocol/clientCapabilities` gets
`-32602` and `Invalid _meta envelope for protocol revision 2026-07-28:
io.modelcontextprotocol/clientCapabilities: missing`. In each case the client is the one
to update; the server does not change.

## 3. Ask for evidence

Ask for what a tool returns, so that every claim of the assistant has a result behind it:

| Ask for                                   | Tool                                                      | What comes back                                                                                 |
| ----------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "Is this project file valid?"             | `project_validate`                                        | `ok` and the diagnostics                                                                        |
| "Does it compile, and what does it need?" | `compiler_check`, `symbols_list`                          | The size of the program, the diagnostics, the public symbols                                    |
| "Do its scenarios pass?"                  | `tests_run`, `scenario_run`                               | One result per scenario, with the digest of its trace                                           |
| "What happened at scan 40?"               | `trace_get`, `runtime_snapshot`                           | A bounded, sanitised trace of a recorded run                                                    |
| "Show me the program"                     | `zplc://project/programs`, `zplc://project/source/{name}` | The list of the programs of `src` with their language, and the text and language of one of them |
| "Which boards are described?"             | `boards_list`                                             | The boards of the manifest and their level, with no probe of hardware                           |

[The MCP reference](../reference/mcp.md) lists all 15 tools and 15 resources. The two program resources are read-only: they return the saved source of a program in any of the five languages, within the size limits of the project reader, and nothing in the server writes a program. `zplc://project/source/{name}` takes the file name as written in the URI (a space is `%20`); a name that is not in `src` answers `MCP_NOT_FOUND`, a name with a separator answers `MCP_INVALID_ARGUMENTS`, and a project the reader refuses answers `MCP_WORKSPACE_UNREADABLE`. A
scenario runs on the simulator of your computer, so its result is evidence of a
simulated run, not of the plant.

## 4. Review what the assistant proposes

1. No tool or resource of the server changes your project: every tool is read-only, and
   `firmware_build` builds in an ephemeral place. When the client of the assistant
   edits files, read the change as a difference before you keep it.
2. Compile it and run the scenarios yourself, or ask for `compiler_check` and
   `tests_run` and read the diagnostics.
3. For a change that moves an output, read the [safety page](../safety-and-limitations.md)
   and ask for `safety_check`, which checks the coverage of the incompatible outputs that
   the project declares, before the change goes near a board.
4. Put a program on a board only from ZPLC, where a person chooses the action.

AI inside ZPLC follows the same boundary and has its own data rules. Its assistant reads the open program
and a project summary, proposes a change set of up to four files that you review and save, and proposes editor
actions and display settings that you apply with a click; a multi-file save has no rollback. All of that is on
[AI, privacy and human review](../ide/ai-privacy.md).

## What is verified, and what is not

| Part                                                                                                                                                                                                                                                                                                                   | Verified                                                                                                                                                                                      | Level |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| The server lists 15 tools when asked; `project_validate`, `compiler_check` and `tests_run` pass on a bundled project; `boards_list` answers with `--repository`; an `initialize` of revision 2025-06-18, and a request with no revision, are refused with `-32022`, and one without `clientCapabilities` with `-32602` | Run by hand with a script that sends the requests over standard input and output, through `bun run --cwd=packages/zplc-ide mcp`, on the bundled project `pico_blinky_ton`; not repeated by CI | Host  |
| The built executable starts and lists its tools the way a 2026-07-28 client asks                                                                                                                                                                                                                                       | The release build starts the executable and counts the tools                                                                                                                                  | Host  |
| No tool reaches a device, a socket or a serial port                                                                                                                                                                                                                                                                    | A test lists the registered tools and resources of the live server and traps every socket and serial entry point                                                                              | Host  |
| The two program resources return the text and language of each of the five languages, refuse a name that is not a program of `src`, a link and an oversized file, and the server has no tool that writes                                                                                                               | `packages/zplc-ide/src/mcp/server.test.ts` and `deviceLink.test.ts`                                                                                                                           | Host  |
| A named assistant product works with the entry above                                                                                                                                                                                                                                                                   | Not verified: no client product was run for this page                                                                                                                                         | None  |
| An assistant's change is correct                                                                                                                                                                                                                                                                                       | Never implied: only the build and the scenarios say so                                                                                                                                        | None  |

## See also

- [The MCP server reference](../reference/mcp.md) and [Use the command line](./command-line.md).
- [AI, privacy and human review](../ide/ai-privacy.md).
- [Safety and limitations](../safety-and-limitations.md).
