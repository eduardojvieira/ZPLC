---
sidebar_position: 3
slug: /runtime/persistence
id: persistence
title: Persistence and retained memory
sidebar_label: Persistence
description: 'What ZPLC stores across a restart: the verified program and the RETAIN region, how a power cut is survived, what a restart restores, the flash-wear budget of each board and what has not been measured.'
---

# Persistence and retained memory

ZPLC keeps two things across a restart: the verified program, and the values of variables declared `RETAIN`. This page says where each is stored, how a power cut is survived, what a restart restores and how long the flash of each board lasts. Read it before you depend on a value surviving a restart.

A restore publishes the program as stopped and ready. It never starts it: a person issues `zplc start`. What the outputs do before that is the safe state in [the scheduler page](./scheduler.md#safe-state-of-an-output), and it needs recorded evidence on the exact board.

## Where things are stored

The core stores through the HAL persistence calls, so each platform keeps the same records in its own way.

| Platform                       | Backend                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zephyr firmware                | The program store, when the profile enables it, uses NVS, or ZMS on a board whose flash sectors are above the 64 KB that NVS accepts (the Nucleo-H743ZI). The `RETAIN` records, the settings keys and the credentials use the same HAL calls.                                                           |
| Native simulation              | Files in the persistence directory (`ZPLC_PERSIST_ROOT`, `~/.zplc` by default): the program store and the `RETAIN` records.                                                                                                                                                                             |
| Software runtime (WebAssembly) | The `RETAIN` records go through the HAL calls of the module to the host page, which keeps them in the `build/retain` folder of the open project, or in the memory of the page when no project is open. The program store of the session is in memory. See [the software runtime](./browser-runtime.md). |

## Keeping the program

When a profile has an operational program store, a verified `.zplc` load is committed through it. At boot the store provides the artifact for verification and the runtime restores it stopped.

```mermaid
flowchart LR
  Load[Verified .zplc upload] --> Save[Program-store commit]
  Save --> Ready[Loaded and stopped]
  Boot[Device reboot] --> Restore[Verify and restore]
  Restore --> Ready
  Ready --> Start[Explicit zplc start]
```

### How the store survives a power cut

The store has two slots, A and B, and a small active record that names the slot to run. A slot is the artifact, an 8-byte footer (`ZPE1` and the artifact length) and a 32-byte metadata record, and every record carries a CRC-32 and the format version. The host runtime and the firmware run the same code, `zplc_program_store.c`, over the HAL persistence calls.

A deploy writes the slot that is not active, reads it back and verifies it, writes the metadata as prepared and reads it back, and only then writes the active record. That write is the single point at which the new program becomes the one to restore. The metadata is then rewritten as committed.

| A power cut ...                                           | What the next restore finds                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| before the active record is written                       | The previous program. A store that never held one is empty.                                                |
| in the middle of the new payload                          | The previous program: a slot half old and half new fails the CRC-32 of its artifact and is never accepted. |
| after the active record, before the metadata is rewritten | The new program: the slot was read back before the pointer moved.                                          |
| that damages the active record                            | The newest complete committed slot.                                                                        |

Records that exist and verify as nothing are never read as an empty store: the restore reports them as unverifiable, and a deploy refuses to write over them. A store written by the first firmware (one key, `code_len` and `code`) is restored as it is and migrated at the next deploy.

A flash key-value store keeps an entry inside one erase sector, so a payload is cut into chunks of `CONFIG_ZPLC_PROGRAM_STORE_CHUNK_SIZE` bytes (1024 by default), each under its own key.

### The size of a program

The largest artifact is one number, `CONFIG_ZPLC_CODE_SIZE_MAX`. It is the code region, the largest artifact the loader accepts, the size of the staging and restore buffers, the `max_artifact_size` that `zplc sys info` reports and the size ZPLC is told for the board. The build fails when two slots of that size, in chunks, do not fit the storage partition. The Raspberry Pi Pico and Waveshare RP2040-Zero profiles set 24576 bytes (their 128 KB partition also holds the RETAIN records), the STM32F746G Discovery profile 16384 and the Arduino Opta WiFi profile 32768 (their RAM), the ESP32-S3 profile keeps its 8192, and the other profiles keep 45056. The upload staging buffer and the VM each hold one program in RAM, so a profile spends twice its code size.

### Rolling back a failed deploy

A deploy has to know, before it writes, that there is a real program to fall back to. The store reads that program into the staging buffer when an upload starts (`zplc load`, `zplc sched load` and the start of a program transfer of the device link), while the buffer is free. The commit at the end goes ahead only when the active record and the two metadata records are still the ones the answer was read from; otherwise nothing is written. A store whose records verify as nothing gives no rollback, and the commit refuses.

### Evidence

Evidence level: host and emulated target. A power cut was injected at every operation of a deploy and a torn write at every record, on the host (`test_program_store`, which also sweeps the deploy the way the firmware makes it), and at every operation of a deploy of the largest size over the NVS flash simulator on `native_sim` (`program_store_nvs`). A power cut on a board has not been tried: the flash driver, the erase time and the supply of each profile need the hardware record of that profile.

## Retained variables

The compiler accepts `VAR RETAIN` and `VAR_GLOBAL RETAIN`, places those variables in the retentive region (address `0x4000`, 4 KB by default) and applies their declared initial values only when the region holds no saved state. The runtime saves the region and restores it when the same program is loaded again. For a guide to using them in a project, see [Retained variables](../guides/retained-variables.md).

Everything below is host, simulator and build-level evidence. No board has been measured, and none has been through a power cut under test.

### What is saved, and when

| Moment                             | What happens                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Program load, and restore at boot  | The region is restored from the stored records before the first scan, or initialised to zero when no record matches. The status says which. |
| `STOP` (commanded)                 | The region is stored with the values of the last complete scan. A stop of a faulted runtime stores nothing.                                 |
| While running                      | The region is stored at most once per interval, at a scan boundary, and only when it changed since the last stored record.                  |
| Clean shutdown of the host runtime | Stored like a `STOP`.                                                                                                                       |
| Reset (`execution.reset`)          | A cold restart: the region is initialised and that initialised region is stored, so the old values do not come back.                        |

On the firmware a periodic save runs on its own work queue, outside the scan, and holds the memory lock only for the copy of the region, never during the write to storage. On the host it runs in the main loop between two scans. A power cut between two saves loses the changes since the last record, which is why the interval exists; the flash budget below bounds it from the other side.

### The record

Two records alternate, so a power cut during a save never destroys the last good one. A save writes the older slot with a sequence number one above the newest. Each record is cut into chunks of at most `CONFIG_ZPLC_RETAIN_CHUNK_SIZE` bytes (1024 by default), stored under the keys `retain_a0`, `retain_a1`, ... and `retain_b0`, ..., because a storage entry can be smaller than the region.

| Offset | Size | Field                                                       |
| ------ | ---- | ----------------------------------------------------------- |
| 0      | 4    | Magic `ZRTN`                                                |
| 4      | 2    | Format version, 1                                           |
| 6      | 2    | Reserved, zero                                              |
| 8      | 4    | Sequence number, never 0                                    |
| 12     | 4    | Program identity: the CRC32 word of the artifact header     |
| 16     | 4    | Program identity: the code-size word of the artifact header |
| 20     | 4    | Layout hash                                                 |
| 24     | 4    | Payload length, the size of the `RETAIN` region             |
| 28     | n    | Payload, the region bytes                                   |
| 28+n   | 4    | CRC-32 of every byte before it                              |

The layout hash is a CRC-32 over the region size, the region address, the ISA version, the contract draft counter and the program identity. A program that changes by one byte has another identity, so a rebuild discards the retained values: the runtime has no variable-level layout to carry them across a change.

### What a restart does

The restore takes the valid record with the highest sequence whose identity and layout match. If a record fails its checksum, the other one is tried. If none matches, the region is set to zero and the status says why:

| `reason`            | Meaning                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `restored`          | A valid record of this program and layout was restored.                                              |
| `none`              | No record in either slot: first start, erased storage, or no storage backend.                        |
| `identity_mismatch` | Valid records exist, written by another program.                                                     |
| `layout_mismatch`   | The same program, but another region size, address or runtime layout.                                |
| `corrupt`           | Records exist and none passes the format and checksum checks.                                        |
| `io_error`          | The storage backend failed on both slots. Saves are refused until a restore reads the backend again. |
| `reset`             | A reset command initialised the region.                                                              |
| `not_restored`      | No program is loaded.                                                                                |

The status of the native runtime carries this next to the existing fields:

```json
"retain": {"reason": "restored", "restored": true, "sequence": 12, "saves": 3, "save_errors": 0, "saved_at_ms": 94000}
```

`saved_at_ms` is the runtime uptime of the last record written in this session, or `null` when none was. On the firmware the same values are in `zplc sched status` and `zplc sched status --json`.

### Host and WebAssembly runtimes

The POSIX host applies the same module and rules. Its periodic save interval is 30 seconds by default and can be set with the environment variable `ZPLC_RETAIN_SAVE_INTERVAL_MS`: `0` turns periodic saves off (a `STOP` and a shutdown still store), a value from 100 to 86400000 sets the interval, and any other value is ignored with a message on standard error. A program on the host simulator therefore keeps its `RETAIN` values from one session to the next, as a controller does; use `execution.reset`, or another persistence directory, to start from the declared values.

The WebAssembly runtime links the same module. It saves on `STOP`, on `execution.reset` and at shutdown, and restores when a program loads. The page keeps the records in the `build/retain` folder of the open project, or in its memory when no project is open. The periodic interval is 30 seconds, because a module has no environment variable. The write to the folder follows the call that saves, so a page closed between the two can lose that one record; the previous one stays valid because two records alternate.

### Enabling it on a firmware board

`CONFIG_ZPLC_RETAIN_PERSIST` is on in the profile of every shipped board. The option itself defaults to off, so a board file of your own must set `CONFIG_ZPLC_RETAIN_PERSIST=y`. The write path is covered by the `retain_persist` suite on `native_sim` and by the build-time wear assertion below, and a flash write can stall instruction fetch on parts that run from the same flash. Being on is not a hardware record: that a value survives a power cycle on a board is what the power-cycle step of the hardware-in-the-loop plan measures, on the HIL image (`-DCONFIG_ZPLC_HIL_IMAGE=y`, which never ships), and that image costs about 8.5 KB of RAM more on the RP2040 profiles.

## Flash wear budget per board

Every save of a changed region costs flash erases, and the worst case is a region that changes in every interval. For a board:

- one save writes the record plus the entry overhead of each chunk (about 64 bytes each, an estimate that covers a 32-byte write block);
- the storage partition takes in the wear bytes of the table per erase of every sector: the sectors minus the one NVS keeps free, minus the live data that garbage collection copies at every rotation (the two program slots and the RETAIN record not being written; on the Pico about 59,000 bytes);
- the flash is rated for a number of erase cycles per sector.

Saves the flash takes = erase cycles x wear bytes / bytes per save, and life = saves x interval. The build fails when the interval makes that life shorter than `CONFIG_ZPLC_RETAIN_LIFE_YEARS` (10 by default), so a board cannot ship an interval its own numbers do not support.

Every number below is an engineering estimate from the datasheet class of the part and the partition layout of the board file. No board was measured.

| Board                            | Storage partition                                                                    | RETAIN | Rated cycles | Wear bytes | Interval | Estimated worst-case life |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------ | ------------ | ---------- | -------- | ------------------------- |
| Raspberry Pi Pico (RP2040)       | 128 KB of the on-board QSPI NOR, 32 sectors of 4 KB                                  | 4 KB   | 100,000      | 67,000     | 300 s    | 14.3 years                |
| Arduino GIGA R1 (STM32H747 M7)   | `zplc_nvs_partition`: 7 MB of the external QSPI NOR, 4 KB sectors assumed            | 4 KB   | 100,000      | 7,300,000  | 60 s     | more than 100 years       |
| Arduino Opta WiFi (STM32H747 M7) | `zplc_nvs_partition`: 7 MB of the external QSPI NOR, 4 KB sectors assumed            | 4 KB   | 100,000      | 7,300,000  | 60 s     | more than 100 years       |
| STM32F746G Discovery             | `zplc_nvs_partition`: 15 MB of the external QSPI NOR, 4 KB sub-sectors assumed       | 4 KB   | 100,000      | 15,700,000 | 60 s     | more than 100 years       |
| ESP32-S3-DevKitC-1 (N8R8)        | `zplc_nvs_partition`: 192 KB of the module SPI NOR at 4 MB, 48 sectors of 4 KB       | 1 KB   | 100,000      | 184,000    | 60 s     | 29.5 years                |
| STM32 Nucleo-H743ZI              | `zplc_nvs_partition`: 384 KB of the internal flash, 3 sectors of 128 KB, kept by ZMS | 4 KB   | 10,000       | 253,000    | 600 s    | 10.8 years                |
| A board with no numbers          | any                                                                                  | any    | 10,000       | 40,000     | 3600 s   | 10.3 years for 4 KB       |

Read the Pico row twice: at 30 seconds, the host default, the same board would wear its storage out in about 1.4 years. The interval is a minimum, since a region that does not change is never written, so a program whose retained values change rarely wears the flash far less than this table says.

A `STOP` of a changed region is one more save and is not part of the budget, because it is a person's command. A script that stops and starts the controller every few seconds, with retained values that change in every run, spends the budget of a year in days.

## Which store takes which partition

A firmware board has up to two stores in flash: the records of the HAL (the program slots, `RETAIN`, the settings keys `cfg_00` to `cfg_99` and the credentials) and, on the network boards, the settings file system (LittleFS: the settings file, the certificate files and, where the Wi-Fi credentials go through the settings, those). Two stores on one partition overwrite each other, so each has its own. The HAL takes `zplc_nvs_partition` when the devicetree of the board defines it, and `storage_partition` otherwise; the settings file system mounts `storage_partition`. The build stops when a board that builds the file system has no `zplc_nvs_partition`, or when the two overlap.

A certificate or key setting (`mqtt_ca_cert_path`, `mqtt_client_cert_path`, `mqtt_client_key_path`, `aws_claim_cert_path`, `aws_claim_key_path`) names a file of the file system or one of the two credential records, `persist://aws_cert_pem` and `persist://aws_key_pem`. `zplc config set` refuses any other `persist://` name, a stored value that holds one is not applied, and it is never read: no setting can hand the program or a key of the device link to the TLS stack.

| Board                            | Records of the HAL                                                                        | Settings file system                                          | Image slot                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Raspberry Pi Pico (RP2040)       | NVS, `storage_partition`, 128 KB at 0x1e0000 of the on-board QSPI NOR                     | not built in                                                  | `code_partition`, 0x100 to 0x1e0000                          |
| Waveshare RP2040-Zero            | NVS, `storage_partition`, 128 KB at 0x1e0000 of the on-board QSPI NOR                     | not built in                                                  | `code_partition`, 0x100 to 0x1e0000                          |
| ESP32-S3-DevKitC-1 (N8R8)        | NVS, `zplc_nvs_partition`, 192 KB at 0x400000 of the module SPI NOR                       | `storage_partition`, 192 KB at 0x3b0000                       | 0 to 0x101c00, the flash budget of the board                 |
| Arduino GIGA R1 (STM32H747 M7)   | NVS, `zplc_nvs_partition`, 7 MB at 0x700000 of the external QSPI NOR                      | `storage_partition`, 1 MB at 0x600000 of the QSPI NOR         | `slot0_partition`, 0x40000 to 0x100000 of the internal flash |
| Arduino Opta WiFi (STM32H747 M7) | NVS, `zplc_nvs_partition`, 7 MB at 0x700000 of the external QSPI NOR                      | `storage_partition`, 1 MB at 0x600000 of the QSPI NOR         | `slot0_partition`, 0x40000 to 0x100000 of the internal flash |
| STM32F746G Discovery             | NVS, `zplc_nvs_partition`, 15 MB at 0xa0000 of the external QSPI NOR                      | `storage_partition`, 640 KB at 0 of the QSPI NOR              | 0 to 1 MB, the internal flash                                |
| STM32 Nucleo-H743ZI              | ZMS, `zplc_nvs_partition`, 384 KB at 0x1a0000 of the internal flash (3 sectors of 128 KB) | `storage_partition`, 1152 KB at 0x80000 of the internal flash | `slot0_partition`, 0 to 512 KB                               |

The addresses are those of the devicetree of each build. `tools/hil/check_storage_partitions.py` reads them from the `zephyr.dts` and `.config` that `run.sh size` keeps for every board, and fails when two stores share or overlap a partition, when a store holds fewer than two erase blocks or blocks its backend cannot mount (NVS refuses a sector above 64 KB), or when a store lies inside the image slot, the flash range the linker may fill with the image. The two RP2040 boards end their `code_partition` before the records, so the linker refuses an image that would grow into them. The ESP32-S3 linker does not bound the image, so its slot is the flash budget of the board, which the size check of the same run enforces. All seven boards pass, and `tools/hil/storage-partitions-open.json`, the list of boards with a known failure, is empty. For the learner boards, a test of the board description also fails when two stores share a partition. Evidence level: target build. How the flash of each board behaves is the bench of the hardware-in-the-loop plan, and no board was measured.

:::note
The settings file system now mounts on every board that builds it, and formats `storage_partition` at the first start after the update. On the GIGA R1, the Opta and the STM32F746G the records of the HAL keep the area they had, so the board keeps its stored program, `RETAIN` values and settings keys. An ESP32-S3 that ran an earlier image kept its records in `storage_partition`, so after the update its stored program, `RETAIN` values and settings keys are not carried over: deploy the program again and enter the settings again.
:::

## Limits

- **Not measured:** the endurance numbers come from the datasheet class of the parts, and the partition layouts of the GIGA, Opta and F746G are read from the board description, not from a board.
- **Not proven:** that a save survives a power cut on any board. The record format and the order of the writes are tested with failures injected at every step on the host and on `native_sim`, and that is all.
- **Not measured:** how long a flash write stalls the processor. On parts that run code from the same flash, a write can hold instruction fetch for the length of an erase. The periodic save runs on its own work queue, but whether a scan is delayed depends on the flash driver.
- **Not proven on a board:** that the two stores of a board keep each other's data. Their partitions are separate in every build, and on `native_sim` the settings file system and the records are written side by side and both read back (`hal_persist_keys`).
- **ZMS:** the Nucleo-H743ZI keeps its records in ZMS, which `hal_persist_keys` runs on `native_sim`; no board has run it. Its profile saves the `RETAIN` region at most every 600 s, because its flash is rated for 10,000 erase cycles.
- A rebuild of the program, even one that only moves code, changes its identity and discards the retained values.
- The single-task firmware mode (scheduler disabled) does not persist `RETAIN`.
- Do not rely on `RETAIN` for recovery-critical state until the hardware records of the exact profile exist: a power cut at the wrong time loses the values since the last save.
