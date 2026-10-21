---
slug: /guides/scenario-tests
id: scenario-tests
title: Write and run scenario tests
sidebar_label: Scenario tests
description: 'Check what a program does with a scripted scenario: write the file, run it in ZPLC or from the command line, and read the result.'
tags: [how-to, tests, scenarios, simulation]
---

# Write and run scenario tests

A scenario sets inputs at chosen times, lets your program run on the simulator's
virtual clock, and checks what the outputs do. Use it to say what a program must
do before you trust it, and to find out when a change breaks it.

:::note What a scenario proves
A scenario runs your program on the native simulator, with a virtual clock. It is
a host result: it says what the logic does, not how a board behaves, and it
checks only the signals you name.
:::

## 1. The program

Take a start and stop latch: `Run` comes on when `Start` is pressed, stays on
after `Start` is released, and goes off when `Stop` is pressed.

```st runnable expect="Run=FALSE" scans=5 scan_ms=10
PROGRAM Pump
VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    Run AT %Q0.0 : BOOL;
END_VAR

Run := (Start OR Run) AND NOT Stop;
END_PROGRAM
```

The inputs are placed at input addresses, because a scenario writes inputs into
the process image, where the program reads them. With no input set the output
stays `FALSE`; the scenario sets the inputs.

## 2. The scenario

A scenario is a JSON file in the `tests` folder of the project, named
`<name>.scenario.json`. A signal is written `Program.variable`: here `Pump.Start`.

```json zplc-scenario
{
  "schemaVersion": 1,
  "id": "PumpLatch",
  "tickMs": 10,
  "durationMs": 300,
  "events": [
    { "atMs": 50, "set": { "Pump.Start": true } },
    { "atMs": 100, "set": { "Pump.Start": false } },
    { "atMs": 200, "set": { "Pump.Stop": true } }
  ],
  "expectations": [
    { "kind": "FOR", "fromMs": 0, "forMs": 40, "condition": { "Pump.Run": false } },
    { "kind": "WITHIN", "fromMs": 50, "withinMs": 20, "condition": { "Pump.Run": true } },
    { "kind": "FOR", "fromMs": 110, "forMs": 80, "condition": { "Pump.Run": true } },
    { "kind": "WITHIN", "fromMs": 200, "withinMs": 20, "condition": { "Pump.Run": false } }
  ]
}
```

- `tickMs` is the simulated time of one scan, and `durationMs` is a multiple of it.
- Each event writes BOOL inputs at a time that is a multiple of `tickMs`.
- Each expectation names a kind (`AT`, `FOR`, `WITHIN`, `NEVER` and the others in the
  [scenario file format](../reference/scenario-file.md)), a time window and the
  output values the signals must hold.

The documentation check runs this scenario against the program above, so it is a
scenario that passes.

## 3. Run it

**In ZPLC**, open the **Tests** tab and press **Run host scenarios**. Each
scenario is listed as passed or failed, with its assertions and the time of each.
A failed assertion shows the instant, the value it expected and the value it
observed.

**From a terminal**, with the command line of the project (build the runtime
first, `bun run setup`):

```bash
bun run simulate path/to/your/project
```

It runs every scenario of the project headless, prints `test passed` or the failing
assertion, and exits with 0 on a pass and 1 on a failure. To run one scenario by its
`id`, use `zplc-cli scenario-run <workspace> <scenario-id>`; the
[command line reference](../reference/cli.md) lists every option, including
`--json` for a machine-readable result.

## 4. Make it useful

- **State what must never happen** with `NEVER`: for two outputs that must not be
  on together, assert it. The **Interlocks** tab of ZPLC lists each pair you
  declared under `safety.incompatibleOutputs` as covered or not, from your `NEVER`
  expectations.
- **Check an edge** with `RISING` and `FALLING` rather than a level, when the
  moment matters.
- **Use a plant model** (`motor-v1`, `conveyor-v1`, `tank-v1`, `pedestrian-v1`) when
  the program needs feedback from the process: it drives its own inputs from your
  outputs. A plant model requires `tickMs` 10.
- **Keep scenarios short.** A scenario holds at most 256 events and 256
  expectations, and the files of a project are bounded: see the limits in the
  reference.

## What is verified, and what is not

| Part                                                                                                       | Verified                                              | Level |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----- |
| The scenario above passes against the program above, and the check fails when an expectation does not hold | The documentation check runs it on the native runtime | Host  |
| The scenario reader refuses a malformed file and enforces its limits                                       | Unit tests of the test engine                         | Host  |
| The real scan time of a board, a physical input, a safety validation                                       | Not tested                                            | None  |

A scenario that passes means that the logic did what you wrote on the virtual
clock: [Safety and limitations](../safety-and-limitations.md).

## See also

- [Scenario file format](../reference/scenario-file.md): every field, expectation kind and limit.
- [Blink without hardware](../tutorials/blink-without-hardware.md): the same test in a first project.
- [Learn](../learn/index.md): lessons graded by a scenario.
