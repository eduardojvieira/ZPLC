---
name: zplc-plc-programmer
description: "Trigger: ZPLC PLC program, Structured Text, Ladder, FBD, SFC, scenario, PLC test. Safely inspect, edit, validate, compile, and test a ZPLC workspace."
license: MIT
metadata:
  author: "eduardojvieira"
  version: "1.2"
---

## Activation Contract

Load for a ZPLC workspace change, PLC-language diagnosis, scenario authoring, or evidence-backed programming task.

## Hard Rules

Stay inside the approved workspace/change set; never read or disclose secrets. Never invoke shell, raw serial, flash, deploy, force I/O, RUN/STOP, recovery, or a physical operation. Do not claim HIL, target timing, electrical behavior, safety certification, IEC completeness, or hardware qualification from source or native POSIX evidence. Never write or edit a hardware evidence record, and never raise a board's support level: it is derived from records that a person made. `VAR RETAIN` compiles in Structured Text, but retained values are proven only on the host, so never rely on them for recovery-critical state. An LLM never decides a test pass.

## Decision Gates

| Need | Do |
| --- | --- |
| Project is pre-v2 | Run migration preview; show the diff before edits. |
| Language is LD/FBD/SFC/IL | Preserve its semantic source; validate its generated-ST compiler result, never promise round-trip. |
| Test/simulation evidence | Require 1 to 16 cyclic tasks, each running exactly one program, with `interval_ms` from 1 to 3 600 000; use `test` or `scenario-run` on native POSIX. |
| Variables at pins | Read the board's I/O description (`firmware/app/boards/boards.json`) before you place a variable at an address: an address the board has no channel for is a build error unless it is listed under `io.virtual`. |
| Modbus, MQTT, cloud blocks | Read the how-to page of the protocol under `docs/docs/guides/`; say which part is verified and at which level, and that no exchange with a real device or service is. A network message never changes RUN or STOP, a force or the loaded program. |
| A hardware record or a flash is needed | Stop and ask a person: the agent cannot make HIL evidence, and every physical operation is human. |
| Firmware artifact requested by a human | Use authorized typed `firmware-build` only; it is a local cross-build, not flash or qualification. |

## Execution Steps

1. Inspect the manifest, sources, target, diagnostics, scenarios, and capability limits.
2. Declare assumptions, safe-state invariants, I/O ownership, and evidence scope.
3. Plan the smallest change and its scenario assertions.
4. Edit only the workspace/change set.
5. Use an authorized typed ZPLC Tool API or adapter for `validate`, `check`, then `compile`; if unavailable, report the missing evidence rather than falling back to a generic shell.
6. Use that same typed surface for `test` or focused `scenario-run`; inspect trace and evidence.
7. Present diff, tool evidence, limitations, and the proposed acceptance; wait for human acceptance before applying a patch.

## Output Contract

Return assumptions/invariants, changed files, exact tool results and evidence level, failing diagnostics if any, diff summary, and explicit human-acceptance request. Separate host/POSIX evidence from target or HIL evidence.

## References

- `references/project-schema.md`
- `references/iec-subset.md`
- `references/scan-and-memory.md`
- `references/boards-and-capabilities.md`
- `references/testing.md`
- `references/safety-policy.md`
- `references/communication-and-io.md`
