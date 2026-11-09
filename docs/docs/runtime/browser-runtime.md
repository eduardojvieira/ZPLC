---
sidebar_position: 4
slug: /runtime/browser-runtime
id: browser-runtime
title: Software runtime (WebAssembly)
sidebar_label: Software runtime
description: 'The WebAssembly runtime of the ZPLC application: when it runs instead of the native simulation, what it shares with the firmware, what it does not have, and the evidence for each statement.'
---

# Software runtime (WebAssembly)

This page tells you when ZPLC simulates a program on its software runtime, what that runtime gives you, what it cannot do, and how far to trust a result from it. The software runtime is the same session code as the native simulation, built to WebAssembly. It is a degraded simulation, and the application says so wherever it shows the runtime.

## What it is

The module is built from the files of the native runtime and of the firmware, not from copies of them.

| Part                                    | Source                                                  | What it gives                                                                                                         |
| --------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The VM and the loader with its verifier | `firmware/lib/zplc_core/src/core`                       | The result of every scan, and the refusal of a program whose code the verifier cannot prove                           |
| The scheduler core                      | `zplc_sched_core.c`                                     | Admission, order, the phases of a scan, deadlines, the fault latch and the safe state                                 |
| The retain rules                        | `zplc_retain.c`                                         | The record, its checksum, the layout hash, the program identity and two alternating slots                             |
| The session                             | `firmware/apps/posix_host/src/native_runtime_session.c` | The same requests and answers as the native runtime: load, start, pause, step, breakpoints, forces, simulation inputs |
| The HAL port                            | `firmware/lib/zplc_core/src/hal/wasm/zplc_hal_wasm.c`   | Five calls into the page: a clock, three persistence calls and a log line                                             |

`tools/wasm-core/build.ts` builds it with `clang` and `wasm-ld`, with no C library and no Emscripten. The Vite build of `packages/zplc-ide` runs that build, embeds the module in the bundle and writes its manifest (size, SHA-256, commit, product version and compiler) to `dist/wasm-runtime.json`. Nothing built is committed.

A machine without `clang` and `wasm-ld` produces an application with no software runtime, and the application says why. Where the `CI` variable is set, the build fails instead.

## When it runs

`connectSimulationAdapter` in `packages/zplc-ide/src/runtime/simulationAdapterFactory.ts` picks the runtime:

| Situation                                                                                                           | Runtime                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The desktop app, and the native runtime starts                                                                      | The native simulation                                                                                                           |
| The desktop app, and the native runtime does not start: no binary, no build for the platform, or a failed handshake | The software runtime. The console says that the native simulation could not start and that the WebAssembly runtime runs instead |
| Any run without the desktop bridge, such as the test suites. ZPLC ships no hosted browser version                   | The software runtime, with no notice                                                                                            |

An unpackaged build of the desktop app can switch the native runtime off with `ZPLC_RUNTIME=wasm`, so that a test can show the software runtime on a machine that has the native one. An installed copy ignores the variable.

## What the application shows

The status bar shows **WASM fallback · degraded**, and under it the list of what the runtime does not have or has in part. That list is the capability profile the runtime reports in its handshake (`packages/zplc-ide/src/runtime/wasmCapabilities.ts`). Each feature is `supported`, `degraded` or `unavailable`, and a feature that is not supported says why and what to use instead.

| Feature                                  | Status      | What it means                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pause`, `resume`, `step`, `breakpoints` | supported   | The session code is the native runtime's: a breakpoint stops the scan, a step runs one, a resume continues from where it stopped                                                                                                                                                                            |
| `simulation-inputs`                      | supported   | The motor start, stop and emergency stop inputs stage one batch, as in the native runtime                                                                                                                                                                                                                   |
| `tasks`                                  | degraded    | Cyclic tasks run on the scheduler core of the firmware, released from the timers of the app window. Event and interrupt tasks do not exist in simulation                                                                                                                                                    |
| `timing`                                 | degraded    | The scan period follows the clock of the page and its timers, which are throttled in a background tab and have no real-time guarantee. What is deterministic is the result of each scan, not when it happens                                                                                                |
| `retentive-memory`                       | degraded    | The rules are the firmware's. The records go to the `build/retain` folder of the open project after the scan that saves them, so closing the page between the save and the write can lose that one record. The previous record stays valid. With no project open the records live in the memory of the page |
| `modbus`, `mqtt`, `cloud`                | unavailable | A module has no network: every communication block answers `STATUS` 10 (UNAVAILABLE) and never reports success                                                                                                                                                                                              |
| `serial`                                 | unavailable | The runtime has no serial port and does not speak the device link                                                                                                                                                                                                                                           |
| `physical-io`                            | unavailable | There are no pins: inputs and outputs are the process image that the application reads and writes                                                                                                                                                                                                           |

## What matches the firmware, and the evidence

| Statement                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The verifier of the loader is on the only path that loads a program                                                                                                                                                                            | `wasmParity.test.ts` refuses a program that takes a value from an empty stack, and the single-task conformance cases give their values through the bare core                                                                              |
| Every conformance case that builds gives its values on the session, through the adapter of the application, with its tasks and faults                                                                                                          | `wasmConformance.test.ts` runs the same steps as the native runner (`scenarioRun.ts`). The one declared difference is the `STATUS` of a block with no network: 10 here, 3 where a runtime registers no handler                            |
| The scheduler decides what the native runtime and the Zephyr scheduler decide                                                                                                                                                                  | `wasmRuntime.test.ts` drives the module with the clock of the shared trace cases (`zplc_sched_trace_cases.h`) and compares the decisions with the golden trace, for three tasks and for one                                               |
| A batch reads one input image, and a pulse lasts one batch                                                                                                                                                                                     | `wasmRuntime.test.ts`, the same scenario as `test_native_runtime_session.c`                                                                                                                                                               |
| A retained value survives a new session; a different program starts from an initialised region; a damaged record and a record of another layout are refused; saves follow the interval and skip an unchanged region; a reset is a cold restart | `wasmRetain.test.ts`, with the programs and status fields of the retain scenarios of `test_native_runtime_session.c`                                                                                                                      |
| The records are kept with the project                                                                                                                                                                                                          | `wasmRetain.test.ts` over a folder handle, and journey `8b` in the real application                                                                                                                                                       |
| The HAL port passes the port conformance suite: per-opcode tests, loader negative tests, scheduler phase and fault tests, the timing self-test and the I/O table                                                                               | `wasmPortSuites.test.ts` runs the C suites that ctest runs on the POSIX host, built by `tools/wasm-core/suites.ts` with `zplc_hal_wasm.c` in place of the POSIX HAL. They give the same counts. See [Port interface](./port-interface.md) |
| The session stores the program it loads, restores it in a new session and refuses a stored program that is damaged or cut short                                                                                                                | `wasmPortSuites.test.ts`, over the records of the page                                                                                                                                                                                    |

Evidence level: host. The module runs under Bun and, in journey `8b`, in the Electron renderer on Linux. That journey sets `ZPLC_RUNTIME=wasm`, runs the Motor example, and checks the status bar text, the console notice and a forced input. No other browser engine, no phone and no hardware was used, and no timing of a browser was measured.

## Limits worth knowing

- **Retain interval.** Periodic retain saves happen every 30 seconds. A module has no environment, so `ZPLC_RETAIN_SAVE_INTERVAL_MS`, which the native runtime reads, does not exist here. A `STOP` and a shutdown still store.
- **Program store.** The program store of the session is in memory. The program is loaded from the project every time, and only the RETAIN records are kept with it.
- **Sleep.** The sleep of the HAL port waits by reading the clock of the page in a loop, because a module cannot give its one thread back to the page. The runtime itself never sleeps, since the page polls it when the next scan is due, so the loop serves only the timing self-test of the port.
- **Overrun count.** The status bar reads the overrun count from the native trace and from the serial controller status only. The software runtime shows none.
- **Write failures.** The persistence of the page is asynchronous. A failure to write is shown as a warning in the console of the application, and the session goes on.

:::tip Need timing or networking?
Use the native simulation of the desktop app for timing with a virtual clock, and hardware for real timing, pins and networks. The evidence levels are explained in [Hardware support](../reference/capabilities-evidence.md).
:::
