---
slug: /ide/ai-privacy
id: ai-privacy
title: AI, Privacy, and Human Review
sidebar_label: AI and Privacy
description: What ZPLC sends to an opted-in provider, what it redacts, and what automation cannot do.
tags: [ide, ai, privacy]
---

# AI, Privacy, and Human Review

AI is optional in ZPLC. It can explain, plan, and prepare a candidate
change; it does not approve its own result or operate physical equipment.

## Quick path

1. Select a provider and opt in before sending a request.
2. Review the context preview and remove material you do not want sent.
3. Review the candidate diff, then compile, test, and simulate it.
4. Save only the change you accept.

## Data boundary

| Item              | ZPLC behavior                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Provider key      | Stored through the operating system safe-storage/vault integration.                                      |
| Automatic context | Bounded Structured Text context; a known sensitive pattern rejects the request before any provider call. |
| Prompt warning    | ZPLC warns not to paste secrets.                                                                         |
| Candidate change  | Kept isolated until the person reviews and saves it.                                                     |
| Success message   | Derived from compiler/test/simulation evidence, not provider prose.                                      |

## Important limit

Known-pattern rejection is a safeguard, not a guarantee. An arbitrary secret
literal that does not match a known pattern can still be sent to the selected
provider. Do not enter credentials,
private keys, production addresses, or raw sensitive logs. Review provider
terms and your organization’s policy before opting in.

## Physical boundary

AI and local MCP can inspect, validate, compile, test, simulate, and read
bounded trace/evidence. They cannot flash firmware, deploy a program to
hardware, force values, change RUN/STOP, perform recovery, open raw serial, or
run a shell. Those actions remain explicit human UI flows.

### No path to the device link

The tools of the local MCP server are fixed: `project_inspect`, `project_validate`, `compiler_check`,
`compiler_compile`, `symbols_list`, `safety_check`, `tests_run`, `scenario_run`, `simulation_start`,
`simulation_step`, `runtime_snapshot`, `trace_get`, `boards_list`, `toolchain_inspect` and `firmware_build`. None takes a
port, a device or a session, none opens a serial port or a socket, and the program that serves them is built
without the modules that do. A request to the AI provider carries six fields (workspace, mode, prompt, the active
file, diagnostics and trace samples) and anything else is refused before it reaches the provider. A test
enumerates the registered tools and resources from the live server, checks the module graph of the server and of
the provider, and runs the tools with a trap on every socket and serial entry point
(`packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`).

## Evidence before acceptance

A useful candidate includes its diagnostics, compile result, scenario result,
and trace where available. Provider text is explanation; tools are the source
of verification. If the evidence is missing or fails, reject or revise the
candidate.
