---
slug: /ide/ai-privacy
id: ai-privacy
title: AI, Privacy, and Human Review
sidebar_label: AI and Privacy
description: What ZPLC sends to an opted-in provider, what it redacts, and what automation cannot do.
tags: [ide, ai, privacy]
---

# AI, Privacy, and Human Review

AI is optional in ZPLC. It can explain, plan, and propose a change, and it can
suggest editor actions and a few display settings. It does not approve its own
result, it does not save anything, and it does not operate physical equipment.
Every proposal reaches you as something you review and apply with a click.

## Quick path

1. Select a provider and opt in before sending a request.
2. Read the context preview, which names the program and the project summary that will be sent, and remove material you do not want sent.
3. Review the proposed change file by file, with the compile and scenario result of the isolated run.
4. Press **Save reviewed change** only for a change you accept.

## What the assistant reads

Every request in the in-app assistant (Ask, Plan, Edit and Debug) can carry two things that the host reads from the
saved project, never from unsaved editor content:

- **The program that is open**, in any of the five languages: Structured Text (`.st`), Instruction List (`.il`),
  Ladder (`.ld.json`), Function Block Diagram (`.fbd.json`) or Sequential Function Chart (`.sfc.json`), directly in
  `src`, up to 64 KiB. Edit mode needs it saved and unmodified, because the proposal is checked against it. In the other
  modes a program that holds a known sensitive pattern is left out and the request goes on without it.
- **A project summary**: the list of programs in `src` (at most 128), the tasks, and `zplc.json` without its
  sensitive fields. If the whole request would pass 128 KiB, the manifest is dropped first, then the tasks.

Debug mode adds up to 32 diagnostics and 32 trace samples of the host run.

## What the assistant never receives

| Item                                   | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider configuration and key         | The endpoint and the key are never in the messages sent for the model. The key is used only as the credential of the request, and the model name is sent to the endpoint because the request needs it.                                                                                                                                                                                                                                                                                                       |
| Sensitive fields of `zplc.json`        | `network.wifi.password`, `communication.mqtt.password`, `communication.mqtt.azureSasKey`, `communication.mqtt.clientKeyPath` and `communication.mqtt.awsClaimKeyPath`, and any field whose name contains password, passwd, pwd, secret, token, credential, apikey, accesskey, privatekey, saskey, clientkey, bearer or psk, or ends in pass, in any letter case, with or without a value, are removed. The rule is wider than the project's own on purpose: a harmless field with such a name is hidden too. |
| Application settings                   | Autosave, update check, lesson unlock and hide-solutions are not in the context, and the assistant cannot propose them.                                                                                                                                                                                                                                                                                                                                                                                      |
| Editor content that is not saved       | Not sent. The host rereads the saved file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Terminal, serial port, device or shell | No field of a request can name one; anything outside the six fields (workspace, mode, prompt, active file, diagnostics, trace) is refused before the provider is called.                                                                                                                                                                                                                                                                                                                                     |

## Data boundary

| Item              | ZPLC behavior                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider key      | Stored through the operating system safe-storage/vault integration.                                                                                                                                                                                                                                                                                                                                            |
| Automatic context | The open program and the project summary above, under size limits. A known sensitive pattern in the prompt, the diagnostics or the trace rejects the request before any provider call. In Edit mode the same pattern in the open program rejects it. In the other modes the program, the tasks and the manifest that hold such a pattern are left out without a message, and the request goes on without them. |
| Prompt warning    | ZPLC warns not to paste secrets.                                                                                                                                                                                                                                                                                                                                                                               |
| Candidate change  | Kept isolated until the person reviews and saves it.                                                                                                                                                                                                                                                                                                                                                           |
| Success message   | Derived from compiler/test/simulation evidence, not provider prose.                                                                                                                                                                                                                                                                                                                                            |

## What the assistant can propose

### A change set of up to four files

In Edit mode a proposal is one change set of at most four files, each of which replaces a program in `src`, creates a
new program in `src`, or replaces `zplc.json`. Deleting a file is not offered. Before you see it:

- A Ladder, FBD or SFC file has to load the way the editors load it. If it does not, the answer is shown as
  not valid, with up to five violations, and nothing is reviewed. A file that loads is rewritten in the editors'
  own stable form.
- `zplc.json` is rewritten the way ZPLC writes it. A change that sets a value in a sensitive field is refused, and so is
  a new file whose name the build reads as an existing program.
- The whole set is compiled and run against the project's scenarios on a copy of the saved project, on the host
  simulation. The project on disk is not touched by this run.

The Changes tab then shows one difference per file, marked as changed or new, and the **Save reviewed change** button
appears only when the isolated run passed. A new program needs a task of its own in the `zplc.json` change of the same
set, because a task runs exactly one program; this is stated to the assistant, and a program without a task is still
allowed.

### Nothing is written before you save

Until you press **Save reviewed change** no file is written, nothing is loaded into the editor as an unsaved change, and
so autosave has nothing to save. If a file moved on disk, or you edited an affected file, after the answer arrived, the
review says it is no longer current and you review again. An affected file with unsaved changes of your own must be saved first.

### Save writes file by file, and does not roll back

**Save reviewed change** writes the new programs first, then the replaced programs, and `zplc.json` last, through the
same save that you use yourself. If one write fails, the later files are not written and the earlier ones stay
written: there is no rollback. You see the Changes tab say that the review could not be completed, and Output carries a line that names the file where the
save stopped and says how many files were written, whether or not the file was open. The store may add its own failure line, for example `Failed to save Main.st: …`. Check the project before you build, and
use your version control to return to the previous state.

### Editor actions and display settings

An answer may also carry up to six proposals, each shown as a button with a label that says what it will do:

- open a program file, go to a line of it, or select a rung, block, step or transition of a Ladder, FBD or SFC diagram;
- compile, generate Structured Text from the open diagram, or switch to the simulator, which is offered only while no device is connected;
- set the theme, the language, the density, the editor font size or the tab size. The button shows the current value
  and the proposed one.

Each proposal is checked against your project when it arrives: the file, the line or the element has to exist, otherwise the
button is disabled and says why. Nothing runs until you click it, and then it runs the way your own click would: the same
navigation as a problem in the Problems tab, the same command as the menu, the same setter as the settings screen.

Never proposable: any command that acts on a device (connect, disconnect, deploy, run, pause, stop, step, reset), the switch to the simulator while a device is connected (it would disconnect the device),
the download of a program, the hardware mode, the provider configuration and its key, the update check, autosave, the
lesson unlock and hide-solutions. An answer that contains one is shown as not trusted and offers no button. The provider
cannot return tool calls: an answer that carries one is refused.

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
run a shell (AGENTS.md rule 8). Those actions remain explicit human UI flows.

### No path to the device link

The tools of the local MCP server are fixed: `project_inspect`, `project_validate`, `compiler_check`,
`compiler_compile`, `symbols_list`, `safety_check`, `tests_run`, `scenario_run`, `simulation_start`,
`simulation_step`, `runtime_snapshot`, `trace_get`, `boards_list`, `toolchain_inspect` and `firmware_build`. None takes a
port, a device or a session, none opens a serial port or a socket, and the program that serves them is built
without the modules that do. A request to the AI provider carries six fields (workspace, mode, prompt, the active
file, diagnostics and trace samples; the active file is a program of `src` in any of the five languages) and anything else is refused before it reaches the provider. A test
enumerates the registered tools and resources from the live server, checks the module graph of the server and of
the provider, and runs the tools with a trap on every socket and serial entry point
(`packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`). The local MCP
server also has two read-only resources that return a program's source text and language; no tool or resource of the
server writes a program.

## Evidence before acceptance

A useful candidate includes its diagnostics, compile result, scenario result,
and trace where available. Provider text is explanation; tools are the source
of verification. If the evidence is missing or fails, reject or revise the
candidate.

## What is verified, and what is not

| Part                                                                                                                                                                                                        | Verified                                                                                                                                              | Level |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| The request carries the open program of each of the five languages in every mode and a project summary without credential fields, and none of the settings or provider configuration                        | `packages/zplc-ide/electron/aiProvider.test.ts` and `electron/security.test.ts`                                                                       | Host  |
| A change set has at most four files, creates, replaces and changes `zplc.json`, and refuses a credential, a name clash, a wrong mode and a response with an extra field                                     | `electron/aiProvider.test.ts`, `electron/security.test.ts`, `src/cli/changeSet.test.ts`                                                               | Host  |
| Ladder, FBD and SFC files are validated and normalized, and the manifest is written as ZPLC writes it                                                                                                       | `src/ai/changeSetPrepare.test.ts`, `src/components/agent/agentResponse.test.ts`                                                                       | Host  |
| The change set is compiled and scenario-tested on a copy and the base is not written                                                                                                                        | `src/cli/changeSet.test.ts` on the native POSIX runtime                                                                                               | Host  |
| The review shows each file, nothing is written or loaded into the editor before Save, and Save writes new programs, replaced programs and the manifest in that order and stops at the first failure         | `src/components/agent/changeSetReview.test.ts`, `src/components/ConsoleChangesTrace.dom.test.tsx`                                                     | Host  |
| A person's reviewed change is saved by a click in the running application, and Studio works without the assistant                                                                                           | Journey 43 of `bun run smoke:journeys`                                                                                                                | Host  |
| The security properties of the running application hold                                                                                                                                                     | Journey 38 of `bun run smoke:journeys`                                                                                                                | Host  |
| No proposal can be a physical command, the download, the hardware mode or a setting outside the five, and the switch to the simulator is not offered while a device is connected; each runs only on a click | `src/ai/proposals.test.ts` (checked against the command registry), `src/components/agent/editorProposals.test.ts`, `ConsoleChangesTrace.dom.test.tsx` | Host  |
| The assistant cannot open the device link                                                                                                                                                                   | `packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`                                                     | Host  |
| A named provider or model answers in the format described here, or writes a correct change                                                                                                                  | Not verified: the tests use a fake provider, and no provider was run for this page                                                                    | None  |
| A change from the assistant is correct for your plant                                                                                                                                                       | Never implied: only the build and the scenarios say anything, and they run on the host                                                                | None  |
