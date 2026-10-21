---
slug: /development/hardware-software-review
title: Hardware Software Review
sidebar_label: Hardware Software Review
description: The scenarios that close the requirements needing a physical board by a software and simulation review, with the code path, the simulation evidence and what only silicon could show for each one.
---

# Hardware software review

On 2026-10-20 the owner decided how the requirements that need a physical board are closed: by a software and simulation review, not by a bench run. This page is the first half of that review. It lists, for each requirement, every behaviour the requirement asks of a board as a numbered scenario. A separate reviewer then judges each scenario by software analysis or simulation only. A scenario judged "should not pass" is a defect and is fixed.

:::warning Not hardware evidence
No scenario has been run on a physical board. A verdict below is a judgement from the code and from simulation, not a measurement. A software verdict does not replace a hardware record (see [Hardware in the Loop](./hardware-in-the-loop.md)): it covers what software can show, and each scenario names what only silicon could reveal.
:::

The same scenarios are in `tools/hil/software-review/scenarios.json`. The verdicts, each with its reasoning and the command that was run, are in `tools/hil/software-review/verdicts.json`, keyed by scenario id.

## How to read a scenario

- **Given, when, then** state the behaviour precisely and measurably.
- **Boards** are the learner boards `rpi_pico` and `esp32s3_devkitc`, or the other boards of `firmware/app/boards/boards.json` where the requirement covers them.
- **Code** lists the entry points as file and line: the firmware function, the HAL and the devicetree node.
- **Simulation** names the existing test, emulated bench step, native_sim or QEMU run, or host test, with its command. Commands that need the Zephyr workspace use a private view of it, as [Firmware testing](./firmware-testing.md) says. "none yet" means no simulation covers the scenario today.
- **Only silicon** is what is outside a software verdict: pin electrics, analog accuracy, oscillator, flash wear, radio.

There are 116 scenarios.

| Requirement | Subject | Scenarios |
|---|---|---|
| HIL-001 | packages/zplc-hil runs the real chain | 5 |
| HIL-002 | Scenario engine on a board | 7 |
| HIL-005 | Language fixtures on a board | 5 |
| HIL-010 | The bench record of each learner board | 34 |
| HIL-012 | One command per board | 6 |
| HIL-014 | The bench guide | 6 |
| HIL-015 | Simulation against hardware | 7 |
| LRN-013 | Choose a board in Learn | 6 |
| LRN-024 | Hardware check, labelled apart | 7 |
| RT-025 | RETAIN across a power cycle | 8 |
| LNG-004 | Breakpoints on source elements | 8 |
| IO-006 | Analog input and output | 6 |
| COM-016 | TLS and the random generator | 5 |
| DOC-004 | First board and build from source | 6 |

## Results of the review

Two reviewers judged the 116 scenarios on 2026-10-20 by reading the code and running what runs on a development machine (unit, C and native_sim tests, the native runtime, the emulated bench, QEMU and firmware builds). The scenarios judged "should not pass" were fixed where the fix was small and a test could prove it, and judged again on the fixed tree: the verdicts below are the final ones. The verdicts, with their reasoning and the command run, are in `tools/hil/software-review/verdicts.json`.

| Verdict | Scenarios |
|---|---|
| Should pass | 110 |
| Should not pass | 1 |
| Cannot be judged in software | 5 |

No physical bench run is recorded for any of these scenarios.

### Scenarios that cannot be judged in software

For each one, the silicon fact that a person checks at a bench:

- **HIL-010.13** Analog read at 0 %, 50 % and 100 % of full scale: converter accuracy, offset and gain error, reference voltage, noise and the nonlinearity near both ends
- **HIL-010.14** ESP32-S3 analog scaling is the one the board description documents: the eFuse calibration quality of the individual chip and the converter nonlinearity
- **HIL-010.17** Scan jitter: every scan period is within 20 % of the interval: the true period distribution, which depends on the oscillator and on the other interrupts of the chip
- **HIL-015.06** A difference found on hardware is reflected in the simulator's capability profile: the differences themselves: no hardware comparison has been recorded, so there is nothing yet to reflect
- **IO-006.03** ESP32-S3 AI0 scaling is documented and read: eFuse calibration of the individual chip and nonlinearity near both ends

### Scenarios that still should not pass

- **COM-016.05** the two boards still build without TLS (`firmware/app/boards/nucleo_h743zi.conf:86-103`, `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf:89-106`: `CONFIG_MQTT_LIB_TLS`, `CONFIG_NET_SOCKETS_SOCKOPT_TLS` and `CONFIG_TLS_CREDENTIALS` unset). COM-016 asks for TLS on again, with a verified hardware entropy source, before GA; the build half works (the rule passes with TLS on), so turning it on is a software step. It was not taken, by instruction, and the hardware record of the generator (HIL-011) is still missing.

## HIL-001 packages/zplc-hil runs the real chain

### HIL-001.01 packages/zplc-hil compiles a test program with the repository compiler

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a HILTestCase with ST source and no precompiled bytes
- **When:** compileTest runs
- **Then:** the bytecode comes from the repository compiler (not a table of bytes) and a compile error is raised as an error, never swallowed
- **Code:** `packages/zplc-hil/src/runner.ts:60` compileTest; `packages/zplc-hil/src/compile.ts`
- **Simulation:**
  - packages/zplc-hil/tests/runner.test.ts: the runner compiles, deploys, starts and observes (HIL-001): `cd packages/zplc-hil && bun test tests/runner.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-001.02 The runner deploys through the control protocol

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a compiled program and a connected DeviceLink
- **When:** TestRunner deploys it
- **Then:** the load goes through the shell grammar of the firmware (sched load / sched data) or the framed link, and the device status reports the program loaded before RUN
- **Code:** `packages/zplc-hil/src/runner.ts:70` TestRunner; `packages/zplc-hil/src/shellLink.ts`; `packages/zplc-hil/src/link.ts`; `firmware/app/src/shell_cmds.c:4881` sched load / sched data
- **Simulation:**
  - packages/zplc-hil/tests/shellLink.test.ts: `cd packages/zplc-hil && bun test tests/shellLink.test.ts`
  - packages/zplc-hil/tests/runner.test.ts: `cd packages/zplc-hil && bun test tests/runner.test.ts`
- **Only silicon:** the real USB-CDC serial path: framing loss, buffer overruns and timing of the UART at 115200 baud
- **Verdict:** should pass

### HIL-001.03 The runner observes the device with no mocked step

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a program running on a device
- **When:** the runner reads outputs and memory and evaluates assertions
- **Then:** every observation comes from a device read (peek or link read), none from a value computed in the test; with ZPLC_HIL_DEVICE=host the evidence level is host-runtime, never hardware
- **Code:** `packages/zplc-hil/src/runner.ts`; `packages/zplc-hil/src/assertions.ts`; `packages/zplc-hil/src/device.ts:27` Device; `packages/zplc-hil/src/record.ts:49` LEVELS_OF_EVIDENCE
- **Simulation:**
  - packages/zplc-hil/tests/runner.test.ts: `cd packages/zplc-hil && bun test tests/runner.test.ts`
  - tools/ci/hil-emulator.test.ts: `bun test tools/ci/hil-emulator.test.ts`
- **Only silicon:** whether a real board answers the same reads at the same speed as the native runtime
- **Verdict:** should pass

### HIL-001.04 Opcode and block test files each contain tests that run

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the files under packages/zplc-hil/tests/opcodes and tests/blocks
- **When:** bun test runs the package
- **Then:** every file reports at least one passing test, none is skipped or empty
- **Code:** packages/zplc-hil/tests/opcodes/&#42;.test.ts; packages/zplc-hil/tests/blocks/&#42;.test.ts
- **Simulation:**
  - packages/zplc-hil/tests/**: `cd packages/zplc-hil && bun test `
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-001.05 A deploy that the device refuses is raised, not resent

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a program larger than work_size of boards.json (2048 bytes for esp32s3_devkitc)
- **When:** the tester sends it
- **Then:** the device refusal (loader error -13) is raised to the caller and the last chunk is not sent again
- **Code:** `packages/zplc-hil/src/runner.ts:70` TestRunner; `tools/hil/language_tester.py`; `firmware/lib/zplc_core/src/core/zplc_loader.c:818` zplc_loader_verify
- **Simulation:**
  - tools/hil/test_hil_bench.py CompilePerBoardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k every_step_program_compiles_for_both_learner_boards`
  - hil-emulation.md finding 'Deploy (ESP32-S3)': `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh esp32s3; python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## HIL-002 Scenario engine on a board

### HIL-002.01 The hardware runtime port implements the scenario engine's port

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the ScenarioRuntimePort interface of the engine (packages/zplc-ide/src/test-engine/index.ts:12-19)
- **When:** HardwareRuntimePort is used in place of the host runtime
- **Then:** a scenario file that passes on the host runs on the port with no change to the file
- **Code:** `packages/zplc-hil/src/hardwarePort.ts:8` ScenarioRuntimePort; `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort; `packages/zplc-ide/src/test-engine/index.ts:12`
- **Simulation:**
  - packages/zplc-hil/tests/hardwarePort.test.ts: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
  - packages/zplc-ide/src/test-engine/hardwarePort.test.ts: `cd packages/zplc-ide && bun test src/test-engine/hardwarePort.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-002.02 Time is taken from the device clock

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a scenario that waits N ms
- **When:** the port advances a tick
- **Then:** a tick is sampled only once the device clock has reached it and a scan has completed since the inputs were forced
- **Code:** `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort; `firmware/app/src/shell_cmds.c:4864` dbg ticks
- **Simulation:**
  - hardwarePort.test.ts: time is taken from the device clock, and each tick waits for it: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Only silicon:** oscillator accuracy and drift of the real board clock against the bench clock
- **Verdict:** should pass

### HIL-002.03 A sample later than the declared tolerance voids the run

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** --tolerance-ms (default 50) and a device that answers late
- **When:** a sample is taken lateMs &gt; tolerance
- **Then:** ScenarioTimingError is raised, the run is void (not a pass) and the tolerance is written in the record
- **Code:** `packages/zplc-hil/src/hardwarePort.ts:33` ScenarioTimingError; `packages/zplc-hil/src/cli.ts:68` main; `tools/hil/run-record.schema.json`
- **Simulation:**
  - hardwarePort.test.ts: a sample taken later than the declared tolerance voids the run: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Only silicon:** the real late-sample distribution of the USB link under host load
- **Verdict:** should pass

### HIL-002.04 Inputs are forced, not written

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a scenario input step
- **When:** the port applies it
- **Then:** the input is set as a force (the board rewrites its input image every scan) and the forced byte replaces all eight bits of the input byte for the run
- **Code:** `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort; `firmware/app/src/shell_cmds.c:4714` dbg force set; `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:783` do_mem_write
- **Simulation:**
  - hardwarePort.test.ts: an input is forced, a scan runs with it and the output is read after that scan: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Only silicon:** pin electrics: pull-up strength, 1 kOhm loopback levels, drive current, pin multiplexing on the real pad
- **Verdict:** should pass

### HIL-002.05 Assertions are evaluated with the declared tolerance on device timestamps

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a scenario with assertions at named times
- **When:** the engine evaluates them over the port
- **Then:** each assertion is checked against samples taken on the device clock; the tolerance is a lateness bound, so a sample later than it voids the run instead of widening the assertion window, and the outcome is recorded with the observed times of every tick (hardware-in-the-loop.md, the hardware runtime port)
- **Code:** `packages/zplc-hil/src/assertions.ts`; `packages/zplc-hil/src/hardwarePort.ts:44` StepObservation; `packages/zplc-ide/src/test-engine/index.ts`
- **Simulation:**
  - packages/zplc-ide/src/test-engine/hardwarePort.test.ts: `cd packages/zplc-ide && bun test src/test-engine/hardwarePort.test.ts`
- **Only silicon:** oscillator accuracy and drift of the real board clock against the bench clock
- **Verdict:** should pass

### HIL-002.06 Addresses outside the images and a never-reached tick are refused

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a scenario naming an address outside the I/O images, or a device that never reaches the tick
- **When:** the port runs
- **Then:** the first is refused before anything reaches the device; the second ends as a timeout, not a pass
- **Code:** `packages/zplc-hil/src/hardwarePort.ts:55` HardwareRuntimePort
- **Simulation:**
  - hardwarePort.test.ts: addresses outside the images ... / a device that never reaches the tick: `cd packages/zplc-hil && bun test tests/hardwarePort.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-002.07 A scenario run on a board writes a record and is bound to the image

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a completed or voided hardware scenario run
- **When:** the CLI finishes
- **Then:** a run record (zplc.hil-record schema) with board identity, image hash, tolerance and the observed timing exists; a stand-in device is labelled host-runtime or fake
- **Code:** `packages/zplc-hil/src/cli.ts:68` main; `packages/zplc-hil/src/record.ts:109` RunStep / RunRecord; `tools/hil/run-record.schema.json`
- **Simulation:**
  - packages/zplc-hil/tests (record and cli): `cd packages/zplc-hil && bun test `
- **Only silicon:** a run on a real board: no scenario file has produced a hardware record yet (gate note of HIL-002)
- **Verdict:** should pass

## HIL-005 Language fixtures on a board

### HIL-005.01 Every language fixture compiles with the 2.0 compiler

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the fixtures in tools/hil/il_tests, ld_tests, fbd_tests, sfc_tests, st_tests and blinky_ld_gen.st
- **When:** verify_compilation.py (or the host test) compiles them
- **Then:** every fixture compiles; the six st_tests that use methods or inheritance are the CMP-041 dependency of this requirement
- **Code:** `tools/hil/verify_compilation.py`; `tools/hil/fixtures.json`; `packages/zplc-ide/src/cli/hilFixtures.test.ts`
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts: language fixtures of tools/hil (HIL-005, HIL-006): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - tools/hil/verify_compilation.py: `python3 tools/hil/verify_compilation.py`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-005.02 Every phase of every fixture holds its expected values on the native runtime

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** tools/hil/fixtures.json expected values (inputs, scans, outputs)
- **When:** each fixture is run on zplc_runtime
- **Then:** every phase output equals its expected value
- **Code:** `tools/hil/fixtures.json`; `tools/hil/fixture_script.py`; `tools/hil/language_tester.py`; `packages/zplc-ide/src/cli/hilFixtures.test.ts`
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts: every phase of every language fixture holds on the native runtime (HIL-005): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts  (needs ZPLC_NATIVE_SIM_BIN)`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-005.03 Every expected value names a real address and the manifest lists each fixture once

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** fixtures.json and the fixture folders
- **When:** the manifest test runs
- **Then:** no fixture is missing, none is listed twice, no expected value points outside its type's area
- **Code:** `tools/hil/fixtures.json`; `packages/zplc-ide/src/cli/hilFixtures.test.ts`
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts: the manifest lists every language fixture of tools/hil, once: `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-005.04 The fixtures tagged for hardware run through the chain on the bench

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a board with the HIL image and run_chain.py --all-fixtures
- **When:** step 9 runs
- **Then:** the blink of each of the five languages (and every fixture tagged hardware with --all-fixtures) toggles its output as fixtures.json expects, with inputs forced and released
- **Code:** `tools/hil/hil_steps.py:262` BenchSteps; `tools/hil/run_chain.py:150` Chain; `tools/hil/run_all_languages.py`; `tools/hil/fixtures.json`
- **Simulation:**
  - tools/hil/test_hil_chain.py DryRunTests (host runtime stand-in): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - emulated Pico bench; blink counts are not evidence on rp2040js (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** pin electrics: pull-up strength, 1 kOhm loopback levels, drive current, pin multiplexing on the real pad
- **Verdict:** should pass

### HIL-005.05 A fixture compiled for a board uses that board's memory sizes

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** work_size of boards.json: 8192 for rpi_pico, 2048 for esp32s3_devkitc
- **When:** the chain compiles the fixtures
- **Then:** the program fits the work memory of the board under test; a program that does not is refused at preflight, not at deploy
- **Code:** `tools/hil/hil_steps.py:165` _build; `tools/hil/run_chain.py:64` _channels; `firmware/app/boards/boards.json` (memory.work_size)
- **Simulation:**
  - tools/hil/test_hil_bench.py CompilePerBoardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k every_step_program_compiles_for_both_learner_boards`
  - tools/hil/test_hil_chain.py PreflightTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k each_fixture_is_compiled_for_the_board_under_test`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## HIL-010 The bench record of each learner board

### HIL-010.01 Flash is done by a person; the tool never flashes

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** run_chain.py started on a terminal for a board
- **When:** the flash step is reached
- **Then:** the tool prints the flash instructions and waits for the person; no code path of the tool writes the image to the board
- **Code:** `tools/hil/run_chain.py:150` Chain (flash step); `packages/zplc-hil/src/guard.ts:38` confirmPhysicalStep; `AGENTS.md` rule 7
- **Simulation:**
  - tools/hil/test_hil_chain.py GuardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k physical_step`
- **Only silicon:** the real bootloader: BOOTSEL drive on the Pico, download mode and esptool on the ESP32-S3
- **Verdict:** should pass

### HIL-010.02 Identity handshake reports board, commit and image options

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a board flashed with the HIL image (run_chain.py prints the build command) and the bench of hardware-in-the-loop.md wired
- **When:** zplc sys info --json and zplc sys build --json run
- **Then:** the reply names the board id, version, 40-digit commit, dirty flag, ABI and the build options with their hash, and the record stores both
- **Code:** `firmware/app/src/shell_cmds.c:1164` cmd_sys_build; `firmware/app/src/shell_cmds.c:1184` cmd_sys_io; `tools/hil/hil_record.py`; `packages/zplc-hil/src/record.ts:156` firmwareIdentity
- **Simulation:**
  - tools/hil/test_hil_chain.py BuildCommandAndTraceTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k the_record_carries_the_exact_build_command`
  - firmware/tests/app_shell_identity: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-010.03 The device's I/O description equals boards.json

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a board flashed with the HIL image (run_chain.py prints the build command) and the bench of hardware-in-the-loop.md wired
- **When:** zplc sys io --json is compared with the board entry
- **Then:** board id, hash, channel count and image bytes agree; a different image fails the run; an image that reports none is skipped, not passed
- **Code:** `firmware/app/src/shell_cmds.c:1184` cmd_sys_io; `tools/hil/run_chain.py:120` board_io; `firmware/app/boards/boards.json`
- **Simulation:**
  - tools/hil/test_hil_chain.py IoDescriptionTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k description`
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-010.04 Deploy of a program over the device link

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a board flashed with the HIL image (run_chain.py prints the build command) and the bench of hardware-in-the-loop.md wired
- **When:** a program is uploaded with sched load / sched data
- **Then:** the loader verifies size, checksum and ABI, the device reports the program loaded, and a refused load is raised
- **Code:** `firmware/app/src/shell_cmds.c:4881` sched load/data; `firmware/lib/zplc_core/src/core/zplc_loader.c:818` zplc_loader_verify; `tools/hil/hil_steps.py:277` deploy_program
- **Simulation:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - firmware/lib/zplc_core/tests test_loader_verify: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_loader_verify)`
- **Only silicon:** the real serial throughput and any lost characters on a USB cable
- **Verdict:** should pass

### HIL-010.05 Run: the scan counter advances

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a deployed program
- **When:** zplc start is issued by the person's chain and status is read twice
- **Then:** the scan counter increases and the state is RUN
- **Code:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2034` zplc_sched_start; `firmware/app/src/shell_cmds.c:662` cmd_sched_status
- **Simulation:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - firmware/tests/scheduler_run_control: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-010.06 Blink in ST

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the ST blink fixture in tools/hil/st_tests compiled for the board
- **When:** it runs with the person's chain on the HIL image
- **Then:** output DO0 toggles in the sequence fixtures.json expects for the ST blink, with the period of the fixture within the tolerance of the phase
- **Code:** `tools/hil/st_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** the actual LED or pad level and the real blink period against a scope
- **Verdict:** should pass

### HIL-010.07 Blink in IL

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the IL blink fixture in tools/hil/il_tests compiled for the board
- **When:** it runs with the person's chain on the HIL image
- **Then:** output DO0 toggles in the sequence fixtures.json expects for the IL blink, with the period of the fixture within the tolerance of the phase
- **Code:** `tools/hil/il_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** the actual LED or pad level and the real blink period against a scope
- **Verdict:** should pass

### HIL-010.08 Blink in LD

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the LD blink fixture in tools/hil/ld_tests compiled for the board
- **When:** it runs with the person's chain on the HIL image
- **Then:** output DO0 toggles in the sequence fixtures.json expects for the LD blink, with the period of the fixture within the tolerance of the phase
- **Code:** `tools/hil/ld_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** the actual LED or pad level and the real blink period against a scope
- **Verdict:** should pass

### HIL-010.09 Blink in FBD

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the FBD blink fixture in tools/hil/fbd_tests compiled for the board
- **When:** it runs with the person's chain on the HIL image
- **Then:** output DO0 toggles in the sequence fixtures.json expects for the FBD blink, with the period of the fixture within the tolerance of the phase
- **Code:** `tools/hil/fbd_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** the actual LED or pad level and the real blink period against a scope
- **Verdict:** should pass

### HIL-010.10 Blink in SFC

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the SFC blink fixture in tools/hil/sfc_tests compiled for the board
- **When:** it runs with the person's chain on the HIL image
- **Then:** output DO0 toggles in the sequence fixtures.json expects for the SFC blink, with the period of the fixture within the tolerance of the phase
- **Code:** `tools/hil/sfc_tests`; `tools/hil/fixtures.json`; `tools/hil/hil_steps.py:262` BenchSteps; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write
- **Simulation:**
  - packages/zplc-ide/src/cli/hilFixtures.test.ts (native runtime): `cd packages/zplc-ide && bun test src/cli/hilFixtures.test.ts`
  - emulated Pico bench: blink counts on rp2040js are not evidence (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** the actual LED or pad level and the real blink period against a scope
- **Verdict:** should pass

### HIL-010.11 Digital loopback: each output moves its own input

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** DO0..DO3 wired to DI0..DI3 through 1 kOhm resistors
- **When:** each output is forced on and off alone
- **Then:** its input follows (either polarity) and no other input moves
- **Code:** `tools/hil/hil_steps.py:339` digital_loopback; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:211` zplc_hal_gpio_read; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:243` zplc_hal_gpio_write; `firmware/app/boards/rpi_pico_rp2040.overlay`; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay`
- **Simulation:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k digital_loopback`
  - emulated Pico bench (DO0..DO3 to DI0..DI3 modelled): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
  - emulated ESP32-S3: not emulable (no GPIO model): none yet
- **Only silicon:** pin electrics: pull-up strength, 1 kOhm loopback levels, drive current, pin multiplexing on the real pad
- **Verdict:** should pass

### HIL-010.12 Digital loopback: inputs are active-low through the pull-up

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** inputs with internal pull-up
- **When:** an output is driven high and low
- **Then:** the input reads the inverse of its output and the chain accepts either polarity as long as each input follows its own output
- **Code:** `tools/hil/hil_steps.py:327` digital_pairs; `tools/hil/hil_steps.py:332` input_bits; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:211` zplc_hal_gpio_read
- **Simulation:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k each_output_moves_its_own_input`
- **Only silicon:** pin electrics: pull-up strength, 1 kOhm loopback levels, drive current, pin multiplexing on the real pad
- **Verdict:** should pass

### HIL-010.13 Analog read at 0 %, 50 % and 100 % of full scale

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the potentiometer between 3V3 and GND with its wiper on AI0
- **When:** the person sets 0 %, 50 % and 100 % and the chain reads AI0
- **Then:** the reading is within 5 % of full scale at the ends and within 10 % in the middle
- **Code:** `tools/hil/hil_steps.py:372` analog_read; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/rpi_pico_rp2040.overlay:151` &adc; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:145` &adc0
- **Simulation:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k analog_read_at_three_points`
  - firmware/tests/io_analog (ADC emulator on native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated Pico bench (analog injection on ADC0..4): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
  - emulated ESP32-S3: not emulable (no SAR ADC): none yet
- **Only silicon:** converter accuracy, offset and gain error, reference voltage, noise and the nonlinearity near both ends
- **Verdict:** cannot be judged in software

### HIL-010.14 ESP32-S3 analog scaling is the one the board description documents

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** boards.json AI0 on GPIO4 with V = raw x 4.4 / 4095 (gain 1/4, eFuse calibration)
- **When:** 3.1 V is applied
- **Then:** the converter returns about 2885 counts as documented; the documented scaling and the measured one agree within the 10 % middle rule
- **Code:** `firmware/app/boards/boards.json` (esp32s3_devkitc AI0); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:145`
- **Simulation:**
  - firmware/tests/io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** the eFuse calibration quality of the individual chip and the converter nonlinearity
- **Verdict:** cannot be judged in software

### HIL-010.15 Timer accuracy: a TON of 3 s

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a program with a TON of 3 s on a 10 ms task
- **When:** the output is timed from RUN with the bench clock
- **Then:** the output rises between 3000 ms minus one scan and 3000 ms plus one scan, 100 ms and two read round trips
- **Code:** `tools/hil/hil_steps.py:400` timer_accuracy; `firmware/lib/zplc_core/src/core/zplc_core.c:2898` zplc_vm_run_cycle; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2034` zplc_sched_start
- **Simulation:**
  - tools/hil/test_hil_bench.py NativeRuntimeStepTests (native runtime): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k on_the_native_runtime`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k timer_accuracy_against_the_bench_clock`
  - QEMU clock note: a TON of 3 s took 8 s on the ESP32-S3 emulator, which measures QEMU (hil-emulation.md): none yet
- **Only silicon:** oscillator accuracy and drift of the real board clock against the bench clock
- **Verdict:** should pass

### HIL-010.16 Scan jitter over ten minutes: no overrun, no deadline miss

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a 10 ms task running alone for ten minutes
- **When:** the chain reads zplc status --json tasks[] at the end
- **Then:** overrun count and deadline-miss count are zero
- **Code:** `tools/hil/hil_steps.py:423` scan_jitter; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:307` zplc_sched_core_total_misses; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:658` zplc_sched_core_scan; `firmware/app/src/shell_cmds.c:662` cmd_sched_status
- **Simulation:**
  - firmware/lib/zplc_core/tests/test_sched_core.c HIL-010 period test: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_sched_core)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k scan_jitter_runs_ten_minutes`
- **Only silicon:** real interrupt latency, USB or Wi-Fi interrupt load and cache or flash-wait effects on the scan period
- **Verdict:** should pass

### HIL-010.17 Scan jitter: every scan period is within 20 % of the interval

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the same ten minutes
- **When:** the shortest and longest period of the task are read
- **Then:** min and max period are both within 20 % of 10 ms
- **Code:** `tools/hil/hil_steps.py:423` scan_jitter; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:378` zplc_sched_core_overrun_us; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2316` zplc_sched_get_stats
- **Simulation:**
  - firmware/lib/zplc_core/tests/test_sched_core.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_sched_core)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k scan_jitter`
- **Only silicon:** the true period distribution, which depends on the oscillator and on the other interrupts of the chip
- **Verdict:** cannot be judged in software

### HIL-010.18 Outputs off after an overrun fault

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a 1 ms task that drives DO0 and loops for half of the VM instruction budget
- **When:** the scans run late three times
- **Then:** the deadline_miss fault latches within 10 s, the scheduler enters the safe state and every output reads its safe value
- **Code:** `tools/hil/hil_steps.py:492` overrun_fault; `tools/hil/hil_steps.py:461` _fault_leaves_outputs_off; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:460` zplc_sched_core_fault; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:476` zplc_sched_core_apply_safe_outputs; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2142` zplc_sched_enter_safe_error
- **Simulation:**
  - firmware/lib/zplc_core/tests/test_sched_core.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_sched_core)`
  - firmware/tests/scheduler_watchdog (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k outputs_off_after_an_overrun`
  - emulated Pico bench (both boards latched deadline_miss, 2026-10-20): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** that the physical pin is at the safe level (no glitch) when the fault latches
- **Verdict:** should pass

### HIL-010.19 The overrun program stays inside the VM instruction budget

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the image's CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET (100000)
- **When:** the overrun loop runs
- **Then:** it uses about half the budget so the fault is deadline_miss and not the VM watchdog (vm_fault, VM error 8)
- **Code:** `tools/hil/hil_steps.py:86` overrun program; `firmware/lib/zplc_core/src/core/zplc_core.c:2880` zplc_vm_run_bounded
- **Simulation:**
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k overrun_program_stays_inside_the_boards_instruction_budget`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-010.20 Outputs off after a forced fatal fault

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a program that divides by zero after 20 scans and drives DO0 before
- **When:** the 21st scan runs
- **Then:** a vm_fault latches within 10 s and the outputs are off
- **Code:** `tools/hil/hil_steps.py:499` fatal_fault; `firmware/lib/zplc_core/src/hal/zephyr/zplc_failsafe_zephyr.c:116` zplc_failsafe_fatal; `firmware/lib/zplc_core/src/hal/zephyr/zplc_failsafe_zephyr.c:111` zplc_failsafe_note_scheduler_fault; `firmware/lib/zplc_core/src/core/zplc_core.c:1356` zplc_vm_step
- **Simulation:**
  - firmware/tests/failsafe (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/tests/failsafe_reboot (qemu_cortex_m3): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh qemu-m3`
  - tools/hil/test_hil_bench.py NativeRuntimeStepTests (native runtime): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k on_the_native_runtime`
  - emulated ESP32-S3: latched after 1.4 s host time, 21 scans (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh esp32s3; python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated`
- **Only silicon:** pin state during the real exception entry and reset, and the real reset timing
- **Verdict:** should pass

### HIL-010.21 Outputs safe after a commanded STOP

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** outputs forced on and a program running
- **When:** zplc stop is issued
- **Then:** the board is not running and the output image is zero; the forces are cleared
- **Code:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2119` zplc_sched_stop; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:498` zplc_sched_core_drive_safe_outputs; `tools/hil/hil_steps.py:516` stop_and_link_loss_safe
- **Simulation:**
  - firmware/tests/scheduler_run_control: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k outputs_safe_after_stop_and_after_link_loss`
- **Only silicon:** pin electrics: pull-up strength, 1 kOhm loopback levels, drive current, pin multiplexing on the real pad
- **Verdict:** should pass

### HIL-010.22 Forces are released when the link is lost (Pico: DTR)

- **Boards:** Raspberry Pi Pico
- **Given:** forces set from the console in the session of its link, with a program holding the outputs low
- **When:** the host closes the port or the cable goes
- **Then:** DTR falls, the session ends at once and the device releases the forces; the outputs follow the program
- **Code:** `firmware/app/src/shell_cmds.c:4546` line-control DTR (zplc_proto_link_line); `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:494` zplc_proto_session_end; `firmware/app/src/shell_cmds.c:4653` console force session
- **Simulation:**
  - firmware/tests/app_device_link; firmware/lib/zplc_core/tests test_proto_session: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_proto_session)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k link_loss_with_forces_active`
- **Only silicon:** the real USB enumeration, DTR behaviour of the host driver and cable pull timing
- **Verdict:** should pass

### HIL-010.23 Forces are released when the link is lost (ESP32-S3: idle time)

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** forces set in a session on the USB-Serial/JTAG console, which reports no line state
- **When:** the port closes and the idle time (30 s default) passes
- **Then:** the session times out and the device releases the forces; the outputs follow the program
- **Code:** `firmware/app/src/shell_cmds.c:4546` idle time as the only end; `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:494` zplc_proto_session_end; `tools/hil/hil_steps.py:253` idle_seconds
- **Simulation:**
  - firmware/lib/zplc_core/tests test_proto_session (idle timeout): `bun run test:core  (ctest --test-dir build/core-sanitized -R test_proto_session)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k link_loss`
- **Only silicon:** the real 30 s idle time against the board's clock and that USB-Serial/JTAG reports no line state
- **Verdict:** should pass

### HIL-010.24 Watchdog reset time

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the HIL image (CONFIG_ZPLC_HIL_IMAGE=y turns the hardware watchdog on with the boards.json timeout 1000 ms) and a scan that never ends
- **When:** the scan hangs
- **Then:** the hardware watchdog resets the board between 90 % of the timeout and the timeout plus 500 ms
- **Code:** `tools/hil/hil_steps.py:562` watchdog_reset_time; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:495` watchdog_prepare; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:558` watchdog_feed_hardware; `firmware/lib/zplc_core/src/core/zplc_failsafe.c:134` zplc_wdt_timeout_for; `firmware/zephyr/Kconfig:285` ZPLC_HIL_IMAGE
- **Simulation:**
  - firmware/tests/scheduler_watchdog (model of the part on native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_failsafe.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_failsafe)`
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k watchdog_reset_time_needs_the_hil_build`
  - emulators: the watchdog step is not emulable (hil-emulation.md): none yet
- **Only silicon:** the real watchdog counter: its true timeout tolerance, and that the pins really fall to the safe level while the chip resets
- **Verdict:** should pass

### HIL-010.25 After a watchdog reset the board is in STOP with the cause recorded

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a watchdog reset
- **When:** the board boots
- **Then:** zplc sys reset --json reports cause watchdog, the program is restored in STOP and the outputs are off; RUN needs a person
- **Code:** `firmware/lib/zplc_core/src/core/zplc_failsafe.c:75` zplc_reset_cause_decide; `firmware/lib/zplc_core/src/core/zplc_failsafe.c:100` zplc_reset_may_run; `firmware/lib/zplc_core/src/hal/zephyr/zplc_failsafe_zephyr.c:77` zplc_failsafe_boot; `firmware/app/src/shell_cmds.c:1217` cmd_sys_reset
- **Simulation:**
  - firmware/lib/zplc_core/tests/test_failsafe.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_failsafe)`
  - firmware/tests/failsafe_reboot (qemu_cortex_m3): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh qemu-m3`
- **Only silicon:** the reset-cause register of the real chip and whether it survives a brown-out
- **Verdict:** should pass

### HIL-010.26 Program restored to STOP after a power cycle

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a stored program and a board that was running
- **When:** the board is unplugged and plugged
- **Then:** it boots in STOP with the program still present and the outputs at safe values
- **Code:** `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/app/src/program_boot_restore.c`; `firmware/app/src/runtime_boot.c`; `firmware/app/src/main.c:364` zplc_boot_restore_scheduler
- **Simulation:**
  - firmware/tests/program_boot_restore, runtime_boot (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated Pico bench: power cycle on a flash file: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** real flash behaviour: erase and program time, a cut in the middle of a sector, wear and retention
- **Verdict:** should pass

### HIL-010.27 RETAIN restored after a power cycle

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the HIL image (CONFIG_ZPLC_RETAIN_PERSIST=y) and a RETAIN counter
- **When:** STOP saves it and the board is power cycled
- **Then:** the counter has the saved value; an image without persistence fails the step and says so
- **Code:** `firmware/lib/zplc_core/src/core/zplc_retain.c:265` zplc_retain_restore; `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/zephyr/Kconfig:427` ZPLC_RETAIN_PERSIST
- **Simulation:**
  - firmware/tests/retain_persist (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
  - emulated Pico HIL image: 102 before and after; ESP32-S3: 16 before and after: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** real flash behaviour: erase and program time, a cut in the middle of a sector, wear and retention
- **Verdict:** should pass

### HIL-010.28 Twenty power interruptions during deploy leave a whole program

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** program A stored and program B partially sent (from 1/20 to all of it)
- **When:** the person unplugs at once, twenty times
- **Then:** after each cut the board is in STOP and holds program A whole or program B whole, never a mix
- **Code:** `tools/hil/hil_steps.py:640` deploy_interruptions; `firmware/lib/zplc_core/src/core/zplc_program_store.c:512` zplc_pstore_commit; `firmware/lib/zplc_core/src/core/zplc_program_store.c:702` zplc_pstore_restore; `firmware/lib/zplc_core/src/core/zplc_program_store.c:184` read_active
- **Simulation:**
  - firmware/tests/program_store, program_store_nvs (power-cut injection through zplc_hal_persist_test_power_cut_at, HAL line 570): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_program_store.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_program_store)`
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k twenty_power_cuts`
- **Only silicon:** real flash behaviour: erase and program time, a cut in the middle of a sector, wear and retention
- **Verdict:** should pass

### HIL-010.29 Force set, list and release

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a running program
- **When:** a force is set, listed and cleared
- **Then:** the force shows in the list, the output holds the forced value, and after clear no force remains
- **Code:** `firmware/app/src/shell_cmds.c:4714` dbg force set/clear/list; `firmware/app/src/shell_cmds.c:1487` console force session
- **Simulation:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - firmware/tests/modbus_force: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-010.30 Atomic multi-byte write

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a program that counts torn values of a DINT and a session on the device link
- **When:** 100 alternating four-byte writes (0x00000000 and 0xFFFFFFFF) are sent with MEM_WRITE
- **Then:** no scan saw a half-written value and the last value landed
- **Code:** `tools/hil/hil_steps.py:669` atomic_write; `firmware/lib/zplc_core/src/core/zplc_proto_dev.c:783` do_mem_write; `firmware/app/src/shell_cmds.c:4653` console force/lock
- **Simulation:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k atomic_write_is_never_seen_half_written`
  - firmware/lib/zplc_core/tests test_proto_session: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_proto_session)`
- **Only silicon:** the true interleaving of the write with the scan on the real interrupt timing of the chip
- **Verdict:** should pass

### HIL-010.31 Fieldbus exchange: Modbus RTU on the Pico

- **Boards:** Raspberry Pi Pico
- **Given:** the Modbus RTU client enabled at 19200 baud, stored, board restarted, and a Modbus RTU server on the host on a USB-serial adapter
- **When:** the program reads holding register 100
- **Then:** the value read is 0x5A17 with no error
- **Code:** `tools/hil/hil_steps.py:706` _fieldbus_rtu; `firmware/app/src/zplc_modbus.c:658` zplc_modbus_rtu_init; `firmware/app/src/zplc_modbus_client.c:266` zplc_modbus_client_poll_tags
- **Simulation:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k modbus_rtu_on_the_pico`
  - emulated Pico bench (UART1 on a host pty): read 0x5A17: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** UART electrics, 3.3 V logic levels, baud rate error and inter-frame silence on a real adapter
- **Verdict:** should pass

### HIL-010.32 Fieldbus exchange: Modbus TCP on the ESP32-S3

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** Wi-Fi credentials stored and the loopback endpoints of zplc_loopback on the LAN
- **When:** a register is written and read back over Modbus TCP
- **Then:** the value read back matches the value written, with no error
- **Code:** `tools/hil/hil_steps.py:734` _fieldbus_network; `firmware/app/src/zplc_modbus_tcp.c:122` zplc_modbus_tcp_process_adu; `firmware/app/src/shell_cmds.c:4937` wifi connect
- **Simulation:**
  - firmware/tests/modbus_tcp, modbus_client_tcp (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k modbus_tcp_and_mqtt_on_the_esp32s3`
  - emulated ESP32-S3: not emulable (no Wi-Fi): none yet
- **Only silicon:** the radio: association, signal, roaming, packet loss and the DHCP behaviour of the real access point
- **Verdict:** should pass

### HIL-010.33 Fieldbus exchange: MQTT on the ESP32-S3

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** the broker of zplc_loopback reachable on the host's LAN address
- **When:** the device publishes and the host hears it back
- **Then:** the published payload arrives at the broker with the topic and bytes sent
- **Code:** `tools/hil/hil_steps.py:734` _fieldbus_network; `firmware/app/src/zplc_mqtt.c:2428` zplc_mqtt_fb_publish; `firmware/app/src/zplc_comm_mqtt_handler.c`
- **Simulation:**
  - firmware/tests/inbound_mqtt, mqtt_command, mqtt_broker_double (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated ESP32-S3: not emulable (no Wi-Fi): none yet
- **Only silicon:** the radio and the real network path, TCP keep-alive and broker reconnection over Wi-Fi
- **Verdict:** should pass

### HIL-010.34 Every step writes its measurements and verdict into the run record

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a chain that passes or fails midway
- **When:** the chain finishes
- **Then:** a record exists with every step, measurements, tool versions and operator; a step the bench cannot do is skipped or not-emulable, never passed
- **Code:** `tools/hil/run_chain.py:443` run; `tools/hil/hil_record.py`; `tools/hil/run-record.schema.json`
- **Simulation:**
  - tools/hil/test_hil_bench.py StepTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k a_bench_that_cannot_do_a_step_records_it_as_not_run_never_passed`
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## HIL-012 One command per board

### HIL-012.01 One command per board runs the whole chain

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** python3 tools/hil/run_chain.py &lt;board&gt; on an interactive terminal
- **When:** it runs
- **Then:** preflight, flash prompt, handshake, I/O description, trace option, identity confirmation, deploy, run, fixtures, force, stop and the twelve measuring steps run in order, stopping at the first failing step, and one record is written
- **Code:** `tools/hil/run_chain.py:443` run; `tools/hil/run_chain.py:150` Chain; `tools/hil/hil_steps.py:262` BenchSteps
- **Simulation:**
  - tools/hil/test_hil_chain.py DryRunTests (host-runtime stand-in, never hardware): `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k on_the_host_runtime_the_flow_passes`
  - tools/hil/test_hil_chain.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py'`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-012.02 The person is prompted for each physical step under the human-presence guard

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a physical step (flash, power cycle, potentiometer, unplug)
- **When:** the chain reaches it
- **Then:** the chain prints the instruction and waits; the person must type the identity the device reported; Enter alone or another board's identity does not confirm
- **Code:** `packages/zplc-hil/src/guard.ts:38` confirmPhysicalStep; `tools/hil/hil_guard.py`; `tools/hil/run_chain.py:150` Chain
- **Simulation:**
  - tools/hil/test_hil_chain.py GuardTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k GuardTests`
  - tools/hil/test_hil_bench.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k human_bench_refuses_without_a_terminal_and_needs_the_identity_typed`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-012.03 Without an interactive terminal the command exits with an error before opening a port

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** stdin is not a terminal
- **When:** run_chain.py, compare_sim.py or the packages/zplc-hil scenario command is started
- **Then:** it exits with status 2 and says why, before any port is opened
- **Code:** `tools/hil/run_chain.py:486` main; `packages/zplc-hil/src/guard.ts:30` requireInteractive; `tools/hil/hil_guard.py`
- **Simulation:**
  - tools/hil/test_hil_chain.py StartTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k started_without_an_interactive_terminal`
  - packages/zplc-ide/src/mcp/deviceLink.test.ts: `cd packages/zplc-ide && bun test src/mcp/deviceLink.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-012.04 The chain says how long it takes before it starts, about 30 minutes

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the default plan
- **When:** the chain starts
- **Then:** it prints the planned duration (about 31 minutes: ten of jitter, about eight of power cuts) and the sum of the step budgets is about thirty minutes
- **Code:** `tools/hil/hil_steps.py:52` step budgets (JITTER_S, DEPLOY_CUTS); `tools/hil/run_chain.py:443` run
- **Simulation:**
  - tools/hil/test_hil_bench.py BudgetTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k the_chain_says_how_long_it_takes`
- **Only silicon:** the true wall time of a person's bench: how fast a person unplugs, turns a potentiometer and flashes
- **Verdict:** should pass

### HIL-012.05 The chain stops at the first failing step and still writes a record

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a device that shows nothing, or a step that fails
- **When:** the chain runs
- **Then:** the chain stops, the exit status is 1 (or 2 when no device could be used) and the record says which step failed and why
- **Code:** `tools/hil/run_chain.py:443` run; `tools/hil/hil_record.py`
- **Simulation:**
  - tools/hil/test_hil_chain.py DryRunTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k a_device_that_shows_nothing_fails_the_chain`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-012.06 The emulated bench runs the same chain without a person and labels the record emulated

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** --bench emulated with the emulators installed
- **When:** the chain runs
- **Then:** steps that need a person are skipped, steps the emulator cannot model are not-emulable, and the record says evidence_level emulated with emulator, version and patch hash; it never raises a support level
- **Code:** `tools/hil/emulator/bench_emulated.py`; `tools/hil/run_chain.py:486` main; `tools/hil/hil_record.py`
- **Simulation:**
  - tools/hil/test_hil_bench.py BenchTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_bench.py' -k emulated_bench_is_loaded`
  - tools/ci/hil-emulator.test.ts: `bun test tools/ci/hil-emulator.test.ts`
  - emulated runs: `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** everything the emulator does not model (pins, real clocks, the ESP32-S3 radio and converter)
- **Verdict:** should pass

## HIL-014 The bench guide

### HIL-014.01 The bench guide exists in English and Spanish with the same structure

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** docs/docs/development/hardware-in-the-loop.md and its es twin
- **When:** the docs validation runs
- **Then:** both pages exist, have the same headings and tables, and the Spanish uses usted
- **Code:** `docs/docs/development/hardware-in-the-loop.md`; `docs/i18n/es/docusaurus-plugin-content-docs/current/development/hardware-in-the-loop.md`
- **Simulation:**
  - docs parity validation: `bun run docs:validate; bun run check:docs`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-014.02 The wiring table equals the pin map of boards.json

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the Wiring table of the guide (DO0..DO3 to DI0..DI3, potentiometer wiper to AI0, Modbus RTU pins)
- **When:** it is compared with firmware/app/boards/boards.json and the overlays
- **Then:** every pin named in the guide is the pin of the same channel in boards.json (Pico GP0..GP3 to GP15..GP12, AI0 on GP26; ESP32-S3 GPIO15..18 to GPIO5..8, AI0 on GPIO4)
- **Code:** `docs/docs/development/hardware-in-the-loop.md` (Wiring); `firmware/app/boards/boards.json`; `firmware/app/boards/rpi_pico_rp2040.overlay`; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay`
- **Simulation:**
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
  - a table-to-manifest comparison of the guide: none yet
- **Only silicon:** that the header pin numbers (J1-5, pin 20) point at the pads printed on the real board
- **Verdict:** should pass

### HIL-014.03 The parts list equals the course kit plus the bench extras

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the Parts section and packages/zplc-ide/lessons/kit.json
- **When:** they are compared
- **Then:** every kit part is listed (board, USB cable, breadboard, LEDs with 330 ohm, buttons, 10 kohm potentiometer, 100 nF capacitor, wires) and the extras are four 1 kohm resistors, a 3.3 V USB-serial adapter (Pico) and a Wi-Fi network (ESP32-S3)
- **Code:** `docs/docs/development/hardware-in-the-loop.md` (Parts); `packages/zplc-ide/lessons/kit.json`; `packages/zplc-ide/src/boards/wiring/kit.ts`
- **Simulation:**
  - packages/zplc-ide/src/boards/wiring/kit.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/kit.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-014.04 The voltage limits agree with the electrical notes of the board description

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the Voltage limits section
- **When:** it is compared with the electrical field of every channel
- **Then:** 3.3 V logic only, no 5 V on any pin, under 10 mA per output and under 50 mA total on the Pico
- **Code:** `docs/docs/development/hardware-in-the-loop.md` (Voltage limits); `firmware/app/boards/boards.json` (io.channels[].electrical)
- **Simulation:**
  - packages/zplc-ide/src/boards/wiring/wiring.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/wiring.test.ts`
- **Only silicon:** the real current capability of the pads, which only a measurement shows
- **Verdict:** should pass

### HIL-014.05 Every command of the procedure exists with the flags the guide shows

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the Procedure section
- **When:** the commands are parsed by run_chain.py
- **Then:** --firmware-image, --rtu-port, --host-ip, --bench, --all-fixtures, --hil-trace and --no-watchdog-build are accepted flags of the parser
- **Code:** `tools/hil/run_chain.py:83` parse; `docs/docs/development/hardware-in-the-loop.md` (Procedure)
- **Simulation:**
  - tools/hil/test_hil_chain.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_chain.py' -k StartTests`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-014.06 The guide says what has and has not been executed

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the bench-guide table with a Hardware column
- **When:** it is read
- **Then:** every step row states Not run yet until a record exists, and the page says that no step has been run on a physical board
- **Code:** `docs/docs/development/hardware-in-the-loop.md` (Bench guide table); `tools/ci/requirement-evidence.json` (HIL-002/005/012/015 gate notes)
- **Simulation:**
  - tools/docs/check_doc_claims.ts: `bun tools/docs/check_doc_claims.ts`
- **Only silicon:** the requirement asks for the procedure 'actually executed': only a person's bench run can make that true
- **Verdict:** should pass

## HIL-015 Simulation against hardware

### HIL-015.01 The reference projects compile for the board under test

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the LD, FBD and SFC blinkies and the LD motor control reference projects
- **When:** compare_sim.py compiles them for the board
- **Then:** each compiles with the board's memory sizes
- **Code:** `tools/hil/compare_sim.py:51` compile_for; `tools/hil/verify_compilation.py`
- **Simulation:**
  - tools/hil/test_hil_compare.py CompareTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k CompareTests`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-015.02 The same inputs at the same times drive native simulation and the bench

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a stimulus list of (time, input) pairs
- **When:** each side runs it
- **Then:** the native runtime and the bench receive identical inputs at identical times and each yields an output trace
- **Code:** `tools/hil/compare_sim.py:69` trace; `tools/hil/compare_sim.py:119` run; `tools/hil/language_tester.py`
- **Simulation:**
  - tools/hil/test_hil_compare.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k native_against_native_is_the_same`
- **Only silicon:** pin electrics: pull-up strength, 1 kOhm loopback levels, drive current, pin multiplexing on the real pad
- **Verdict:** should pass

### HIL-015.03 A different output sequence is recorded as a difference

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** two traces with another sequence of output values
- **When:** differences() compares them
- **Then:** the difference is named with the sample where it first appears
- **Code:** `tools/hil/compare_sim.py:93` differences
- **Simulation:**
  - tools/hil/test_hil_compare.py TraceTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k TraceTests`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-015.04 A change more than --tolerance-ms (100 ms) from its twin is recorded

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a late or missing change
- **When:** differences() compares the traces
- **Then:** the late or missing change is named with its time offset
- **Code:** `tools/hil/compare_sim.py:93` differences
- **Simulation:**
  - tools/hil/test_hil_compare.py: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k a_late_or_missing_change_is_named`
- **Only silicon:** oscillator accuracy and drift of the real board clock against the bench clock
- **Verdict:** should pass

### HIL-015.05 A bench that differs produces a comparison record

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a bench that differs from native simulation
- **When:** compare_sim.py finishes
- **Then:** a comparison record in build/hil-records/ lists every difference; a native-against-native run says it is no evidence
- **Code:** `tools/hil/compare_sim.py:119` run; `tools/hil/hil_record.py`
- **Simulation:**
  - tools/hil/test_hil_compare.py CompareTests: `python3 -B -m unittest discover -s tools/hil -p 'test_hil_compare.py' -k a_bench_that_differs_is_recorded_as_different`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### HIL-015.06 A difference found on hardware is reflected in the simulator's capability profile

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a recorded hardware difference
- **When:** the capability profile is read
- **Then:** the profile of the native session and of the WebAssembly runtime lists the behaviour that differs, with a degraded-mode label (spec 009)
- **Code:** `packages/zplc-ide/src/runtime/wasmCapabilities.ts`; `docs/docs/runtime/intro.md` (native session contract)
- **Simulation:**
  - packages/zplc-ide/src/runtime/wasmRuntime.test.ts: `cd packages/zplc-ide && bun test src/runtime/wasmRuntime.test.ts`
- **Only silicon:** the differences themselves: no hardware comparison has been recorded, so there is nothing yet to reflect
- **Verdict:** cannot be judged in software

### HIL-015.07 The emulated Pico can be compared in place of a board and the record says emulated

- **Boards:** Raspberry Pi Pico
- **Given:** native_sim with the Pico channel map (run.sh app-native) or the rp2040js bench
- **When:** compare_sim.py --bench emulated runs
- **Then:** it compares against the emulated Pico and the record says evidence_level emulated
- **Code:** `firmware/tests/app_native_emulation/module/emu_shell.c`; `tools/hil/compare_sim.py:119` run
- **Simulation:**
  - tools/firmware-test/run.sh app-native: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh app-native`
- **Only silicon:** everything an emulator does not model: pin multiplexing, electrical levels and real clocks
- **Verdict:** should pass

## LRN-013 Choose a board in Learn

### LRN-013.01 The learner chooses between the ESP32-S3 and the Raspberry Pi Pico

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the Learn home with the Hardware track strip
- **When:** the learner opens the Your board group
- **Then:** both learner boards are offered in one labelled group, none chosen until the learner chooses, the chosen one is marked pressed and named in words, and it is kept on the computer
- **Code:** `packages/zplc-ide/src/components/LearnBoardTrack.tsx`; `packages/zplc-ide/src/learn/boardCheck.ts`
- **Simulation:**
  - packages/zplc-ide/src/components/LearnBoardTrack.test.tsx: `cd packages/zplc-ide && bun test src/components/LearnBoardTrack.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LRN-013.02 A hardware lesson shows no wiring before a board is chosen

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a hardware lesson and no chosen board
- **When:** the lesson opens
- **Then:** the lesson asks for a board before it shows any wiring
- **Code:** `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulation:**
  - LearnBoardLesson.test.tsx: LRN-013 asks for a board before it shows any wiring: `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LRN-013.03 The lesson shows that board's wiring as a diagram, a numbered list and a pin map

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a chosen board and a lesson wiring file
- **When:** the On your board section renders
- **Then:** the diagram, the numbered list and the pin map (part, channel, pin, location) come from the same wiring file and the board's description, and the voltage limit is one button away
- **Code:** `packages/zplc-ide/src/boards/wiring/wiring.ts`; `packages/zplc-ide/src/boards/wiring/render.ts`; `packages/zplc-ide/src/boards/wiring/kit.ts`; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulation:**
  - packages/zplc-ide/src/boards/wiring/wiring.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/wiring.test.ts`
  - packages/zplc-ide/src/boards/wiring/render.test.ts: `cd packages/zplc-ide && bun test src/boards/wiring/render.test.ts`
- **Only silicon:** that the diagram matches a real breadboard and the printed pin names of the real board
- **Verdict:** should pass

### LRN-013.04 Check on board is disabled until board, connection, deploy and identity agree

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a chosen board
- **When:** any of: not connected, program not deployed, board reports another board or none
- **Then:** the check stays disabled and names what is missing, including the board that was reported
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:51` boardCheckReadiness; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulation:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
  - LearnBoardLesson.test.tsx: LRN-013 names a connected board that is not the one the learner chose: `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LRN-013.05 The lesson program runs on the chosen board and is checked

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a connected, matching board with the lesson program deployed by the learner
- **When:** the learner presses Check on board and Run
- **Then:** the recorded trace of the board is graded against the lesson's reference scenario and the result is shown
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/learn/deviceTraceRecorder.ts:60` recordDeviceTrace; `firmware/app/src/shell_cmds.c:4846` dbg trace arm/status/dump
- **Simulation:**
  - packages/zplc-ide/src/learn/deviceTraceNative.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceNative.test.ts`
  - deviceTraceRecorder.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceRecorder.test.ts`
  - firmware/tests/io_trace (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** a trace from a real board: no such trace exists yet and the tolerances are derived, not measured
- **Verdict:** should pass

### LRN-013.06 Learn never connects, deploys, runs, stops, forces or flashes by itself

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** any hardware lesson
- **When:** the check runs
- **Then:** the check only reads: it never starts the board, and it stops reading when the board stops; the arm-then-Run flow asks the learner to press Run
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:42` needsRunStart; `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulation:**
  - LearnBoardLesson.test.tsx: the check on the board waits for the learner (LRN-015, LRN-024): `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## LRN-024 Hardware check, labelled apart

### LRN-024.01 The hardware check evaluates the same reference scenario as the simulation check

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a lesson with a reference scenario
- **When:** the check on the board runs
- **Then:** the same scenario file and content hash are used; assertions are not loosened for the board
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/learn/boardCheck.ts:75` lessonWatchVariables; `packages/zplc-ide/src/test-engine/index.ts`
- **Simulation:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LRN-024.02 The scenario is aligned on what the learner did

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a trace recorded from the board
- **When:** the check aligns each input change at the first sample holding its values and moves scenario times onto the learner's actions
- **Then:** a change never made fails with nothing observed; times are moved through the change they depend on; at Run, time-0 changes are taken at time 0
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:99` boardCheckSteps; `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck
- **Simulation:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
- **Only silicon:** human reaction timing, which only a person on a bench shows
- **Verdict:** should pass

### LRN-024.03 The tolerance the lesson declares is applied, with the polling widening

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** timeMs of 20 ms with a device trace, or a board with no trace read every 100 ms
- **When:** the check grades
- **Then:** with the device trace the slack is 20 ms; with polling it is widened to 130 ms (one period less the 10 ms jitter margin); a lesson that declares less than one scan plus 10 ms is refused
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:113` MAX_BOARD_CHECK_MS; `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/learn/deviceTraceRecorder.ts:27` traceLayoutOf
- **Simulation:**
  - packages/zplc-ide/src/learn/boardCheck.test.ts: `cd packages/zplc-ide && bun test src/learn/boardCheck.test.ts`
  - deviceTraceRecorder.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceRecorder.test.ts`
- **Only silicon:** the 10 ms jitter margin and the 1 ms timestamp resolution are derived, not measured; scan jitter on silicon (HIL-010) would confirm them
- **Verdict:** should pass

### LRN-024.04 The device trace is read without changing the program

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a board with the learner firmware and zplc dbg trace
- **When:** the recorder arms, reads and clears the ring
- **Then:** the ring of 2048 bytes keeps scan time, scan number and the input and output bytes of the lesson's signals; it writes no memory, forces nothing and starts or stops nothing
- **Code:** `firmware/lib/zplc_core/src/core/zplc_io_trace.c:66` zplc_io_trace_arm; `firmware/lib/zplc_core/src/core/zplc_io_trace.c:152` zplc_io_trace_sched_hook; `firmware/app/src/shell_cmds.c:4762` cmd_dbg_trace_arm
- **Simulation:**
  - firmware/tests/io_trace (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - packages/zplc-ide/src/learn/deviceTraceNative.test.ts: `cd packages/zplc-ide && bun test src/learn/deviceTraceNative.test.ts`
- **Only silicon:** the cost of the trace hook in the scan time on the real chip
- **Verdict:** should pass

### LRN-024.05 A failed check names the assertion, time, expected and observed values and the sample

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a trace that breaks an assertion
- **When:** the check grades
- **Then:** the result names the assertion, the time in the recorded trace, the expected and observed values and the sample read
- **Code:** `packages/zplc-ide/src/learn/boardCheck.ts:146` runBoardCheck; `packages/zplc-ide/src/components/LearnBoardLesson.tsx`
- **Simulation:**
  - packages/zplc-ide/src/components/LearnBoardLesson.test.tsx: `cd packages/zplc-ide && bun test src/components/LearnBoardLesson.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LRN-024.06 A pass on the board is labelled Passed on hardware and kept apart from a simulation pass

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a passing board check
- **When:** progress is saved
- **Then:** the grade is kept as a hardware grade with the program hash and the ZPLC version the board reported; it does not pass a lesson gradeable in simulation, a simulation pass is not a hardware pass, and verify-my-board is the one exception
- **Code:** `packages/zplc-ide/shared/learnProgressModel.ts:166` parseGradeRecord; `packages/zplc-ide/shared/learnProgressModel.ts:251` parseProgressValue; `packages/zplc-ide/src/components/LearnBoardTrack.tsx`
- **Simulation:**
  - packages/zplc-ide/shared/learnProgressModel.test.ts: `cd packages/zplc-ide && bun test shared/learnProgressModel.test.ts`
  - LearnBoardTrack.test.tsx: `cd packages/zplc-ide && bun test src/components/LearnBoardTrack.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LRN-024.07 Every string of the hardware track exists in English and Spanish

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the hardware track catalog
- **When:** the catalogs are compared
- **Then:** each key is present in both languages
- **Code:** `packages/zplc-ide/src/i18n/catalog`; `docs/docs/learn/hardware-track.md`
- **Simulation:**
  - LearnBoardTrack.test.tsx: LRN-024 has every string of the hardware track in English and Spanish: `cd packages/zplc-ide && bun test src/components/LearnBoardTrack.test.tsx`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## RT-025 RETAIN across a power cycle

### RT-025.01 RETAIN is saved on STOP

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a program with a RETAIN variable and RETAIN persistence on (CONFIG_ZPLC_RETAIN_PERSIST)
- **When:** STOP is issued after the variable changed
- **Then:** a record is written to the persistence backend; STOP of an unchanged region writes nothing
- **Code:** `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2119` zplc_sched_stop; `firmware/zephyr/Kconfig:427` ZPLC_RETAIN_PERSIST
- **Simulation:**
  - firmware/tests/retain_persist: test_stop_stores_and_load_restores, test_stop_of_an_unchanged_region_writes_nothing: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
- **Only silicon:** real flash behaviour: erase and program time, a cut in the middle of a sector, wear and retention
- **Verdict:** should pass

### RT-025.02 RETAIN is saved periodically while running, not faster than the minimum interval

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a running program that changes a RETAIN variable
- **When:** the periodic save fires on the normal-priority work queue
- **Then:** a record is written no more often than the minimum interval and never inside the scan batch nor with the memory lock held
- **Code:** `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `firmware/zephyr/Kconfig:454` if ZPLC_RETAIN_PERSIST
- **Simulation:**
  - firmware/tests/retain_persist: test_periodic_save_respects_the_minimum_interval: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** whether a real flash write stalls the scan (not measured on any board; docs/docs/runtime/persistence.md)
- **Verdict:** should pass

### RT-025.03 Each record carries magic, sequence, program identity, layout hash and checksum

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a stored RETAIN record
- **When:** its header is read
- **Then:** the header holds a magic, a sequence number, the program identity, the layout hash and a checksum over the payload
- **Code:** `firmware/lib/zplc_core/src/core/zplc_retain.c:71` layout_hash; `firmware/lib/zplc_core/src/core/zplc_retain.c:132` read_header; `firmware/lib/zplc_core/src/core/zplc_retain.c:173` read_record; `firmware/lib/zplc_core/src/core/zplc_retain.c:253` zplc_retain_identity_from_artifact
- **Simulation:**
  - firmware/lib/zplc_core/tests/test_retain.c: RT-025 a record carries a magic, a sequence, the program identity, the layout hash and a checksum: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### RT-025.04 Two records alternate

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** two successive saves
- **When:** they are written
- **Then:** the second save goes to the other slot with a newer sequence, so a cut during the second leaves the first intact; the newer valid sequence wins on restore
- **Code:** `firmware/lib/zplc_core/src/core/zplc_retain.c:86` sequence_newer; `firmware/lib/zplc_core/src/core/zplc_retain.c:93` next_sequence; `firmware/lib/zplc_core/src/core/zplc_retain.c:380` zplc_retain_save; `firmware/lib/zplc_core/src/core/zplc_retain.c:265` zplc_retain_restore
- **Simulation:**
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
  - firmware/tests/retain_persist: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** a power cut at the instant of the slot write on real flash
- **Verdict:** should pass

### RT-025.05 A record is restored only when identity and layout match; otherwise the region is initialised and the status says why

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a record of another program, a changed layout, a corrupt checksum or an unreadable backend
- **When:** a program is loaded
- **Then:** the RETAIN region is initialised, the stored record is not overwritten when it could not be read, and the status carries the reason
- **Code:** `firmware/lib/zplc_core/src/core/zplc_retain.c:202` classify; `firmware/lib/zplc_core/src/core/zplc_retain.c:213` zplc_retain_reason_string; `firmware/lib/zplc_core/src/core/zplc_retain.c:487` zplc_retain_last_status; `firmware/lib/zplc_core/src/core/zplc_retain.c:468` zplc_retain_cold_reset
- **Simulation:**
  - firmware/tests/retain_persist: test_another_program_starts_from_an_initialised_region, test_a_corrupt_record_initialises_the_region_and_says_why: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_retain.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_retain)`
  - firmware/lib/zplc_core/tests/test_native_runtime_session.c RT-025, RT-027: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_native_runtime_session)`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### RT-025.06 RETAIN survives a power cycle on the Raspberry Pi Pico

- **Boards:** Raspberry Pi Pico
- **Given:** the HIL image (persistence on) with the 128 KB storage partition and retain_size 4096
- **When:** the board is unplugged after STOP and plugged
- **Then:** the RETAIN value is the one saved and the program is back in STOP
- **Code:** `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:735` zplc_hal_persist_save; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:779` zplc_hal_persist_load; `firmware/app/boards/rpi_pico_rp2040.overlay`; `firmware/app/boards/boards.json` (rpi_pico memory.retain_size)
- **Simulation:**
  - emulated Pico HIL image: 102 before and after (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
  - tools/hil/check_storage_partitions.py: `python3 tools/hil/check_storage_partitions.py`
- **Only silicon:** real flash behaviour: erase and program time, a cut in the middle of a sector, wear and retention
- **Verdict:** should pass

### RT-025.07 RETAIN survives a power cycle on the ESP32-S3

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** the HIL image (persistence on) and retain_size 1024
- **When:** the board is power cycled after STOP
- **Then:** the RETAIN value is the one saved and the program is back in STOP
- **Code:** `tools/hil/hil_steps.py:590` power_cycle_retain; `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:735` zplc_hal_persist_save; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.conf`; `firmware/app/boards/boards.json` (esp32s3_devkitc memory.retain_size)
- **Simulation:**
  - emulated ESP32-S3 HIL image: 16 before and after (hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh esp32s3; python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated`
- **Only silicon:** real flash behaviour: erase and program time, a cut in the middle of a sector, wear and retention
- **Verdict:** should pass

### RT-025.08 The other shipped boards have a storage partition for the records and the option is a documented state

- **Boards:** arduino_giga_r1, stm32f746g_disco, nucleo_h743zi, arduino_opta_wifi, waveshare_rp2040_zero
- **Given:** every board of boards.json other than the two learner boards
- **When:** check_storage_partitions.py and the Kconfig are read
- **Then:** each board has the records' partition (zplc_nvs_partition or storage_partition; ZMS on the Nucleo-H743ZI); the option is off in every shipped profile until a hardware record exists, which is the state this requirement's 'every shipped board' meets or does not
- **Code:** `tools/hil/check_storage_partitions.py`; `firmware/zephyr/Kconfig:427`; firmware/app/boards/&#42;.conf; `firmware/app/boards/boards.json`
- **Simulation:**
  - tools/hil/check_storage_partitions.py: `python3 tools/hil/check_storage_partitions.py`
- **Only silicon:** flash behaviour of each board's flash controller, none of which has been measured
- **Verdict:** should pass

## LNG-004 Breakpoints on source elements

### LNG-004.01 A breakpoint on an IL line

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** an IL program built with a debug map
- **When:** a breakpoint is set on an IL line
- **Then:** the line maps to the first instruction of that line and execution stops there
- **Code:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/compiler/debugElements.ts:117` elementBreakpointLine; `packages/zplc-ide/src/editors/elementBreakpoints.ts:55` toggleElementBreakpoint
- **Simulation:**
  - packages/zplc-ide/src/compiler/debugElements.test.ts: LNG-004 the debug map of an IL program names IL lines: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
  - elementBreakpoints.test.ts: a breakpoint on an IL line is the line of the IL source: `cd packages/zplc-ide && bun test src/editors/elementBreakpoints.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LNG-004.02 A breakpoint on a Ladder rung

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a Ladder diagram with a debug map
- **When:** a breakpoint is set on a rung
- **Then:** the rung maps to its instruction range and execution stops at its first instruction
- **Code:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/compiler/debugElements.ts:126` breakpointLineElement
- **Simulation:**
  - debugElements.test.ts: LNG-004 the debug map of a Ladder diagram names rungs and cells: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LNG-004.03 A breakpoint on an FBD block

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** an FBD diagram with a debug map
- **When:** a breakpoint is set on a block
- **Then:** the block maps to its instruction range and execution stops there
- **Code:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/compiler/debugElements.ts:131` breakpointElements
- **Simulation:**
  - debugElements.test.ts: LNG-004 the debug map of an FBD diagram names blocks: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LNG-004.04 A breakpoint on an SFC step and on an SFC transition

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** an SFC chart with a debug map
- **When:** a breakpoint is set on a step, then on a transition
- **Then:** each maps to its instruction range through the SFC source map and execution stops at each
- **Code:** `packages/zplc-ide/src/compiler/debugElements.ts:38` annotateDebugMapElements; `packages/zplc-ide/src/models/sourceElements.ts`; `packages/zplc-ide/src/compiler/debugElements.ts:140` elementAtPc
- **Simulation:**
  - debugElements.test.ts: LNG-004 the debug map of an SFC chart names steps and transitions: `cd packages/zplc-ide && bun test src/compiler/debugElements.test.ts`
  - packages/zplc-ide/src/transpiler/sourceMap.test.ts: LNG-004 and LNG-026 the SFC source map: `cd packages/zplc-ide && bun test src/transpiler/sourceMap.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LNG-004.05 Execution stops at the element in simulation

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a breakpoint on an element and the native runtime
- **When:** the program runs
- **Then:** the real VM stops at the element's first instruction and the paused state is observable
- **Code:** `packages/zplc-ide/src/compiler/debugElementsRuntime.test.ts`; `packages/zplc-ide/src/compiler/debugElements.ts:140` elementAtPc; `firmware/lib/zplc_core/src/core/zplc_debug.c`
- **Simulation:**
  - debugElementsRuntime.test.ts: LNG-004 a breakpoint on an element stops the VM at the element: `cd packages/zplc-ide && bun test src/compiler/debugElementsRuntime.test.ts  (needs ZPLC_NATIVE_SIM_BIN)`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### LNG-004.06 The breakpoint is armed on a board by program counter and stops the scheduler

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the debug map's pc for the element and a board running the program
- **When:** dbg bp add &lt;pc&gt; is sent by the IDE debugger and the scan reaches it
- **Then:** the VM pauses at that pc, the scheduler reports paused with the pc, and dbg resume or step continues
- **Code:** `firmware/app/src/shell_cmds.c:4705` dbg bp add/remove/clear/list; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2444` zplc_sched_debug_add_breakpoint; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:2166` zplc_sched_pause; `packages/zplc-ide/src/runtime/serialAdapter.ts`
- **Simulation:**
  - firmware/tests/scheduler_run_control (native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** a stop on a real chip over the serial link; the board path has no hardware run
- **Verdict:** should pass

### LNG-004.07 A paused or breakpointed board keeps its watchdog fed and its outputs defined

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a profile with the hardware watchdog on and pause=feed (boards.json watchdog.pause)
- **When:** a breakpoint holds the scan longer than the watchdog timeout
- **Then:** the control path feeds the watchdog, the board does not reset, and the physical outputs are driven to their safe state while the output image of the paused scan is kept (docs/docs/runtime/scheduler.md, the pause section)
- **Code:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:619` wait under a feeding profile; `firmware/lib/zplc_core/src/core/zplc_failsafe.c:114` zplc_wdt_action; `firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c:442` watchdog_policy
- **Simulation:**
  - firmware/tests/scheduler_watchdog (model of the part, native_sim): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - firmware/lib/zplc_core/tests/test_failsafe.c: `bun run test:core  (ctest --test-dir build/core-sanitized -R test_failsafe)`
- **Only silicon:** the real watchdog counter: its true timeout tolerance, and that the pins really fall to the safe level while the chip resets
- **Verdict:** should pass

### LNG-004.08 A breakpoint follows its element from build to build

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** a breakpoint on an element, then the program is edited and rebuilt
- **When:** the elements are reconciled
- **Then:** the breakpoint is re-armed at the same element's new range, and one whose element is gone is dropped
- **Code:** `packages/zplc-ide/src/editors/elementBreakpoints.ts:78` reconcileElementBreakpoints; `packages/zplc-ide/src/compiler/debugElements.ts:131` breakpointElements
- **Simulation:**
  - elementBreakpoints.test.ts: LNG-004 a breakpoint on an element is armed at the element and follows it from build to build: `cd packages/zplc-ide && bun test src/editors/elementBreakpoints.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## IO-006 Analog input and output

### IO-006.01 Raspberry Pi Pico AI0, AI1, AI2 read 0 to 3.3 V as 0 to 4095 counts

- **Boards:** Raspberry Pi Pico
- **Given:** boards.json lists AI0..AI2 on GP26..GP28 with raw 0..4095 over 0..3.3 V
- **When:** an analog voltage is applied
- **Then:** the value read is raw = V x 4095 / 3.3 within the documented tolerance
- **Code:** `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/rpi_pico_rp2040.overlay:151` &adc; `firmware/app/boards/boards.json` (io.channels kind analog)
- **Simulation:**
  - firmware/tests/io_analog (ADC emulator): `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated Pico bench: injection on ADC0..4 (a defect of rp2040js was fixed, hil-emulation.md): `bash tools/hil/emulator/setup.sh; tools/hil/emulator/build.sh pico; python3 tools/hil/run_chain.py rpi_pico --bench emulated`
- **Only silicon:** converter accuracy, offset, gain and noise of the real RP2040 ADC
- **Verdict:** should pass

### IO-006.02 Raspberry Pi Pico AI3 reports VSYS/3 and AI4 the temperature sensor with the documented formula

- **Boards:** Raspberry Pi Pico
- **Given:** boards.json documents AI3 as VSYS = 3 x input and AI4 as T = 27 - (V - 0.706) / 0.001721
- **When:** the two channels are read
- **Then:** the documented scaling is the one the HAL applies to the raw count
- **Code:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/rpi_pico_rp2040.overlay:46` io-channels = &lt;&adc 4&gt;
- **Simulation:**
  - firmware/tests/io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** the temperature sensor's chip-to-chip spread and its real accuracy
- **Verdict:** should pass

### IO-006.03 ESP32-S3 AI0 scaling is documented and read

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** boards.json documents V = raw x 4.4 / 4095
- **When:** 3.1 V is applied to GPIO4
- **Then:** the count is about 2885 as documented
- **Code:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:337` zplc_hal_adc_read; `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay:145` &adc0
- **Simulation:**
  - firmware/tests/io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - emulated ESP32-S3: not emulable (no SAR ADC): none yet
- **Only silicon:** eFuse calibration of the individual chip and nonlinearity near both ends
- **Verdict:** cannot be judged in software

### IO-006.04 A board whose description lists no analog channel does not offer one

- **Boards:** arduino_giga_r1, stm32f746g_disco, nucleo_h743zi, arduino_opta_wifi, waveshare_rp2040_zero
- **Given:** boards.json for GIGA R1, STM32F746G-DISCO, Nucleo-H743ZI, Opta and RP2040-Zero
- **When:** the analog channels are listed
- **Then:** none lists an analog channel; where the converter driver is not built, zplc_hal_adc_read returns ZPLC_HAL_NOT_IMPL with value 0 and the unsupported count rises
- **Code:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:384` stub zplc_hal_adc_read; `firmware/lib/zplc_core/src/core/zplc_sched_core.c:934` zplc_io_unsupported_get
- **Simulation:**
  - firmware/tests/io_table, io_analog: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### IO-006.05 An analog output is absent from every description

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1, arduino_giga_r1, stm32f746g_disco, nucleo_h743zi, arduino_opta_wifi, waveshare_rp2040_zero
- **Given:** no port drives an analog output (HAL comment at zplc_hal_zephyr.c after the ADC stub)
- **When:** boards.json is scanned for analog outputs
- **Then:** no channel has kind analog and direction output
- **Code:** `firmware/app/boards/boards.json` (io.channels kind analog); `firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c:384` (comment: no port drives an analog output)
- **Simulation:**
  - firmware/tests/io_table: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
  - tools/hil/test_board_io_description.py: `python3 -B tools/hil/test_board_io_description.py`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### IO-006.06 The analog scaling is documented where the learner reads it

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the supported boards reference and the first-board tutorial
- **When:** they are read against boards.json
- **Then:** the AI0 pin and scaling stated there equal boards.json (Pico GP26, ESP32-S3 GPIO4)
- **Code:** `docs/docs/reference/boards.md`; `docs/docs/tutorials/first-board.md`; `firmware/app/boards/boards.json` (io.channels kind analog)
- **Simulation:**
  - tools/docs/generate_board_reference.py: `python3 tools/docs/generate_board_reference.py --check`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

## COM-016 TLS and the random generator

### COM-016.01 A build with TLS on a non-cryptographic generator fails at build time

- **Boards:** nucleo_h743zi, arduino_opta_wifi, Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** TLS enabled with CONFIG_TEST_RANDOM_GENERATOR, or with no cryptographic source
- **When:** the application is configured
- **Then:** CMake stops with zplc_rule_tls_with_test_random_generator; the same options with a cryptographic source pass
- **Code:** `firmware/app/cmake/zplc_tls_rng_rule.cmake:19` zplc_check_tls_random; `firmware/app/CMakeLists.txt`
- **Simulation:**
  - tools/firmware-test/test_comm_rules.py TlsRandomRule: `python3 -B tools/firmware-test/test_comm_rules.py`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### COM-016.02 The rule fires in the application build

- **Boards:** arduino_opta_wifi
- **Given:** a build of the Opta with TLS on a test generator
- **When:** west build runs
- **Then:** the build stops with the rule name
- **Code:** `firmware/app/CMakeLists.txt`; `firmware/app/cmake/zplc_tls_rng_rule.cmake`
- **Simulation:**
  - tools/firmware-test/test_fwtest.py: `python3 -B tools/firmware-test/test_fwtest.py`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### COM-016.03 Nucleo-H743ZI and Opta use a hardware entropy source

- **Boards:** nucleo_h743zi, arduino_opta_wifi
- **Given:** the two board configs
- **When:** they are read
- **Then:** CONFIG_ENTROPY_STM32_RNG with CONFIG_ENTROPY_GENERATOR=y is set and CONFIG_TEST_RANDOM_GENERATOR is not set
- **Code:** `firmware/app/boards/nucleo_h743zi.conf:62-67`; `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf:60-65`
- **Simulation:**
  - tools/firmware-test/test_comm_rules.py: `python3 -B tools/firmware-test/test_comm_rules.py`
- **Only silicon:** that the STM32 RNG really is random on the board (HIL-011): its entropy quality and health tests
- **Verdict:** should pass

### COM-016.04 TLS is off on those two boards and the documentation says so

- **Boards:** nucleo_h743zi, arduino_opta_wifi
- **Given:** the two board configs and the docs
- **When:** they are read
- **Then:** CONFIG_MQTT_LIB_TLS, CONFIG_NET_SOCKETS_SOCKOPT_TLS and CONFIG_TLS_CREDENTIALS are n; connectivity.md and safety-and-limitations.md state it; a TLS transport is refused, not downgraded
- **Code:** `firmware/app/boards/nucleo_h743zi.conf:86-103`; `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf:89-106`; `docs/docs/runtime/connectivity.md:80`; `docs/docs/safety-and-limitations.md:103`; `firmware/app/src/zplc_mqtt.c:653-658`
- **Simulation:**
  - firmware/tests/tls_credentials: `ZPLC_FW_WS=<private view> bash tools/firmware-test/run.sh native`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### COM-016.05 Before GA the two boards have TLS on again with a verified hardware source

- **Boards:** nucleo_h743zi, arduino_opta_wifi
- **Given:** the GA gate
- **When:** the boards are built with TLS on
- **Then:** the build passes the rule and a hardware record of the generator (HIL-011) exists; the release notes name any board still without TLS
- **Code:** `firmware/app/boards/nucleo_h743zi.conf`; `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf`
- **Simulation:**
  - none for TLS on: the build passes the rule only with a cryptographic source: none yet
- **Only silicon:** everything: the generator verification and a TLS session on the real Nucleo and Opta need those boards (HIL-011)
- **Verdict:** should not pass

## DOC-004 First board and build from source

### DOC-004.01 A First board tutorial exists for the Raspberry Pi Pico

- **Boards:** Raspberry Pi Pico
- **Given:** docs/docs/tutorials/first-board.md
- **When:** it is read
- **Then:** it covers get firmware, flash, connect, deploy, start and observe for the Pico with its target rpi_pico/rp2040, example pico_blinky and pin GP0
- **Code:** `docs/docs/tutorials/first-board.md`; `docs/i18n/es/docusaurus-plugin-content-docs/current/tutorials/first-board.md`; `tools/docs/generate_board_reference.py`
- **Simulation:**
  - tools/docs/install_and_status_pages.test.ts: first board page: `bun test tools/docs/install_and_status_pages.test.ts`
- **Only silicon:** that each step works on a real Pico: the page states that nobody has executed it
- **Verdict:** should pass

### DOC-004.02 A First board tutorial exists for the ESP32-S3

- **Boards:** ESP32-S3-DevKitC-1
- **Given:** the same page
- **When:** it is read
- **Then:** it covers the same steps for the ESP32-S3 with esp32s3_devkitc/esp32s3/procpu, example esp32s3_blinky, GPIO15 and the USB port (not UART)
- **Code:** `docs/docs/tutorials/first-board.md`
- **Simulation:**
  - tools/docs/install_and_status_pages.test.ts: `bun test tools/docs/install_and_status_pages.test.ts`
- **Only silicon:** that each step works on a real ESP32-S3, including esptool and the download-mode caveat
- **Verdict:** should pass

### DOC-004.03 The tutorial is written from the board manifest

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** boards.json
- **When:** the page values are compared
- **Then:** build target, Studio board, example project, first output, pins and example commands equal the manifest
- **Code:** `firmware/app/boards/boards.json`; `firmware/zephyr/scripts/zplc_boards.py`; `tools/docs/install_and_status_pages.test.ts`
- **Simulation:**
  - tools/docs/install_and_status_pages.test.ts: `bun test tools/docs/install_and_status_pages.test.ts`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass

### DOC-004.04 The tutorial is honest about what has been executed

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** the page and the board support level cross-build
- **When:** it is read
- **Then:** it states in a danger admonition that nobody has executed it on a board and that a result is a lead until recorded
- **Code:** `docs/docs/tutorials/first-board.md`; `docs/docs/reference/capabilities-evidence.md`
- **Simulation:**
  - tools/docs/check_doc_claims.ts: `bun tools/docs/check_doc_claims.ts`
- **Only silicon:** the requirement asks for a tutorial that works; only a person following it on a board can show that
- **Verdict:** should pass

### DOC-004.05 Build firmware from source uses the script CI runs

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** docs/docs/guides/build-firmware.md, which names tools/firmware-test/setup.sh and run.sh size &lt;board&gt;
- **When:** the page is compared with the CI workflows
- **Then:** the commands on the page are the ones the CI jobs run; recorded fact: ci.yml lines 456-475 run 'west build' and 'python3 zplc/tools/firmware-test/fwtest.py size', and ci.yml:346 runs run.sh native32 qemu-m3 qemu-m0, while release.yml:278 runs 'west build -p always'
- **Code:** `docs/docs/guides/build-firmware.md`; `.github/workflows/ci.yml:456`; `.github/workflows/ci.yml:474`; `.github/workflows/release.yml:278`; `tools/firmware-test/run.sh`; `tools/firmware-test/fwtest.py`
- **Simulation:**
  - tools/firmware-test/test_fwtest.py: `python3 -B tools/firmware-test/test_fwtest.py`
- **Only silicon:** a Zephyr build on the author's machine: the page says the Zephyr builds were not run while writing it
- **Verdict:** should pass

### DOC-004.06 Both pages exist in English and Spanish

- **Boards:** Raspberry Pi Pico, ESP32-S3-DevKitC-1
- **Given:** first-board.md and build-firmware.md and their es twins
- **When:** the docs validation runs
- **Then:** the four files exist and have the same structure
- **Code:** `docs/i18n/es/docusaurus-plugin-content-docs/current/tutorials/first-board.md`; `docs/i18n/es/docusaurus-plugin-content-docs/current/guides/build-firmware.md`
- **Simulation:**
  - docs parity validation: `bun run docs:validate; bun run check:docs`
- **Only silicon:** nothing beyond the software; the verdict is complete in software
- **Verdict:** should pass
