---
title: "Port interface and conformance suite"
sidebar_label: "Port interface"
description: "What a port of the ZPLC runtime provides, and the conformance suite that every port passes, generated from the headers and the manifest of checks."
tags: [reference, generated]
---

# Port interface and conformance suite

{/* >>> GENERATED (tools/docs/generate_port_interface.ts): runtime/port-interface. Do not edit. >>> */}

A port is a platform that hosts the portable core: the virtual machine, the loader, the scheduler core and the storage of the program. The core owns what a program means; a port owns the clock, the pins, the storage, the locks and the thread that calls the scheduler. A port is written against two headers and nothing else, and passes one conformance suite.

Ports in the repository: the Zephyr firmware (`firmware/lib/zplc_core/src/hal/zephyr`), the POSIX host runtime that the ZPLC application simulates with (`.../posix`) and the WebAssembly runtime (`.../wasm`). Whether a second, non-Zephyr port ships in 2.0 is decision D-06 of the remediation spec; this page and the suite are what such a port is written against.

## The HAL

The functions of `firmware/lib/zplc_core/include/zplc_hal.h`, by what they serve. A function that a board cannot perform returns `ZPLC_HAL_NOT_IMPL`, the defined "not supported" result; a port that leaves one out does not link, and `tools/ci/check_hal_contract.py` lists the functions that nothing calls.

### Clock

The millisecond clock and the blocking sleep. The scheduler core also asks the adapter for a microsecond clock, `now_us`.

| Function | What it does |
| --- | --- |
| `zplc_hal_tick()` | Get the current system tick in milliseconds. |
| `zplc_hal_sleep()` | Sleep for the specified number of milliseconds. |

### I/O table

The channels of the board and the physical pins behind them. The core addresses a logical channel; the table says which pin it is and where it sits in the process image.

| Function | What it does |
| --- | --- |
| `zplc_hal_gpio_read()` | Read a digital input channel. |
| `zplc_hal_gpio_write()` | Write to a digital output channel. |
| `zplc_hal_adc_read()` | Read an analog input channel. |
| `zplc_hal_dac_write()` | Write to an analog output channel (DAC). |
| `zplc_io_table()` | The board's I/O table (never NULL; it may list no channel). |
| `zplc_io_channel_count()` | Number of channels of the board. |
| `zplc_io_channel_at()` | Channel `index` of the table, or NULL past the end. |
| `zplc_io_read_channel()` | Read one physical input channel through the HAL. |
| `zplc_io_write_channel()` | Write one physical digital output channel through the HAL. |
| `zplc_io_image_get()` | The value of a channel in an image buffer (a digital channel is 0 or 1). |

### Non-volatile storage

Keyed blobs that survive a power cycle: the stored program, the retentive memory, the configuration and the credentials.

| Function | What it does |
| --- | --- |
| `zplc_hal_persist_save()` | Save data to persistent storage. |
| `zplc_hal_persist_load()` | Load data from persistent storage. |
| `zplc_hal_persist_delete()` | Delete data from persistent storage. |

### Locks

Mutual exclusion between the scan and the threads around it. A lock that cannot be taken is a fault, not a retry.

| Function | What it does |
| --- | --- |
| `zplc_hal_mutex_create()` | Create a new mutex. |
| `zplc_hal_mutex_lock()` | Lock a mutex. |
| `zplc_hal_mutex_unlock()` | Unlock a mutex. |
| `zplc_hal_mutex_destroy()` | Destroy a mutex and release its resources. |

### Log and life cycle

One log sink, and the calls that bring the port up before the runtime can enter RUN and take it down.

| Function | What it does |
| --- | --- |
| `zplc_hal_log()` | Log a formatted message. |
| `zplc_hal_init()` | Initialize the HAL layer. |
| `zplc_hal_shutdown()` | Shutdown the HAL layer. |

### Network (optional)

Sockets and name resolution. The portable core does not call them: the applications that need a network bring their own transport (tools/ci/hal-contract.json keeps the ledger), so no conformance leg covers them.

| Function | What it does |
| --- | --- |
| `zplc_hal_net_init()` | Initialize the networking stack. |
| `zplc_hal_net_get_ip()` | Get the current IP address of the device. |

## The scheduler port

What an adapter hands the scheduler core (`zplc_sched_port_t` of `firmware/lib/zplc_core/include/zplc_sched_core.h`). Every member but `now_us` is optional: an absent callback is a step the platform does not have. The core has no synchronization of its own; the adapter supplies the locks. The adapters that exist are the POSIX session of the host runtime, the Zephyr scheduler and the single-task configuration of the firmware.

| Callback | What it does |
| --- | --- |
| `now_us` | Monotonic time in microseconds. |
| `enter` | The critical section of the core's own state. |
| `leave` | The other half of `enter`. |
| `lock_image` | The process-image lock. |
| `unlock_image` | The other half of `lock_image`. |
| `lock_io` | The lock of the output I/O: held while the pins are written and the watchdog is fed. |
| `unlock_io` | The other half of `lock_io`. |
| `sample_inputs` | Phase 1, no lock held: read the physical inputs into the adapter's buffer. |
| `latch_inputs` | Phase 2, image lock held: apply the queued external writes, then the sampled inputs, to the image. |
| `capture_outputs` | Phase 2, image lock held: copy the output image, forces applied, into the adapter's buffer. |
| `publish` | Phase 2, image lock held: publish the image as the snapshot other threads read (RT-010). |
| `write_outputs` | Phase 3, output lock held, image lock released: write the captured outputs to the pins. |
| `feed_watchdog` | Phase 3, output lock held, only after a successful write of a running scan: feed the watchdog. |
| `reset_image` | Safe state: zero the output image, clear the forces and publish. |
| `drive_safe_pins` | Safe state: drive every physical output to its safe level. |
| `watchdog_state` | The runtime entered a state in which the profile's hardware watchdog policy applies (paused, or a latched fault; a STOP is the control plane's): the platform disarms it, keeps it fed, or lets it expire as the profile says (RT-020). |
| `stop_releases` | Stop the platform's release mechanism (the kernel timers). |
| `probe` | A test hook; see zplc_sched_probe_t. |
| `fault_latched` | The fault was latched, with the reason and the task that are kept (the first of a run of faults): the platform keeps them where a reset will not erase them (RT-020). |

## The conformance suite

A port passes the suite when every category below passes on it. The checks are listed in `tools/ci/port-conformance.json`, and a test holds each name to the tree. A leg that is open says why and who owns it; an open leg is not a pass.

### Per-opcode tests

Every opcode of the instruction set gives its result on the port, including the edges of the arithmetic.

| Port | Checks | How to run |
| --- | --- | --- |
| POSIX host | `test_isa`, `test_vm_core`, `test_vm_arith_edges`, `test_opcode_coverage` | `bun run test:core` (CMake and ctest, with the sanitizers in CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.core.isa`, `zplc.core.vm_core`, `zplc.core.vm_arith_edges` | `bun run test:firmware` (Twister on `native_sim` 64 and 32 bits, `qemu_cortex_m3` and `qemu_cortex_m0`) |
| WebAssembly | `test_isa`, `test_vm_core`, `test_vm_arith_edges`, `test_opcode_coverage`, `packages/zplc-ide/src/runtime/wasmParity.test.ts` | `bun tools/wasm-core/suites.ts` (the C suites of the core, built with the WebAssembly HAL) and the `wasm*.test.ts` files of `bun run test:ide` (with clang and lld; CI installs them) |

### Loader negative tests

A program that is malformed, out of bounds or built for another contract is refused before any state changes.

| Port | Checks | How to run |
| --- | --- | --- |
| POSIX host | `test_loader_verify`, `test_sandbox`, `test_sandbox_regions` | `bun run test:core` (CMake and ctest, with the sanitizers in CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.core.loader_verify`, `zplc.legacy_program_admission` | `bun run test:firmware` (Twister on `native_sim` 64 and 32 bits, `qemu_cortex_m3` and `qemu_cortex_m0`) |
| WebAssembly | `test_loader_verify`, `test_sandbox`, `test_sandbox_regions`, `packages/zplc-ide/src/runtime/wasmParity.test.ts` | `bun tools/wasm-core/suites.ts` (the C suites of the core, built with the WebAssembly HAL) and the `wasm*.test.ts` files of `bun run test:ide` (with clang and lld; CI installs them) |

### Scheduler phase and fault tests

Admission, order, the phases of a scan, deadline misses, the fault latch and the safe state decide the same on every port.

| Port | Checks | How to run |
| --- | --- | --- |
| POSIX host | `test_sched_core`, `test_sched_equivalence`, `test_single_task`, `test_failsafe`, `test_native_runtime_session` | `bun run test:core` (CMake and ctest, with the sanitizers in CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.scheduler_admission`, `zplc.scheduler_equivalence`, `zplc.scheduler_run_control`, `zplc.scheduler_watchdog`, `zplc.single_task`, `zplc.failsafe` | `bun run test:firmware` (Twister on `native_sim` 64 and 32 bits, `qemu_cortex_m3` and `qemu_cortex_m0`) |
| WebAssembly | `test_sched_core`, `test_sched_equivalence`, `test_single_task`, `test_failsafe`, `packages/zplc-ide/src/runtime/wasmRuntime.test.ts` | `bun tools/wasm-core/suites.ts` (the C suites of the core, built with the WebAssembly HAL) and the `wasm*.test.ts` files of `bun run test:ide` (with clang and lld; CI installs them) |

### Timing self-test

The clock of the port counts milliseconds, never goes backwards, advances through a sleep and sleeps the time it is given.

| Port | Checks | How to run |
| --- | --- | --- |
| POSIX host | `test_port_timing` | `bun run test:core` (CMake and ctest, with the sanitizers in CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.port_timing` | `bun run test:firmware` (Twister on `native_sim` 64 and 32 bits, `qemu_cortex_m3` and `qemu_cortex_m0`) |
| WebAssembly | `test_port_timing` | `bun tools/wasm-core/suites.ts` (the C suites of the core, built with the WebAssembly HAL) and the `wasm*.test.ts` files of `bun run test:ide` (with clang and lld; CI installs them) |

### I/O table

The channels of the board description reach the process image through the table, and a channel the port cannot serve is a defined result.

| Port | Checks | How to run |
| --- | --- | --- |
| POSIX host | `test_io_table`, `test_hal_posix_io_table` | `bun run test:core` (CMake and ctest, with the sanitizers in CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.io_table.base`, `zplc.io_table.extended`, `zplc.io_analog.ok`, `zplc.io_analog.missing` | `bun run test:firmware` (Twister on `native_sim` 64 and 32 bits, `qemu_cortex_m3` and `qemu_cortex_m0`) |
| WebAssembly | `test_io_table`, `test_hal_posix_io_table` | `bun tools/wasm-core/suites.ts` (the C suites of the core, built with the WebAssembly HAL) and the `wasm*.test.ts` files of `bun run test:ide` (with clang and lld; CI installs them) |

### Non-volatile storage

The program, the retentive memory, the configuration and the credentials are stored, restored and refused when they are not whole.

| Port | Checks | How to run |
| --- | --- | --- |
| POSIX host | `test_hal_posix_persist`, `test_program_store`, `test_retain` | `bun run test:core` (CMake and ctest, with the sanitizers in CI) |
| Zephyr (`native_sim`, QEMU) | `zplc.hal_persist_keys`, `zplc.program_store`, `zplc.program_store_nvs`, `zplc.retain_persist` | `bun run test:firmware` (Twister on `native_sim` 64 and 32 bits, `qemu_cortex_m3` and `qemu_cortex_m0`) |
| WebAssembly | `packages/zplc-ide/src/runtime/wasmPortSuites.test.ts`, `packages/zplc-ide/src/runtime/wasmRetain.test.ts` | `bun tools/wasm-core/suites.ts` (the C suites of the core, built with the WebAssembly HAL) and the `wasm*.test.ts` files of `bun run test:ide` (with clang and lld; CI installs them) |

## What the suite shows about the ports today

The timing self-test reports the smallest advance of the tick that a sleep of 1 ms makes. On the POSIX host it is 1 ms. On the Zephyr targets of the suite (`native_sim` and QEMU Cortex-M3) the kernel tick is 10 ms (100 ticks per second, the default of the kernel) and a sleep of 1 ms moves the tick by 20 ms, so neither the clock nor the kernel timers of these targets resolve an interval shorter than that. The figure belongs to the build configuration of the suite; it is not a measurement of a board (HIL-010 holds the bench).

The WebAssembly port runs every category. Its C suites are the files that ctest runs on the POSIX host, built by `tools/wasm-core/suites.ts` with the HAL port of the runtime that the ZPLC application ships, and they give the same counts (164 checks of the scheduler core, 2796 of the sandbox). They run under Bun, not in a browser engine: the clock of the timing self-test is the host's `performance.now()`, with a resolution of 1 ms there, and in a browser that clock has the resolution, the jitter and the throttling of a background tab that the browser gives it (IDE-025 owns the browser-engine test of the adapter). A module cannot hand its one thread back to the host, so the sleep of the port spins on the host's clock; the runtime itself never sleeps, because the host polls it. Its storage is the record store of the host: the ZPLC application keeps the retentive memory with the open project and the stored program in the memory of the page. The port has no device link and no network, so it has no configuration and no credentials to store.

{/* <<< END GENERATED: runtime/port-interface <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
