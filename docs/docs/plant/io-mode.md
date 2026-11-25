---
title: 'Plant I/O mode'
sidebar_label: 'Plant I/O mode'
description: 'Feeding a board from the plant: what the mode does, who may start it, what the board outputs do, how it ends, the wire, the latency rule and what evidence exists at each level. No board has been measured yet.'
tags: [plant, hardware, evidence]
---

# Plant I/O mode

Plant I/O mode lets a board run your program against the simulated plant. The inputs that the plant map binds take their values from the plant over the device link instead of from the pins of the board, and the output image of the board is published to the plant. Your program does not change. It is how a scene lesson reaches a board without a real machine.

This page says what the mode does and what has been shown about it. Where nothing has been shown, it says so.

**No board has hardware evidence for plant I/O mode yet.** Every result below comes from the host, the native simulator, QEMU, emulation or a build.

## What has been shown

| Claim                                                                                                                                     | Level                                         | Evidence                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The firmware validates every frame, applies inputs at the scan, keeps the pins safe and leaves the mode on a rule                         | Host (C unit tests)                           | `firmware/lib/zplc_core/tests/test_plant.c`, `test_plant_sched.c` and `test_plant_attack.c`                      |
| The device link engine serves the five messages, needs a session, ends the mode with the session, and asks a network link to authenticate | Host (C unit tests)                           | `firmware/lib/zplc_core/tests/test_proto_plant.c`                                                                |
| The firmware module runs on the Zephyr scheduler and answers frames                                                                       | Native simulator                              | `firmware/tests/plant_io`, `firmware/tests/app_plant_link/test_app_plant_link.py` and the rehearsal record below |
| The same suite runs on a 32-bit Cortex-M instruction set, without the cases that watch a pin                                              | QEMU                                          | `firmware/tests/plant_io` on `qemu_cortex_m3`                                                                    |
| A held output pin stays at its safe level, and follows the image when mirroring is on                                                     | Emulation (the GPIO emulator of `native_sim`) | `test_hold_on_gpio_emul` in `firmware/tests/plant_io`                                                            |
| ZPLC feeds a board from the plant, in a loop, with a latency check and a pulse warning                                                    | Host (test double)                            | the tests of `packages/zplc-ide/src/plant/board`, which use a fake board                                         |
| The mode builds for a catalogued board                                                                                                    | Target build                                  | Not recorded on this page                                                                                        |
| The mode runs on a physical board, over USB serial or over TCP                                                                            | HIL                                           | **None. No physical board run exists yet.**                                                                      |

The one measurement that exists is a rehearsal in the native simulator, recorded in `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json`. A Linux host sent 500 frames, one every 20 ms, to the simulator through a pseudo-terminal. The round trip of a frame was 19.02 ms at the median (p50), 19.49 ms at the 95th percentile (p95) and 20.27 ms at most, and the run had no late scan, no rejected frame and no timeout. This is a host talking to a simulator. It is not a board, it is not a real link and it says nothing about the timing on a board.

Frame rate and link latency on a board are not yet measured. This documentation gives no figure for them and no list of boards that work. The runs that will measure them, on the ESP32-S3-DevKitC-1 and the Raspberry Pi Pico, are written down in `tools/hil/BENCH-2.1.md` and made with `tools/hil/plant_io_bench.py`; none has been made yet.

## Who starts it

Entering the mode is a physical operation: the outputs of a board are decided by something other than its own pins. Because of that:

- **A person starts it, every session.** The action is the command **Feed the board from the plant**. The text that ZPLC shows to confirm it reads: "The board will read its inputs from the simulated plant and not from its terminals, until you close the mode or the link ends. Check that nothing connected to its outputs can cause harm."
- **AI and MCP never start it.** The MCP server has no tool that enters, feeds or mirrors a plant, and a test checks that. An agent may run a scene scenario headless against a simulated runtime, which touches no board.
- **The command is not available yet.** In this version the command exists but is disabled, because the persistent indicator that shows the mode is on is not mounted in ZPLC yet. ZPLC cannot start the mode from the interface until it is.

The firmware enters the mode only inside an open session of the device link, and only while the program is running.

## Firmware without the capability

The mode is a capability that the firmware offers on the control link: the `PLANT` bit of the hello. A build with `CONFIG_ZPLC_PLANT_IO` off does not offer it and answers the five messages as unsupported. With such firmware ZPLC says so, and a lesson shows its hardware track as unsupported, with the reason:

- a firmware that speaks the text shell only: "This firmware speaks the text shell only, so it cannot be fed from the plant. Update the firmware to a version with plant I/O and connect again, or run the scene in simulation."
- a framed firmware without the bit: "This firmware does not offer plant I/O. Update the firmware to a version that does, or run the scene in simulation."

## What the outputs of the board do

- **They stay safe while the mode is on.** The pins of the board hold their documented safe level while the board is fed from the plant. The output image still carries what your program writes, and the plant reads it.
- **Mirroring is a second decision.** A person may turn mirroring on for the session, and only then do the pins follow the output image. It is off every time the mode starts.
- **The exchange does not delay the scan.** The scan takes the plant values without waiting for the link, and a scan that finds no new frame is counted as late and shown.

## How the mode ends

The mode ends when you close it, when the board gets no frame in time, when the session ends, when the link is lost, when the program is stopped, paused or reset, when the board reports a fault or when it rejects eight frames in a row. ZPLC names the reason:

| Reason        | What ended the mode                                        |
| ------------- | ---------------------------------------------------------- |
| `CLOSED`      | a person closed it                                         |
| `TIMEOUT`     | no valid frame arrived within the timeout of the entry     |
| `SESSION_END` | the session ended: closed, idle, taken over or re-keyed    |
| `LINK_LOST`   | the board saw its link drop                                |
| `RUN_CONTROL` | the program was stopped, reset, loaded, paused or resumed  |
| `FAULT`       | the board reported a fault                                 |
| `PROTOCOL`    | eight frames in a row broke the protocol and were rejected |

Every reason ends the same way: **the program is stopped and the outputs go to their safe level**, as a STOP command leaves them (output image reset, forces released). The board does not go on with stale plant values and does not go back to its pins by itself. To go on, a person runs the program again, and it starts reading its pins.

**How old a plant value can be.** The timeout is asked when the mode starts, and the firmware grants a value from 50 ms to 2000 ms. When no valid frame arrives within it, the mode ends with `TIMEOUT`. A plant value the program reads is therefore at most the timeout plus one scan old. A rejected frame does not count as a frame: it changes no input and does not restart the timeout.

On a board whose USB port reports no line state, as the ESP32-S3 USB-Serial/JTAG port, the timeout is what notices a pulled cable. These rules are shown in the firmware tests at the host, native-simulator and emulation levels. They are not shown on a board yet.

## The wire

The mode uses five request and response messages of the [framed device link](../reference/runtime-api.md) and one event. Over USB serial, the frames travel as `zplc link <hex>` lines of the shell, as every other framed message does. Each message needs an open session.

| Message          | Id     | Request                                                                                 | Response, after the status byte                                                                           |
| ---------------- | ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `PLANT_ENTER`    | `0x70` | the timeout, the number of inputs and outputs, then one 3-byte descriptor for each slot | the entry id, the input and output byte counts, the slots per direction, the granted timeout              |
| `PLANT_FRAME`    | `0x71` | the entry id, a sequence number, then the input values                                  | the last sequence a scan applied, the scans, the mirror flag, late and rejected counts, the output values |
| `PLANT_EXIT`     | `0x72` | nothing                                                                                 | the reason (`CLOSED`), the frames, late and rejected counts                                               |
| `PLANT_MIRROR`   | `0x73` | 0 or 1                                                                                  | the mirror state                                                                                          |
| `PLANT_STATUS`   | `0x74` | nothing                                                                                 | active, the entry id, mirror, the frames, late and rejected counts, the age of the last frame             |
| `EVT_PLANT_EXIT` | `136`  | (an event the board pushes)                                                             | the reason and the frames                                                                                 |

A descriptor names a byte offset of the input or output image and a type: BOOL with its bit, INT or REAL. Values travel the same way in both directions: one bitmap with the BOOL values, then each INT as 2 bytes and each REAL as 4 bytes (IEEE 754), little endian. An entry binds at most 32 slots per direction (`CONFIG_ZPLC_PLANT_MAX_SLOTS`, from 8 to 64). The firmware checks every frame before it changes an input: the frame CRC, the session, the entry id, the exact length, the padding bits, that each REAL is a finite number and that the sequence is newer than the last one.

TCP is not available for this mode. The Zephyr firmware has no TCP transport for the device link; only the host tests show that the engine asks a network link to authenticate before it serves the mode.

## The latency and the pulse warning

On every exchange ZPLC measures two times, over the last 200 exchanges:

- the **round trip**, from sending a frame to reading its response (the last value, the median, the 95th percentile and the worst);
- the **gap**, between two responses in a row (the last value and the worst).

It also shows the late and rejected counts the board reports. A late count that grows is normal when the board scans faster than frames arrive: it is information, not an error.

A sensor pulse shorter than the gap between two frames can fall between them, and one scan of margin covers the latch. ZPLC warns while the mode runs when the worst gap plus one scan is longer than the shortest pulse of the scene: "The shortest pulse of this scene is \{sceneMs\} ms, but the link can leave \{worstGapMs\} ms between two frames with a scan of \{scanMs\} ms. A pulse can be missed on this connection." The indicator that will show these figures is not mounted in ZPLC yet.

The same rule decides which scenes may offer the hardware track: the shortest pulse must be at least the worst gap plus one scan on both learner boards over USB serial, and only a run recorded on a board at the bench counts. Every shipped scene declares its pulse. The four plants of 2.0 declare none, so ZPLC uses the shortest sensor pulse of the graded scenarios of their lessons, without changing any scenario, hash or grade: 20 ms for the motor, 10 ms for the conveyor, 20 ms for the tank and 60 ms for the pedestrian crossing. The table `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-qualification.json` is provisional: it is made from the fake board of the tests, not from a board, and it offers no scene and no plant.

## What to connect

For a scene, the board needs only the connection to ZPLC: a USB serial cable to the computer. The inputs that the plant map binds need nothing on their terminals, because the plant supplies them. The outputs stay safe, so a lamp or a relay wired to an output does not follow the plant unless you turn mirroring on.

No lesson offers the hardware track through plant I/O mode today. Every scene lesson is simulation only and says why. When a lesson offers it, its page says what to connect for that lesson, and a check on the board is labelled as a hardware result, as in the [hardware track](../learn/hardware-track.md).

## What is not claimed

No board has run this mode in a recorded test. This page gives no timing, no frame rate and no list of boards for it. When a hardware run is recorded, this page will cite its file and the worst gap it measured.

## See also

- [The scene editor](./scene-editor.md)
- [The shipped scenes](./scenes.md)
- [The plant clock](./clock.md)
- [Hardware track](../learn/hardware-track.md)
- [Firmware testing](../development/firmware-testing.md#plant-io-mode)
