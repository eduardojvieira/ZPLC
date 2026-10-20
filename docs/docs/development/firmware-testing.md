---
slug: /development/firmware-testing
title: Firmware Testing on Linux
sidebar_label: Firmware Testing
description: Run the ZPLC firmware suites on a Linux machine, on 64-bit and 32-bit native_sim and on QEMU Cortex-M3 and Cortex-M0, and check the flash and RAM budgets.
---

# Firmware Testing on Linux

This page describes the one method a contributor uses to test the firmware on
a Linux machine: the scripts under `tools/firmware-test/`. They run the same
suites as the continuous-integration Zephyr jobs, on more targets, against a
Zephyr workspace that lives outside the repository.

Everything here is host, simulator or build evidence. A passing run does not
show that a board boots, that its pins behave, or that a scan keeps its period
on real silicon. Those claims need the hardware-in-the-loop procedures in
[Hardware support](../reference/capabilities-evidence.md).

## What you need

- Linux on x86-64 with about 15 GB free: the pinned Zephyr workspace is about 6.6 GB
  (measured with `du`, without its build outputs), the Zephyr SDK about 7 GB when installed whole, and the build
  outputs add a few more.
- `git`, `cmake` 3.20 or newer, `ninja`, `dtc`, `gperf`, `python3` 3.10 or
  newer, and a C compiler. The 32-bit modes also need the 32-bit C runtime
  (`lib32-glibc` and `lib32-gcc-libs` on Arch, `gcc-multilib` on Debian and
  Ubuntu).
- The Zephyr SDK 1.0.1 with the `arm-zephyr-eabi` toolchain and the SDK host
  tools, which carry `qemu-system-arm`. The ESP32-S3 size row also needs the
  `xtensa-espressif_esp32s3_zephyr-elf` toolchain.
- Network access the first time, for `west update`.

The scripts read the SDK from `~/zephyr-sdk-1.0.1`. Set
`ZEPHYR_SDK_INSTALL_DIR` to use another location. If the SDK is missing, the
setup script prints the `west sdk install` line to run and does not run it.

## One-time setup

```bash
tools/firmware-test/setup.sh
```

The script is safe to repeat. It creates or verifies, in `~/zplc-zephyr-ws`
(override with `ZPLC_FW_WS`):

- a Python virtual environment with `west` 1.5.0 and the Python packages
  Zephyr needs;
- a `zplc` symlink to your checkout, so west treats the checkout as its
  manifest repository and the tests always run your working tree;
- the Zephyr tree and its modules at the revision pinned in `west.yml`, fetched
  shallow, and a check that the checked-out revision is that pin.

Two choices are deliberate. The workspace is written by hand instead of with
`west init -l`, because `west init -l` resolves the symlink and would create
`.west` next to your real checkout. And `west zephyr-export` is skipped,
because it registers the workspace in `~/.cmake/packages`, where every other
CMake project of your user would find it; `ZEPHYR_BASE` is enough for these
builds. Set `ZPLC_FW_ZEPHYR_EXPORT=1` if you want the export.

Several checkouts or worktrees can share one workspace. `run.sh` points the
`zplc` symlink at the checkout it is run from, so run one checkout at a time.
Use another `ZPLC_FW_WS` for concurrent runs.

## Daily commands

```bash
tools/firmware-test/run.sh native
tools/firmware-test/run.sh host host32 native32 qemu-m3 qemu-m0 app
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh tidy
tools/firmware-test/run.sh all
```

Each mode builds what it needs, runs it without prompting, and exits non-zero
on any failure. The last lines are one summary line per scenario or board. All
output is under `$ZPLC_FW_WS/out`, with one log per mode.

| Mode | What runs | What a pass shows | What it does not show |
|------|-----------|-------------------|-----------------------|
| `host` | The CMake suites of `firmware/lib/zplc_core` under ctest, built with the address and undefined-behaviour sanitizers | VM, loader, dispatch and host runtime behave on a 64-bit host without undefined behaviour | Anything about a 32-bit or Cortex-M target |
| `host32` | The same suites built with `-m32` | The same, with 32-bit `int`, `long` and pointers | Cortex-M behaviour: x86 tolerates unaligned access and has no short enums |
| `native` | The Zephyr suites of `firmware/tests` on `native_sim/native/64`, as CI does | The firmware application logic, the Zephyr HAL and the scheduler against the Zephyr kernel on the host | Timing, interrupts and drivers of a real board |
| `native32` | The same on `native_sim/native`, the 32-bit variant | The same, with a 32-bit data model | The same |
| `qemu-m3` | The Zephyr suites on `qemu_cortex_m3`, plus the core suites | Behaviour on a real Cortex-M instruction set with a 64 KB RAM budget, short enums and a 1 KB default thread stack | Timing: QEMU is not cycle accurate. The VM memory regions are reduced to fit |
| `qemu-m0` | The Cortex-M0 subset on `qemu_cortex_m0` (16 KB of RAM) | Division, shifts, float conversion and unaligned access on an ARMv6-M core with no hardware divide and no unaligned access | The full VM suite: it does not fit, see the limits below |
| `app` | The host test of the Sparkplug encoder in `firmware/app/tests`, against the nanopb files generated by an Arduino Opta build | The encoder produces the expected payloads on a 64-bit host | The MQTT client, TLS or any network behaviour |
| `app-native` | Emulation only: `firmware/app` on `native_sim/native/64` with the Raspberry Pi Pico channel map on emulated GPIO and ADC, booted and driven through its shell; a guard proves the emulation shell command cannot be enabled for a real board | The application, the shell, deploy and the program store work on the Zephyr kernel, and the same reference projects give the same traces as the native runtime ([Emulated HIL bench](hil-emulation.md)) | Pins, drivers, timing or anything about a physical board; it is never a hardware record |
| `size` | `firmware/app` built for every supported board | Flash and RAM of the image against the recorded budget, and that each store of the image has a flash partition of its own (IO-008) | Run-time stack and heap use, or that the image runs |
| `tidy` | `clang-tidy` with the repository's `.clang-tidy`, every finding an error, over the core, the POSIX HAL and the host application; also the Zephyr HAL and `firmware/app` when the Arduino Opta build of `size` or `app` exists | The analysed files have none of the defects the enabled checks look for | That the code is correct, or anything about Xtensa builds, which clang cannot target. `tidy` is not part of `all` because it needs `clang-tidy` |

## Reading the result

A run ends with a block like this one, produced by `run.sh native32`:

```text
PASS native32  zplc.core.vm_core                              1/1 cases
PASS native32  zplc.scheduler_admission                       46/46 cases
PASS native32  zplc.scheduler_run_control                     9/9 cases
PASS native32  19/19 scenarios passed, 0 filtered out
```

To look at one scenario, open its log under the mode's Twister output
directory, or run it alone from the workspace:

```bash
cd ~/zplc-zephyr-ws && west twister -T zplc/firmware/tests -p qemu_cortex_m3 -s zplc.program_store --inline-logs
```

A scenario that Twister marks `skipped`, for example for a RAM overflow, is
reported as a failure here. A filtered scenario, one that does not list the
platform, is not counted.

## What the suites cover

The Zephyr suites live in `firmware/tests`. Each has a `testcase.yaml` that
lists the platforms it is allowed on. The plain C suites of
`firmware/lib/zplc_core/tests` also run on Zephyr targets through
`firmware/tests/core_suites`, which compiles the same source files and calls
each suite from a test case.

The VM suites name a memory profile in the scenario, so a result always says
which sizes it was made with:

- no suffix: the ISA default sizes (8 KB work, 4 KB retentive, 44 KB code),
  used on `native_sim`;
- `.small`: 4 KB work, 2 KB retentive and 16 KB code, used on
  `qemu_cortex_m3`;
- `.tiny`: 256 B work, 64 B retentive, 512 B code, four tags and a 32-entry
  stack, used on `qemu_cortex_m0`.

The process images are 4 KB each in every profile because the ISA fixes them.

The communication blocks have suites of their own (COM-006). `mqtt_broker_double` runs the MQTT client of the controller
(`zplc_mqtt.c`, as a board links it) and the handlers of `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`,
`AZURE_C2D_RECV`, `AZURE_EG_PUB` and `SPB_REBIRTH` against a broker that is a thread of the test on the loopback interface
of the network stack: success, no `CONNACK`, a refused connection, a lost session and a reset while busy. `comm_cloud_fb`
and `comm_modbus_fb` run the handlers with a stand-in service, `modbus_client_tcp` the Modbus TCP client against a server
written for the test. The provisioning blocks `AZURE_DPS_PROV` and `AWS_FLEET_PROV` are verified at the handler only. A
double proves protocol behaviour, not acceptance by a real service. On the host, `test_host_loopback` shows the endpoints
that a session of the ZPLC application starts inside its runtime (COM-009), and `test_io_unsupported` shows that a channel the board cannot
serve is counted and reported (IO-007).

The runtime hardening of the firmware (RT-010 to RT-034) has its own suites:

- `runtime_boot` runs a start-up plan in order, refuses a plan that starts a service before the runtime, and keeps
  going when a service fails;
- `program_store_nvs` runs the program store over NVS on the flash simulator with an artifact as large as the code
  region, and cuts the power at each operation of a deploy;
- `modbus_force` writes through the Modbus server over the real core and shows that a forced variable keeps its
  forced value;
- `scheduler_admission` holds a scan at the commit and at the output write, to show that a write from outside waits
  for the input latch and never for the scan, and that the image lock is free while the pins are written;
- `scheduler_equivalence` drives the Zephyr scheduler through the scenarios of the shared scheduler core and compares
  its decisions with the golden trace the host session is held to (RT-008, RT-018);
- `single_task` runs the one-task configuration of the core: the input latch of the pins, the deadline, the fault and
  the safe state (RT-018);
- `failsafe` takes the fatal-error handler with an intercepted reboot and shows the outputs driven safe, the record of
  the fault and the cause reported by the next boot; `failsafe_reboot` takes a real fault and a real reboot on
  `qemu_cortex_m3` and reads the record after it (RT-019, RT-021, RT-022);
- `scheduler_watchdog` runs the hardware-watchdog policy of a profile over a model of the watchdog: the feed from the
  completion of a scan, the timeout taken from the task set, a stalled scan that lets it expire, and the policy in
  STOP, in a pause and in a fault (RT-020);
- `port_timing` runs the timing self-test of the port conformance suite on the clock of the Zephyr HAL: the tick
  never goes backwards, a sleep advances it and takes the time it is given. The POSIX host runs the same function in
  `test_port_timing`, and the [port interface](../runtime/port-interface.md) page lists the whole suite (IO-013).

The host suites of the core add `test_exchange` (a scanner, readers and writers on threads), `test_program_store`
(a power cut and a torn write at every operation), `test_sched_core` and `test_sched_equivalence` (the decisions of
the scheduler core and the golden trace), `test_single_task`, `test_vm_scan` (the time of a scan is read once, and a
string opcode is charged by its bytes), `test_failsafe` (the reset cause, the record of a fault and the watchdog
policy), `test_safe_state` (the safe value a project declares decides the level of a pin, over a board of its own),
`test_core_start`, `test_core_lock`, `test_bytes_crc` and the
`config_rule_*` tests, each of which builds one configuration rule with a value that breaks it and expects the
compilation to fail naming the rule. The test-only entry points are declared in
`firmware/lib/zplc_core/tests/include/zplc_test_hooks.h`, never in a public header; `test_public_headers` fails when
a public header declares one.

### The board I/O description

`zplc.io_table.base` and `zplc.io_table.extended` build the firmware from two synthetic board descriptions
(`firmware/tests/io_table/io_base.json` and `io_extended.json`) over the `native_sim` GPIO emulator and run the same
test code on both. The test reads the generated table, drives every emulated input pin, runs one scan and checks that
a described input lands in the input image at its address, that a described output reaches its pin, and that a pin
the devicetree has but the description does not list is never configured or driven. The extended description lists
three outputs and an input more than the base one, one of them in a second and one in a third image byte, and nothing
in the firmware sources names them.

`zplc.io_analog.ok` runs two analog inputs over the ADC emulator and checks that each raw value lands at its word of
the input image and follows the voltage; `zplc.io_analog.missing` names a converter channel the emulator does not
have and checks that the HAL fails at initialization, before any task runs. `zplc.hal_persist_keys` saves, loads
and deletes every key the runtime stores (the program store, the RETAIN chunks of both slots and the credentials) over
the NVS of the flash simulator, and checks that a key without an identifier answers with an error.

The build also checks that the description and the devicetree agree. To see it fail, change a `dt.pin` or an
`alias` in `io_base.json` and build the test:

```bash
west build -p -b native_sim/native/64 zplc/firmware/tests/io_table
```

The build stops with a message such as `I/O description: channel DO0 (P0) disagrees with the devicetree: alias led0
is not on pin 7`. `python3 tools/hil/test_io_table_generator.py` pins the text the generator emits, and
`python3 tools/ci/check_hal_contract.py` checks that every HAL function is implemented on every port.

## Static analysis

`clang-tidy` reads `.clang-tidy` at the repository root. Every check it enables is an error, so the list in
that file is the set the code satisfies. Each check that is switched off is listed with its reason, and a
single line that must stay as it is carries a `NOLINT` comment with its reason. `run.sh tidy` runs
`tools/ci/run_clang_tidy.py`, which makes two passes:

- The host pass always runs. CMake writes a compile database for `firmware/lib/zplc_core` into a temporary
  directory (nothing is built), and clang-tidy analyses the core in `src/core`, the POSIX HAL in
  `src/hal/posix`, the host application in `firmware/apps/posix_host/src`, and the headers they include. It
  must report nothing.
- The Zephyr pass analyses what only a Zephyr build compiles: the Zephyr HAL and scheduler and
  `firmware/app`. It needs the compile database of a `west build`, so it runs when
  `$ZPLC_FW_WS/out/size/arduino-opta-wifi-m7` exists (`run.sh size arduino-opta-wifi-m7` makes it) or when you
  pass `--zephyr-build <directory>` to the script. Otherwise it is skipped and the run says so. The core and
  the Zephyr HAL must report nothing. The findings that `firmware/app` already had when the check was added
  are counted per board, file and check in `tools/ci/clang-tidy-app-baseline.json`: a new finding fails the
  pass, and a fixed one asks you to lower the count with `--update-baseline`.

`-Werror` applies to every target the repository builds: the host targets of the core through one
`add_compile_options` in `firmware/lib/zplc_core/CMakeLists.txt` (with `-Wall -Wextra -pedantic`), the
Zephyr library `zplc` through `firmware/CMakeLists.txt`, and `app`. The Zephyr test suites compile the core
sources with it as well.

## Continuous integration

The `host-core-sanitized` job runs the host pass after its sanitized build, with `clang-tidy` installed from
the distribution. Each `zephyr-cross-build` job runs the Zephyr pass on the build it has just made, against the
baseline of its board (the Xtensa board has no clang target and is skipped). The `zephyr-twister` job runs `native` through its own Twister step and then
`native32`, `qemu-m3` and `qemu-m0` through `run.sh`, in the same workspace.
Each `zephyr-cross-build` job checks its board's flash and RAM against
`size-budget.json` and writes the table to the job summary. The report tool has
its own unit tests, `tools/firmware-test/test_fwtest.py`, which prove the gate
fails when a size is one byte over its budget. The same job then runs the
partition check of the next section on its build. That step is authored in
`.github/workflows/ci.yml` and has not been run here; `run.sh size` runs the same
check locally.

The nightly `loader-fuzz` job of `.github/workflows/nightly-quality.yml` fuzzes the loader verification only, and no run of it is recorded yet.

## Size budgets

`tools/firmware-test/size-budget.json` records, for each board in
`firmware/app/boards/boards.json`, the flash and RAM measured
from the linker's memory table and the budget the build must stay under. The
margin policy is in the file: the budget is the measurement plus 5 percent,
rounded up to 256 bytes.

When a change makes an image grow past its budget, the build fails. Raise the
budget in the same commit and say why:

```bash
python3 tools/firmware-test/fwtest.py size \
  --budget tools/firmware-test/size-budget.json \
  --logs ~/zplc-zephyr-ws/out/size --rebaseline
```

The figures are link-time static allocation. They do not include the stacks or
the heap high-water mark.

The ZPLC library and the application are compiled with link-time optimization (`CONFIG_ZPLC_LTO`, on by default),
which is worth about 3 percent of the flash of an image. Zephyr's own code is not part of it. The `native_sim`
targets link their image as a relocatable object, which the optimizer cannot be part of, so they run without it; the
suites of `firmware/tests` link the library the same way as the boards on `qemu-m3` and `qemu-m0`, which is where
the code that ships is exercised. To compare, or to debug a fault with the inlining out of the way, build with
`-DCONFIG_ZPLC_LTO=n`.

To see where the bytes of a board go, run the footprint report on the same
build trees. It reads each linker map and prints, per board, the used bytes of
every memory region, the headroom to the budget, the input sections by kind and
by library, and the largest input sections of flash and RAM with the object
file that owns each one. The strings of the image are one merged block, so it
reports that block once and the strings of each object before merging:

```bash
python3 tools/firmware-test/footprint_report.py \
  --logs ~/zplc-zephyr-ws/out/size --board rpi-pico-rp2040 --top 25
```

The report only reads files. Its own tests are
`tools/firmware-test/test_footprint_report.py`.

## Flash partitions of the stores

`run.sh size` also runs `tools/hil/check_storage_partitions.py` (IO-008) on every
board it built. The check reads the `zephyr.dts` and `.config` that each build
keeps under `$ZPLC_FW_WS/out/size/<board id>/zephyr`, never the overlay text, and
fails a board when:

- (a) two stores share or overlap a partition, or a store overlaps another
  partition. The stores are the records of the HAL (on `zplc_nvs_partition`,
  or `storage_partition` where the board has none) and the settings file
  system (LittleFS, on `storage_partition`);
- (b) a store holds fewer than two erase blocks of its flash, is not whole
  erase blocks, or has blocks its backend cannot mount (NVS refuses a sector
  above 64 KB; a serial NOR that states no erase size is taken at 64 KB);
- (c) a store lies in the image slot, the flash the linker may fill. Where the
  linker does not bound the image (the ESP32-S3 ignores
  the load size of Zephyr), the slot is the flash budget of the board, which
  the size check of the same run enforces.

One line per board says PASS or FAIL with the partition map. A board whose
failure is known and owned elsewhere can be listed with the failing checks in
`tools/hil/storage-partitions-open.json`; the list is empty and only shrinks.
Run the check alone on build trees that already exist:

```bash
python3 tools/hil/check_storage_partitions.py ~/zplc-zephyr-ws/out/size/*/
```

Its unit tests are `tools/hil/test_hil_storage_partitions.py`. It is build-level
evidence: how the flash of a board behaves needs the bench of HIL-010.

## Adding a test

- Put a Zephyr suite in `firmware/tests/<name>` with a `testcase.yaml`, and
  list every platform it passes on in `platform_allow`. Do not list a platform
  where the scenario would pass for a reason it does not name.
- Zephyr picks board files by exact qualifier. A file for the 64-bit variant is
  `boards/native_sim_native_64.overlay` and the 32-bit variant needs
  `boards/native_sim_native.overlay`. Per-board settings go in
  `boards/<board>.conf`, for example `boards/qemu_cortex_m3.conf`.
- Print ASCII only. Twister decodes QEMU output one byte at a time as UTF-8 and
  fails the run on a multi-byte character.
- Keep a thread's stack in mind. `native_sim` runs threads on the host stack,
  so a stack that is too small shows up only on a target. The default test
  thread stack on `qemu_cortex_m3` is 1 KB.

## Known limits

- `vm_core` and `loader_verify` do not run on `qemu_cortex_m0`. The VM keeps
  8 KB of fixed process images and about 5 KB of static state at the default
  stack depth, so the whole suite exceeds 16 KB with the sizes it needs, and
  the loader suite builds programs larger than the `.tiny` code region.
- `hal_gpio_policy.partial_required` and `post_shutdown` need the GPIO emulator
  and the LED alias of `native_sim`.
- `scheduler_run_control` watches the physical level of output channel 0
  through the same emulator and LED alias. On `qemu_cortex_m3`, which has
  neither, it checks the output image, the force table and the task scans only,
  so "outputs safe while paused" is observed on `native_sim` alone.
- The `app` mode is not part of continuous integration yet: no job builds a
  board and then runs the host test.
- The `firmware/app` baseline of the Zephyr pass is the list of findings that
  remain to be fixed there; `tools/ci/clang-tidy-app-baseline.json` holds one
  count per board, file and check. The pass was proven against local board
  builds with one `clang-tidy` version; the first run in continuous integration
  shows whether the baselines also hold with the runner's.
- The Zephyr pass was run on a Linux workstation, on the Arduino Opta build only: the core and the Zephyr HAL
  reported nothing, and `firmware/app` reported 24 findings, all within the baseline of that board. Reading them
  found no defect: the one `strcpy` is guarded by the length check above it and the one `memcpy` writes a binary
  record, so no firmware file changed. The baselines of the other boards were not measured in that run, and no
  hosted CI run of the pass is recorded.
- Two integration cases in `test_vm_core.c` skip on every target, the host
  included, because the example binaries they load predate the CRC field.
  The `SKIP:` lines are in the suite log and the summary still reports a pass.

## Related pages

- [Zephyr Workspace Setup](../reference/zephyr-workspace-setup.md)
- [Supported Boards](../reference/boards.md)
- [Hardware support](../reference/capabilities-evidence.md)
