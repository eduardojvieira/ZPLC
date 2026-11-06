---
sidebar_position: 4
slug: /runtime/browser-runtime
id: browser-runtime
title: Software runtime (WebAssembly)
sidebar_label: Software runtime
description: 'The WebAssembly runtime of the ZPLC application: when it runs instead of the native simulation, what it shares with the firmware, what it does not have, and the evidence for each statement.'
---

# Software runtime (WebAssembly)

The ZPLC application simulates a program on the native runtime of the desktop app. When that runtime cannot start, the simulation runs on the **software runtime**: the same session code, built to WebAssembly. It is a degraded simulation, and the application says so wherever it shows the runtime. This page tells you what it gives you, what it cannot, and how far you can trust a result from it.

## What it is

The module is built from the files of the native runtime and of the firmware, not from copies of them.

| Part | Source | What it gives |
| --- | --- | --- |
| The VM and the loader with its verifier | `firmware/lib/zplc_core/src/core` | The result of every scan, and the refusal of a program whose code the verifier cannot prove |
| The scheduler core | `zplc_sched_core.c` | Admission, order, the phases of a scan, deadlines, the fault latch and the safe state (RT-008, RT-009) |
| The retain rules | `zplc_retain.c` | The record, its checksum, the layout hash, the program identity and two alternating slots (RT-025, RT-027) |
| The session | `firmware/apps/posix_host/src/native_runtime_session.c` | The same requests and answers as the native runtime: load, start, pause, step, breakpoints, forces, simulation inputs |
| The HAL port | `firmware/lib/zplc_core/src/hal/wasm/zplc_hal_wasm.c` | Five calls into the page: a clock, three persistence calls and a log line |

`tools/wasm-core/build.ts` builds it with `clang` and `wasm-ld`, with no C library and no Emscripten. The Vite build of `packages/zplc-ide` runs it, embeds the module in the bundle and writes its manifest (size, SHA-256, commit, product version and compiler) to `dist/wasm-runtime.json`. Nothing built is committed. A machine without `clang` and `wasm-ld` produces an application with no software runtime and says why; where `CI` is set the build fails instead.

## When it runs

It runs in the desktop app when the native runtime does not start: its binary is missing, it was not built for the platform, or its handshake failed. The console then says that the native simulation could not start and that the WebAssembly runtime runs instead.

An unpackaged build of ZPLC can switch the native runtime off with `ZPLC_RUNTIME=wasm`, so a test can show the software runtime on a machine that has the native one. An installed copy of ZPLC ignores the variable.

## What the ZPLC application shows

The status bar shows **Runtime: WASM fallback · degraded**, and under it the list of what the runtime does not have or has in part. That list is the capability profile the runtime reports in its handshake: each feature is `supported`, `degraded` or `unavailable`, and a feature that is not supported says why and what to use instead.

| Feature | Status | What it means |
| --- | --- | --- |
| `pause`, `resume`, `step`, `breakpoints` | supported | The session code is the native runtime's: a breakpoint stops the scan, a step runs one, a resume continues from where it stopped |
| `simulation-inputs` | supported | The motor start, stop and emergency stop inputs stage one batch, as in the native runtime |
| `tasks` | degraded | Cyclic tasks run on the scheduler core of the firmware, released from the timers of the app window. Event and interrupt tasks do not exist in simulation |
| `timing` | degraded | The scan period follows the clock of the page and its timers, which are throttled in a background tab and have no real-time guarantee. What is deterministic is the result of each scan, not when it happens |
| `retentive-memory` | degraded | The rules are the firmware's. The records go to the `build/retain` folder of the open project after the scan that saves them, so a page closed between the save and the write can lose that one record and the previous record stays valid. With no project open they live in the memory of the page |
| `modbus`, `mqtt`, `cloud` | unavailable | A module has no network: every communication block answers `STATUS` 10 (UNAVAILABLE) and never reports success |
| `serial` | unavailable | The runtime has no serial port and does not speak the device link |
| `physical-io` | unavailable | There are no pins: inputs and outputs are the process image that the ZPLC application reads and writes |

## What is the same, and the evidence

| Statement | Evidence |
| --- | --- |
| The verifier of the loader is on the only path that loads a program | `wasmParity.test.ts` refuses a program that takes a value from an empty stack, and the single-task conformance cases give their values through the bare core |
| Every conformance case that builds gives its values on the session, through the adapter of the ZPLC application, with its tasks and faults | `wasmConformance.test.ts` runs the same steps as the native runner (`scenarioRun.ts`). The one declared difference is the `STATUS` of a block with no network: 10 here, 3 where a runtime registers no handler |
| The scheduler decides what the native runtime and the Zephyr scheduler decide | `wasmRuntime.test.ts` drives the module with the clock of the shared trace cases (`zplc_sched_trace_cases.h`) and compares the decisions with the golden trace, for three tasks and for one |
| A batch reads one input image, and a pulse lasts one batch | `wasmRuntime.test.ts`, the same scenario as `test_native_runtime_session.c` |
| A retained value survives a new session; a different program starts from an initialised region; a damaged record and a record of another layout are refused; saves follow the interval and skip an unchanged region; a reset is a cold restart | `wasmRetain.test.ts`, with the programs and status fields of the retain scenarios of `test_native_runtime_session.c` |
| The records are kept with the project | `wasmRetain.test.ts` over a folder handle, and journey 8b in the real application |
| The HAL port passes the port conformance suite: the per-opcode tests, the loader negative tests, the scheduler phase and fault tests, the timing self-test and the I/O table (IO-013) | `wasmPortSuites.test.ts` runs the C suites that ctest runs on the POSIX host, built by `tools/wasm-core/suites.ts` with `zplc_hal_wasm.c` in place of the POSIX HAL. They give the same counts. See [Port interface](./port-interface.md) |
| The session stores the program it loads, restores it in a new session and refuses a stored program that is damaged or cut short | `wasmPortSuites.test.ts`, over the records of the page |

Evidence level: host. The module runs under Bun and, in journey 8b, in the Electron renderer on Linux. No other browser engine, no phone and no hardware was used, and no timing of the browser was measured.

## Limits worth knowing

- **Retain interval.** The interval between periodic retain saves is 30 seconds. A module has no environment, so `ZPLC_RETAIN_SAVE_INTERVAL_MS` does not exist here; a `STOP` and a shutdown still store.
- **Program store.** The program store of the session is in memory. A program is loaded from the project every time, and only the RETAIN records are kept with it.
- **Sleep.** A sleep of the HAL port waits by reading the clock of the page in a loop, because a module cannot give its one thread back to the page. The runtime never sleeps, since the page polls it when the next scan is due, so the loop serves only the timing self-test of the port.
- **Trace and live view.** The signal trace and the live view of the motor example are features of the native simulation, and they stay off on the software runtime.
- **Write failures.** The persistence of the page is asynchronous. A failure to write is shown in the console of ZPLC as a warning, and the session goes on.
