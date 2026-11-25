---
slug: /ide/tests
id: tests
title: Tests and Test Results
sidebar_label: Tests and results
description: The Tests activity, the Test results tab, interlock coverage, Replay and the test commands of ZPLC.
tags: [ide, user-guide, testing]
---

# Tests and test results

A test of a ZPLC project is a scenario file in the `tests` folder of the project: inputs written over simulated time and the outputs the program must show. This page covers where the tests are listed, how they run and how to read a result. How to write a scenario is in [Write and run scenario tests](../guides/scenario-tests.md), and every field of the file is in the [scenario file format](../reference/scenario-file.md).

## The Tests activity

Choose **Tests** in the activity rail. The primary sidebar lists the tests of the project, one row per scenario file, with the expectations of each and its last result: **Not run**, **Passed**, **Failed** or **Older than the sources**. A result becomes older than the sources as soon as a program changes; it stays in the list, marked, until the test runs again. A file that is not a valid scenario is listed with "This file is not a valid test." Choosing the Tests activity also shows the **Test results** tab of the results panel.

| Action           | What it does                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Run** on a row | Runs that test alone and leaves the result of the others as it was.                                |
| **Run all**      | Runs every test of the project.                                                                    |
| **Run failed**   | Runs again the tests whose last result failed. With none, it says so and runs nothing.             |
| **New test**     | Writes a first test for the first program of the project and opens it (see [New test](#new-test)). |
| **Cancel**       | Stops a run that is in progress, with its simulation.                                              |

Nothing asks which `zplc.json` to use: the run takes the open project. A modified document does not block a run. The preference **Before running and building** decides what happens to it: **Save the project first** saves it, and **Ask before saving** asks. Running tests needs the desktop application.

The keyboard reaches every action: Tab moves through the buttons, and Enter or Space presses the one that has the focus.

### Interlocks

A second view of the Tests activity, **Interlocks** (**Show interlocks** in the command palette), checks the interlocks the project declares under `safety.incompatibleOutputs` in `zplc.json`. **Check interlocks** lists every pair of outputs as **Covered** or **Missing exact NEVER coverage**, and the answer appears in the Test results tab under its own heading, **Interlock coverage**. **Run all** does not start this check. It checks the scenarios, not the machine.

### New test

**New test** writes `tests/<Program>.scenario.json`, named after the program, for the first program of the project: it creates the `tests` folder when it is missing, adds a number when the name is taken and never writes over a file. The test checks that the first `BOOL` output of the program starts off, so it passes until you change it. It refuses a project with no program, a program with no `BOOL` output and a program that does not build, and says what to do in each case.

## The Test results tab

The tab opens on the latest run, in this order:

1. **The verdict, in one sentence**: "3 of 3 tests passed", or "1 of 3 tests passed" when two failed.
2. **Failed tests.** For each failed expectation: what it requires (for example "The signals must hold at a time"), its time, and for each signal the value expected and the value observed, as in `BeltCommand: expected true, observed false`. Two links follow it: **Scenario step** opens the scenario file at that expectation, and **That time in the trace** opens Details with that sample marked.
3. **Passed tests**, collapsed under **Passed tests (N)**.
4. **Details**, closed: the full record of the run, with the samples of the recorded trace, the hashes of the program and of the trace (the first 8 digits, with **Copy hash** for the whole value), and the build the run used.

The verdict carries one badge that states the boundary of the result: **Simulation result**. Its tooltip says that a simulation result is not evidence of a physical lamp, hardware timing, HIL or certification. The tab states it there and nowhere else.

A result that is older than the sources keeps its place, under the notice "This result is older than the sources." and a **Run again** button. A result that recorded a plant offers **Replay**, which opens the plant document on the recording. The **Run host scenarios** button of the tab runs every test of the project again, as **Run all** does.

When a run cannot start, the tab and the notification say why and what to do, for example "The tests did not run because src/main.st could not be saved". The verdict lists failed tests first and at most eight of them: with eight or more failures it says "At least 8 of N tests failed".

## The test commands

Every action above is a command of the palette, and the ones that are run often have a shortcut. None of them acts on a board: a test always runs on the simulation of this computer.

| Command                   | Shortcut                   | What it does                                                                                    |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| **Show tests**            | none                       | Shows the Tests activity.                                                                       |
| **Show test results**     | none                       | Shows the Test results tab.                                                                     |
| **Run all tests**         | `Ctrl+Shift+T` (`Cmd+Shift+T`) | Runs every test.                                                                                |
| **Run the failed tests**  | none                       | Runs the tests whose last result failed.                                                        |
| **Run the selected test** | none                       | Runs the scenario file of the active document, or else the test selected in the Tests activity. |
| **New test**              | none                       | Writes a first test for the first program.                                                      |
| **Check the interlocks**  | none                       | Runs the interlock coverage check.                                                              |

A scenario runs whole, so **Run the selected test** never runs one expectation alone. With no scenario file open and no test selected it says "No test to run here" and runs nothing.

## The same result everywhere

The Tests activity, `zplc-cli test`, `zplc-cli scenario-run` and the MCP tools `tests_run` and `scenario_run` call the same Tool API on the same runtime with the same virtual clock, so a test passes or fails the same way from each. A failed expectation also carries the expected and observed values in the result that the command line and the MCP server print. See [One result from the application, the CLI and the MCP tools](./features.md#one-result-from-the-application-the-cli-and-the-mcp-tools).

## What is verified

Evidence level: simulation on this computer. `packages/zplc-ide/src/shell/TestsView.dom.test.tsx`, `packages/zplc-ide/src/components/TestResultsTab.dom.test.tsx`, `packages/zplc-ide/src/components/TestVerdict.dom.test.tsx`, `packages/zplc-ide/src/components/BoundaryBadge.dom.test.tsx` and `packages/zplc-ide/src/projectTests/newTest.test.ts` cover the list, the verdict, the badge and New test. Journeys of `bun run test:journeys` run one test and all of them in the real application, break the program and follow a failed expectation to its scenario step and to its time in the trace. No test runs on a board, and the window was measured on Linux only.
