---
title: HAL ports
sidebar_label: HAL ports
description: "What the Zephyr, POSIX, WebAssembly and FreeRTOS ports of the hardware abstraction layer do with the contract, and how to add a port."
tags: [runtime, embedded, hal]
---

# Hardware Abstraction Layer (HAL): the ports

The [HAL contract](./hal-contract.md) says what the portable core asks of a platform.
This page says what each port in the source tree does with it, and what adding a port
takes. The contract is `firmware/lib/zplc_core/include/zplc_hal.h`; the ports are the
four directories below `firmware/lib/zplc_core/src/hal/`.

```mermaid
graph TB
    subgraph "ZPLC core"
        VM[Virtual machine]
        Scheduler[Task scheduler]
    end

    HAL[zplc_hal.h]

    subgraph "Ports"
        Zephyr[Zephyr]
        POSIX[POSIX]
        WASM[WebAssembly]
        FreeRTOS[FreeRTOS]
    end

    VM --> HAL
    Scheduler --> HAL
    HAL --> Zephyr
    HAL --> POSIX
    HAL --> WASM
    HAL --> FreeRTOS
```

## The four ports

| | Zephyr | POSIX | WebAssembly | FreeRTOS |
| --- | --- | --- | --- | --- |
| Source | `zephyr/zplc_hal_zephyr.c` | `posix/zplc_hal_posix.c` | `wasm/zplc_hal_wasm.c` | `freertos/zplc_hal_freertos.c` and `freertos/zplc_persist_freertos.c` |
| Used by | The firmware of every board | The native simulator, `zplc_runtime`, that Studio and the command line run programs and scenarios on | The browser runtime of Studio (`tools/wasm-core` builds it with `clang` and `wasm-ld`): the web build, and the desktop app where the native runtime cannot start. See [Browser runtime](./browser-runtime.md) | The FreeRTOS port, built by `ZPLC_PORT=freertos` against the FreeRTOS POSIX/GCC simulator and shown there only: the second embedded port that is not Zephyr (decision D-06). No FreeRTOS board is qualified |
| Time | `k_uptime_get()`, and `k_msleep()` to sleep | `CLOCK_MONOTONIC`; a scenario can replace it with a logical clock (`zplc_hal_posix_set_tick_override`) | The page's clock, through the import `zplc_host.clock_ms` (`performance.now()` in Studio); the scenario clock of the POSIX port is also here | The tick of the kernel, 1 kHz, and `vTaskDelay()` to sleep; the scenario clock of the POSIX port is also here. The simulator is not real-time: its tick runs slower than the wall clock under load |
| Digital and analog I/O | GPIO and ADC drivers, for the channels of the board description in `boards.json`: outputs are numbered first, then inputs. Analog outputs answer `ZPLC_HAL_NOT_IMPL` | None: the functions answer `ZPLC_HAL_NOT_IMPL`, because the host runtime exchanges the process image with Studio | None: the functions answer `ZPLC_HAL_NOT_IMPL` and the I/O table is empty, as on the POSIX port | A simulated board, `freertos-sim`: eight digital outputs, eight digital inputs and one analog word each way, behind pins that a test writes and reads. A channel past those answers `ZPLC_HAL_NOT_IMPL` |
| Persistence | NVS on the `storage_partition` of the board when `CONFIG_NVS` is on, and `ZPLC_HAL_NOT_IMPL` when it is off | One file `<key>.bin` per key, in `$ZPLC_PERSIST_ROOT` when that variable is set, and in `~/.zplc` otherwise | The imports `persist_save`, `persist_load` and `persist_delete` of the page, which keeps the `RETAIN` records in the `build/retain` folder of the open project | One file `<key>.bin` per key, written to a temporary name, flushed and renamed, in `$ZPLC_PERSIST_ROOT` or `~/.zplc`: the flash model of the simulator, which a board replaces with its flash driver |
| Network and sockets | The Zephyr network stack when `CONFIG_NETWORKING` is on, and `ZPLC_HAL_NOT_IMPL` when it is off | `ZPLC_HAL_NOT_IMPL` | `ZPLC_HAL_NOT_IMPL` | `ZPLC_HAL_NOT_IMPL` |

A function that a platform cannot perform returns `ZPLC_HAL_NOT_IMPL`, which is the
defined "not supported" result; it is never left undefined. The pages on the
[contract](./hal-contract.md#digital-and-analog-io) and on the
[supported boards](../reference/boards.md) say which channels a board has and how the
I/O table is generated.

The scan skips a channel whose operation answers `ZPLC_HAL_NOT_IMPL`, so that one missing converter does not stop the controller, and it does not hide it: the runtime counts the input and output channels it could not serve (each channel once) and reports them. The `zplc status` command lists them in `warnings` (`io_unsupported`) with the counts, prints a warning in its text form, and the device link sends a warning on its log events whenever the count changes (and to a client that subscribes later). Studio shows the line in the console of the connected device. This is verified with C tests on the host and with a Studio test; what a particular board does with a missing converter is not verified on hardware.

## What a Zephyr board sets

The sizes of the program store and of the memories are Kconfig symbols of the module.
A board that has less memory than the defaults sets them in its
`firmware/app/boards/<board>.conf`, and the manifest repeats the same numbers (a
build fails when the two differ):

```ini
# default 8192
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192
# default 4096
CONFIG_ZPLC_RETAIN_MEMORY_SIZE=4096
# default 45056
CONFIG_ZPLC_CODE_SIZE_MAX=24576

# Persistence: NVS needs the flash driver, the partition map and a storage_partition
CONFIG_FLASH=y
CONFIG_FLASH_PAGE_LAYOUT=y
CONFIG_FLASH_MAP=y
CONFIG_NVS=y
```

The board overlay defines `storage_partition` unless the upstream board already does.
The [Kconfig reference](../reference/kconfig.md) lists every symbol with its default
and range.

## Adding a port

1. Add `src/hal/<platform>/zplc_hal_<platform>.c` next to the other ports and define
   every function that `zplc_hal.h` declares. Answer `ZPLC_HAL_NOT_IMPL` for what the
   platform cannot do.
2. Build it with the core: the portable sources are `src/core/*.c`, which must not
   include a platform header (a target of that CMake builds them alone and stops on a
   platform include), and the port is listed in the CMake of
   `firmware/lib/zplc_core` the way the POSIX port is.
3. Add the port to `PORTS` in `tools/ci/check_hal_contract.py` and run it. It fails when a
   declared function has no definition on a port, has no caller outside the ports and
   the tests, or has a stale entry in `tools/ci/hal-contract.json`:

   ```bash
   python3 tools/ci/check_hal_contract.py
   ```

4. Run the core tests (`bun run test:core`), which build the core with the address and
   undefined-behaviour sanitizers. A port that is not the host build runs the conformance
   suite on its own build, as the FreeRTOS port does with `bash tools/freertos/test.sh`.

For a board, and not a platform, see [Port ZPLC to a new board](../guides/port-to-a-board.md).

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| Each port defines every function of the contract, and each function has a caller or a ledger entry | `tools/ci/check_hal_contract.py` in CI | Host |
| The statements of the table above | Read from the four port sources on the date of this page; they are not behind a test of their own | None |
| The FreeRTOS port passes the port conformance suite | `bash tools/freertos/test.sh` on the FreeRTOS POSIX simulator; the `freertos-port` job of CI runs the same commands (the workflow is written, and has not run on GitHub yet) | Host (simulator) |
| A FreeRTOS board behaves as the contract says | Not applicable: no FreeRTOS board port exists | None |
| A port other than the four behaves as the contract says | Not applicable: no other port exists | None |
