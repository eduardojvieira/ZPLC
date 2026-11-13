---
title: 'Plant I/O mode'
sidebar_label: 'Plant I/O mode'
description: 'Feeding a board from the plant: what the mode does, who may start it, what the board outputs do, and what evidence exists at each level. No board has been measured yet.'
tags: [plant, hardware, evidence]
---

# Plant I/O mode

Plant I/O mode lets a board run your program against the simulated plant. The inputs that the plant map binds take their values from the plant over the device link instead of from the pins of the board, and the output image of the board is published to the plant. Your program does not change. It is how a scene lesson reaches a board without a real machine.

This page says what the mode does and what has been shown about it. Where nothing has been shown, it says so.

## What has been shown

| Claim                                                                                                             | Level               | Evidence                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| The firmware validates every frame, applies inputs at the scan, keeps the pins safe and leaves the mode on a rule | Host (C unit tests) | `firmware/lib/zplc_core/tests/test_plant.c`, `test_plant_sched.c` and `test_plant_attack.c` |
| The firmware module runs in the native simulator and answers frames                                               | Native simulator    | `firmware/tests/plant_io` and the rehearsal record below                                    |
| Studio feeds a board from the plant, in a loop, with a latency check and a pulse warning                          | Host (test double)  | the tests of `packages/zplc-ide/src/plant/board`, which use a fake board                    |
| The mode builds for a catalogued board                                                                            | Target build        | Not recorded on this page                                                                   |
| The mode runs on a physical board, over USB serial or over TCP                                                    | HIL                 | **None. No physical board run exists yet.**                                                 |

The one measurement that exists is a rehearsal in the native simulator, recorded in `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json`. A Linux host sent 500 frames, one every 20 ms, to the simulator through a pseudo-terminal. The round trip of a frame was 19.02 ms at the median (p50), 19.49 ms at the 95th percentile (p95) and 20.27 ms at most, and the run had no late scan, no rejected frame and no timeout. This is a host talking to a simulator. It is not a board, it is not a real link and it says nothing about the timing on a board.

Frame rate and link latency on a board are not yet measured. This documentation gives no figure for them and no list of boards that work.

## Who starts it

Entering the mode is a physical operation: the outputs of a board are decided by something other than its own pins. Because of that:

- **A person starts it, every session.** The action is the command **Feed the board from the plant**. The text that Studio shows to confirm it reads: "The board will read its inputs from the simulated plant and not from its terminals, until you close the mode or the link ends. Check that nothing connected to its outputs can cause harm."
- **AI and MCP never start it.** The MCP server has no tool that enters, feeds or mirrors a plant, and a test checks that. An agent may run a scene scenario headless against a simulated runtime, which touches no board.
- **The command is not available yet.** In this version the command exists but is disabled, because the persistent indicator that shows the mode is on is not mounted in Studio yet. Studio cannot start the mode from the interface until it is.

The mode is a capability that the firmware offers on the control link. With firmware that does not offer it, Studio says so, and a lesson shows its hardware track as unsupported, with the reason.

## What the outputs of the board do

- **They stay safe while the mode is on.** The pins of the board hold their documented safe level while the board is fed from the plant. The output image still carries what your program writes, and the plant reads it.
- **Mirroring is a second decision.** A person may turn mirroring on for the session, and only then do the pins follow the output image. It is off every time the mode starts.
- **The mode ends on a rule, and the pins stay safe.** The mode ends when you close it, when the board gets no frame in time, when the session ends, when the link is lost, when the program is stopped, paused or reset, when the board reports a fault or when it rejects frames that break the protocol. Studio names the reason. The board does not go on with stale plant values and does not go back to its pins by itself.
- **The exchange does not delay the scan.** A frame that arrives late is counted and shown.

These rules are shown in the firmware tests at the host level. They are not shown on a board yet.

## What to connect

For a scene, the board needs only the connection to Studio: a USB serial cable to the computer. The inputs that the plant map binds need nothing on their terminals, because the plant supplies them. The outputs stay safe, so a lamp or a relay wired to an output does not follow the plant unless you turn mirroring on.

No lesson offers the hardware track through plant I/O mode today. Every scene lesson is simulation only and says why. When a lesson offers it, its page says what to connect for that lesson, and a check on the board is labelled as a hardware result, as in the [hardware track](../learn/hardware-track.md).

## What is not claimed

No board has run this mode in a recorded test. This page gives no timing, no frame rate and no list of boards for it. When a hardware run is recorded, this page will cite its file.

## See also

- [The scene editor](./scene-editor.md)
- [The shipped scenes](./scenes.md)
- [The plant clock](./clock.md)
- [Hardware track](../learn/hardware-track.md)
