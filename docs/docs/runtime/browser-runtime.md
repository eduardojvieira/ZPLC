---
sidebar_position: 4
slug: /runtime/browser-runtime
id: browser-runtime
title: Browser Runtime (WebAssembly)
sidebar_label: Browser runtime
description: 'The WebAssembly runtime of the ZPLC application: when it runs instead of the native simulation, what it shares with the firmware, what it does not have, and the evidence for each statement.'
---

# Browser Runtime (WebAssembly)

The ZPLC application simulates a program on the native runtime of the desktop app. When that runtime cannot start, the simulation runs on the **browser runtime**: the same session code, built to WebAssembly. It is a degraded simulation, and the application says so wherever it shows the runtime.

## What it is

The module is built from the files of the native runtime and of the firmware, not from a copy of them:

| Part                                    | Source                                                  | What it gives                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The VM and the loader with its verifier | `firmware/lib/zplc_core/src/core`                       | The result of every scan, and the refusal of a program whose code the verifier cannot prove                                    |
| The scheduler core                      | `zplc_sched_core.c`                                     | Admission, order, the phases of a scan, deadlines, the fault latch and the safe state (RT-008, RT-009)                         |
| The retain rules                        | `zplc_retain.c`                                         | The record, its checksum, the layout hash, the program identity and two alternating slots (RT-025, RT-027)                     |
| The session                             | `firmware/apps/posix_host/src/native_runtime_session.c` | The same requests and the same answers as the native runtime: load, start, pause, step, breakpoints, forces, simulation inputs |
| The HAL port                            | `firmware/lib/zplc_core/src/hal/wasm/zplc_hal_wasm.c`   | Five calls into the page: a clock, three persistence calls and a log line                                                      |

`tools/wasm-core/build.ts` builds it with `clang` and `wasm-ld`, with no C library and no Emscripten. The build of the ZPLC application runs it (the Vite build of `packages/zplc-ide`): the module is embedded in the bundle, and its manifest (size, SHA-256, commit, product version and compiler) is written to `dist/wasm-runtime.json`. Nothing built is committed. A machine without `clang` and `wasm-ld` makes an application with no browser runtime and says why; where `CI` is set the build fails instead.

## When it runs

- In the desktop app when the native runtime does not start: its binary is missing, it was not built for the platform, or its handshake failed. The console says that the native simulation could not start and that the WebAssembly runtime runs instead.

An unpackaged build of ZPLC switches the native runtime off with `ZPLC_RUNTIME=wasm`, so that a test can show the browser runtime on a machine that has the native one. An installed copy of ZPLC ignores the variable.

## What the ZPLC application shows

The status bar shows **Runtime: WASM fallback · degraded**, and under it the list of what the runtime does not have and has in part. The list is the capability profile that the runtime reports in its handshake, in the vocabulary of the [native session contract](./intro.md): each feature is `supported`, `degraded` or `unavailable`, and a feature that is not supported says why and what to use instead.

| Feature                                  | Status      | What it means                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pause`, `resume`, `step`, `breakpoints` | supported   | The session code is the native runtime's: a breakpoint stops the scan, a step runs one, a resume continues from where it stopped                                                                                                                                                                      |
| `simulation-inputs`                      | supported   | The motor start, stop and emergency stop inputs stage one batch, as in the native runtime                                                                                                                                                                                                             |
| `tasks`                                  | degraded    | Cyclic tasks run on the scheduler core of the firmware, released from the timers of the browser; event and interrupt tasks do not exist in simulation                                                                                                                                                 |
| `timing`                                 | degraded    | The scan period follows the clock of the page and its timers, which are throttled in a background tab and have no real-time guarantee. What is deterministic is the result of each scan, not when it happens                                                                                          |
| `retentive-memory`                       | degraded    | The rules are the firmware's. The records go to the `build/retain` folder of the open project after the scan that saves them, so a page closed between the save and the write can lose that one record, and the previous record stays valid. With no project open they live in the memory of the page |
| `modbus`, `mqtt`, `cloud`                | unavailable | A module has no network: every communication block answers `STATUS` 10 (UNAVAILABLE) and never reports success                                                                                                                                                                                        |
| `serial`                                 | unavailable | The runtime has no serial port and does not speak the device link                                                                                                                                                                                                                                     |
| `physical-io`                            | unavailable | There are no pins: inputs and outputs are the process image that the ZPLC application reads and writes                                                                                                                                                                                                |

## What is the same, and the evidence

| Statement                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The loader's verifier is on the only path that loads a program                                                                                                                                                                                 | `wasmParity.test.ts` refuses a program that takes a value from an empty stack, and the 491 single-task conformance cases give their values through the bare core                                                                          |
| Every conformance case that builds gives its values on the session, through the adapter of the ZPLC application, with its tasks and its faults                                                                                                 | `wasmConformance.test.ts` runs the same steps as the native runner (`scenarioRun.ts`); the only declared difference is the `STATUS` of a block with no network (10 here, 3 where a runtime registers no handler)                          |
| The scheduler decides what the native runtime and the Zephyr scheduler decide                                                                                                                                                                  | `wasmRuntime.test.ts` drives the module with the clock of the shared trace cases (`zplc_sched_trace_cases.h`) and compares the decisions with the golden trace, for three tasks and for one                                               |
| A batch reads one input image and a pulse lasts one batch                                                                                                                                                                                      | `wasmRuntime.test.ts`, the same scenario as `test_native_runtime_session.c`                                                                                                                                                               |
| A retained value survives a new session, a different program starts from an initialised region, a damaged record and a record of another layout are refused, saves follow the interval and skip an unchanged region, a reset is a cold restart | `wasmRetain.test.ts`, with the programs and the status fields of the retain scenarios of `test_native_runtime_session.c`                                                                                                                  |
| The records are kept with the project                                                                                                                                                                                                          | `wasmRetain.test.ts` over a folder handle, and journey 8b in the real application                                                                                                                                                         |
| The HAL port passes the port conformance suite: the per-opcode tests, the loader negative tests, the scheduler phase and fault tests, the timing self-test and the I/O table (IO-013)                                                          | `wasmPortSuites.test.ts` runs the C suites that ctest runs on the POSIX host, built by `tools/wasm-core/suites.ts` with `zplc_hal_wasm.c` in place of the POSIX HAL; they give the same counts. See [Port interface](./port-interface.md) |
| The session stores the program it loads, restores it in a new session, and refuses a stored program that is damaged or cut short                                                                                                               | `wasmPortSuites.test.ts`, over the records of the page                                                                                                                                                                                    |

Evidence level: host. The module runs under Bun and, in journey 8b, in the Electron renderer on Linux. No other browser engine, no phone and no hardware was used, and no timing of the browser was measured.

## Limits worth knowing

- The interval between periodic retain saves is 30 seconds. A module has no environment, so `ZPLC_RETAIN_SAVE_INTERVAL_MS` does not exist here; a `STOP` and a shutdown still store.
- The program store of the session is in memory: a program is loaded from the project every time, and only the `RETAIN` records are kept with it.
- A sleep of the HAL port waits by reading the clock of the page in a loop, because a module cannot give its one thread back to the page. The runtime never sleeps (the page polls it when the next scan is due), so the loop serves only the timing self-test of the port.
- The signal trace and the live view of the motor example are features of the native simulation, and they stay off on the browser runtime.
- The persistence of the page is asynchronous. A failure to write is shown in the console of ZPLC as a warning; the session goes on.
