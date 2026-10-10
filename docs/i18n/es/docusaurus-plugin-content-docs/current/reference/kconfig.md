---
title: "Opciones de Kconfig"
sidebar_label: "Opciones de Kconfig"
description: "Todos los símbolos de Kconfig del módulo del runtime ZPLC, leídos de su archivo Kconfig."
tags: [reference, generated]
---

# Opciones de Kconfig

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/kconfig. Do not edit. >>> */}

El módulo del runtime ZPLC define 26 símbolos de Kconfig. Se fija uno en el `prj.conf` de una aplicación o en un overlay de placa como `CONFIG_<SÍMBOLO>=valor`; un símbolo que depende de otro solo está disponible mientras ese otro esté habilitado.

Esta tabla se lee del archivo fuente `firmware/zephyr/Kconfig`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

| Símbolo | Tipo | Predeterminado | Rango | Depende de | Descripción |
| --- | --- | --- | --- | --- | --- |
| `CONFIG_ZPLC` | `bool` |   |   |   | Enable the ZPLC IEC 61131-3 PLC runtime. This provides a portable virtual machine for executing PLC programs compiled to the .zplc bytecode format. |
| `CONFIG_ZPLC_STACK_DEPTH` | `int` | `256` |   | `CONFIG_ZPLC` | Maximum depth of the VM evaluation stack. Each entry is 4 bytes (32-bit). |
| `CONFIG_ZPLC_CALL_STACK_DEPTH` | `int` | `32` |   | `CONFIG_ZPLC` | Maximum call nesting depth for subroutines. |
| `CONFIG_ZPLC_WORK_MEMORY_SIZE` | `int` | `8192` |   | `CONFIG_ZPLC` | Size of the work memory region for temporary variables. |
| `CONFIG_ZPLC_RETAIN_MEMORY_SIZE` | `int` | `4096` |   | `CONFIG_ZPLC` | Size of the retentive memory region. This memory is persisted across power cycles. |
| `CONFIG_ZPLC_CODE_SIZE_MAX` | `int` | `45056` |   | `CONFIG_ZPLC` | Maximum size of the bytecode segment. |
| `CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK` | `hex` | `0x0` | `0x0` to `0xF` | `CONFIG_ZPLC` | Bit mask of logical DO0-DO3 channels that must be configured from DeviceTree for this profile to initialize the Zephyr HAL. A missing or unconfigurable required channel fails HAL initialization; this setting does not qualify the electrical behavior of any mapped pin. |
| `CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET` | `int` | `100000` | `1` to `10000000` | `CONFIG_ZPLC` | Maximum VM instructions permitted in one production PLC scan. Reaching the limit is a controlled logical VM watchdog fault. It is not a physical watchdog, timing measurement, or WCET guarantee. |
| `CONFIG_ZPLC_LOG_LEVEL` | `int` | `3` | `0` to `4` | `CONFIG_ZPLC` | Log level for ZPLC runtime. 0=OFF, 1=ERR, 2=WRN, 3=INF, 4=DBG |
| `CONFIG_ZPLC_SCHEDULER` | `bool` | `n` |   | `CONFIG_ZPLC` | Enable the ZPLC multitask scheduler. Allows running multiple PLC tasks with different intervals and priorities using Zephyr's k_timer and work queue system. |
| `CONFIG_ZPLC_HARDWARE_WATCHDOG` | `bool` | `n` |   | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_WATCHDOG` | Arms the Zephyr watchdog only while a ZPLC scheduler batch completes input snapshot, all due tasks, deadline checks, and one normal output commit. It is never fed by an ISR, timer, shell, network, or idle path. This default is intentionally off. Enable it only in an exact board/revision profile after HIL has verified watchdog reset timing and safe outputs. The VM instruction budget remains a logical fault limit; it is not this physical watchdog. |
| `CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MS` | `int` | `1000` | `100` to `60000` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_HARDWARE_WATCHDOG` | Exact profile-owned timeout passed to the Zephyr watchdog driver. This setting has no evidence value until HIL verifies the selected device. |
| `CONFIG_ZPLC_MAX_TASKS` | `int` | `8` | `2` to `16` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER` | Maximum number of PLC tasks that can be registered. Each task requires approximately 1KB of RAM for its VM state. |
| `CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE` | `int` | `2048` |   | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER` | Stack size for the scheduler work queue thread. Increase if tasks require deeper call stacks. |
| `CONFIG_ZPLC_SCHED_WORKQ_PRIORITY` | `int` | `5` | `0` to `14` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER` | Priority of the scheduler work queue thread. Lower values = higher priority. 0 = highest (preempts almost everything) 14 = lowest cooperative priority |
| `CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ` | `bool` | `y` |   | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER` | Run the single scheduler batch coordinator on a dedicated high-priority work queue. Task ordering remains deterministic within each batch. |
| `CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE` | `int` | `2048` |   | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ` | Stack size for the high-priority work queue thread. |
| `CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY` | `int` | `2` | `0` to `14` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ` | Priority of the high-priority work queue thread. Should be lower (higher priority) than ZPLC_SCHED_WORKQ_PRIORITY. |
| `CONFIG_ZPLC_RETAIN_PERSIST` | `bool` |   |   | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ` | Off by default: the flash write path has been exercised on native_sim and QEMU only, and on several boards the storage partition is also used by another file system. Turn it on for a board once that board has passed its hardware record (HIL-010). Restores the RETAIN region when a program is loaded or restored at boot, before the first scan, and stores it on STOP and periodically while the program runs. A record carries a checksum, a layout hash and the program identity, two records alternate, and a record is restored only when both the identity and the layout match; otherwise the region is initialised and the status says why. The stores go through zplc_hal_persist_*, so this needs a working persistence backend (CONFIG_NVS on the boards of this repository). Periodic saves run on the normal-priority scheduler work queue, never in the scan batch and never with the memory lock held. Whether a flash write stalls the scan depends on the flash driver and has not been measured on any board: see docs/docs/runtime/persistence.md. |
| `CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S` | `int` | `3600` | `0` to `86400` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_RETAIN_PERSIST` | A running program stores its RETAIN region at most once per interval, and only when the region changed. 0 turns periodic saves off: only STOP stores. The build fails when this interval wears the storage flash out before ZPLC_RETAIN_LIFE_YEARS, using ZPLC_RETAIN_FLASH_ENDURANCE_CYCLES and ZPLC_RETAIN_FLASH_WEAR_BYTES. The default is deliberately long: a board states its own numbers in its board file to earn a shorter interval. |
| `CONFIG_ZPLC_RETAIN_FLASH_ENDURANCE_CYCLES` | `int` | `10000` | `100` to `1000000000` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_RETAIN_PERSIST` | From the datasheet of the part that holds the storage partition. This is an engineering input, not a measurement, and the default is the lowest class of NOR flash. |
| `CONFIG_ZPLC_RETAIN_FLASH_WEAR_BYTES` | `int` | `40000` | `1024` to `1000000000` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_RETAIN_PERSIST` | (sectors - 1) * sector size, minus the live data that garbage collection copies at every rotation (the two program slots, about 8300 bytes). One sector is always kept free for garbage collection. |
| `CONFIG_ZPLC_RETAIN_ENTRY_OVERHEAD` | `int` | `64` | `0` to `4096` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_RETAIN_PERSIST` | Entry header and alignment of one chunk: 8 bytes for the NVS allocation entry, a data CRC if enabled, and the padding to the flash write block. The default covers a 32-byte write block. |
| `CONFIG_ZPLC_RETAIN_LIFE_YEARS` | `int` | `10` | `1` to `50` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_RETAIN_PERSIST` | Flash life the save interval must reach (years) |
| `CONFIG_ZPLC_RETAIN_CHUNK_SIZE` | `int` | `1024` | `128` to `4096` | `CONFIG_ZPLC`, `CONFIG_ZPLC_SCHEDULER`, `CONFIG_ZPLC_RETAIN_PERSIST` | The RETAIN record is cut into chunks of this size. A chunk plus the backend overhead must fit one erase sector minus four allocation entries (the NVS limit): 1024 fits a 4 KB sector. The region needs at most eight chunks. |
| `CONFIG_ZPLC_HIL_DEBUG` | `bool` | `n` |   | `CONFIG_ZPLC` | Enables Hardware-in-the-Loop debugging features. Adds JSON trace output for VM introspection and testing. When enabled, the runtime emits structured JSON debug frames over serial for automated testing and validation. |

{/* <<< END GENERATED: reference/kconfig <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
