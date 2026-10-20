---
slug: /learn/hardware-track
id: hardware-track
title: Hardware track
sidebar_label: Hardware track
description: "The hardware track of Learn, for a Raspberry Pi Pico or an ESP32-S3-DevKitC-1 of your own: choosing the board, what a lesson shows for it, who starts each physical operation, and how a check on the board is made and labelled. No board has a hardware record yet."
tags: [learn, lessons, hardware]
---

# Hardware track

Every lesson can be passed in simulation, with no hardware. The hardware track takes the
same lessons to a board on your desk, one of two learner boards:
a Raspberry Pi Pico (RP2040) or an ESP32-S3-DevKitC-1.
No check on either board has been recorded yet: see the end of this page.

## Choose your board

At the bottom of the Learn home, the **Hardware track** strip has a **Your board** group with
both boards, and every hardware lesson repeats that group at the top of its **On your board**
section. Choose the one you have. With the keyboard, move to the group with Tab, move between
the boards with the arrow keys and press Enter or Space. ZPLC says the board you chose and
keeps it on this computer.

## What a lesson shows for your board

In the lesson panel, **On your board** shows, for the board you chose:

- the wiring of the lesson as a diagram, and the same wiring as a numbered list;
- the pin map of the lesson: each part, its channel, the pin and where the pin is;
- the voltage limit, which a button above the diagram takes you to;
- the parts of the whole course;
- the firmware image for the board with its SHA-256, and the flashing steps you follow
  yourself: ZPLC does not flash a board;
- **Check on board**.

## You start every physical operation

Learn never connects to a board, deploys, runs, stops, forces a value or flashes firmware by
itself. You do each of these with the usual ZPLC controls. **Check on board** stays disabled,
and says what is missing, until:

1. you chose a board;
2. ZPLC is connected to it;
3. the lesson program is built and deployed to the board, and is either stopped or running;
4. the board reports which board it is, and it is the board you chose. A board that reports
   another board, or none, is named as the problem.

The check only reads the board: it stops when the board stops, and it never starts it again.

## Checking a run on your board

Press **Check on board**. The panel lists the steps: each input change of the lesson's reference
scenario, on the part and channel the wiring names, for example "press and hold Test button
(DI0) now". It shows the step you are on, moves to the next one when the board shows that you
made it, keeps reading for the rest of the scenario, and then grades the run. **Cancel the
check** stops it, and nothing is recorded.

### Arm, then press Run

When the program is stopped as you press **Check on board**, the check gets ready to record and
asks you to press **Run** in the toolbar. You start the program; the check never does. The first
scan after you press **Run** is time 0 of the scenario, as it is in simulation, so a blink or a
timer that starts with the program lines up with the scenario. The inputs the scenario sets at
time 0 are the inputs at that first scan.

When the program is already running, the check starts recording at once, and its time 0 is the
first sample it reads. A lesson that asserts something about the program before your first
action, other than at time 0, cannot be checked that way: its result depends on when the program
started. For such a lesson the panel asks you to stop the program first, then press **Check on
board** and **Run**. blinky-ladder-timer-feedback and verify-my-board are such lessons.

The check uses the lesson's reference scenario, the same file and content hash as the check in
simulation. A failed check says which assertion failed, at what time in the recorded trace, the
expected and observed values, and which sample of the trace it read.

### How the board is read, and the time tolerance

A board flashed with the learner firmware keeps a trace of its own scans (`zplc dbg trace`, see
the [shell commands](../reference/shell-commands.md)): at the end of every scan it keeps
the time the scan read its inputs, the scan's number since **Run**, and the bytes of the input and
output images that hold the lesson's signals, in a ring of 2048 bytes. ZPLC reads the ring
about every 100 ms, not at every scan, and grades one sample per scan. Keeping the trace never changes the program:
it does not write memory, force a value, or start or stop anything.

A lesson declares `timeMs`, how far in either direction a sample may sit from the time an
assertion names. With the device trace it must be at least one scan of the slowest task of the
lesson's starter project plus an assumed jitter margin of 10 ms: an output changes up to one scan after
its input, and the margin covers the 1 ms resolution of the trace's timestamps, the kernel tick
that releases a scan, and the time a scan takes before its outputs are written. Every hardware
lesson runs a 10 ms task, so each declares 20 ms, and ZPLC refuses a lesson that declares less.

A board whose firmware has no device trace is read the way it was before: through the same read
that fills the Watch table, every 100 ms. One read is at most two `zplc dbg peek` commands of
about 96 characters each, 2 × 96 × 10 bits / 115200 bit/s, about 17 ms, and the check allows
20 ms, so a sample follows the one before it by at most 120 ms. The check then widens the
lesson's tolerance by that period, less the jitter margin: 20 ms becomes 130 ms, not less than
one sampling period plus one scan.

These numbers are derived from the firmware and the serial settings; they were not measured on a
board. No scan-jitter record of the hardware-in-the-loop plan (HIL-010) exists yet to confirm or
replace the 10 ms margin. `analogPercent` is for analog values; scenarios hold on/off
conditions only today, so it has nothing to compare yet.

### How the scenario is aligned on what you did

In simulation the scenario changes the inputs at exact times. On a board you change them by
pressing buttons, so your timing is human. The check therefore aligns the scenario on what you
did:

1. Each input change of the scenario, in time order, is found in the trace at the first sample,
   after the previous change, that holds the values it sets. A change you never made leaves
   every later change unmade too.
2. A scenario time is moved onto the trace through the input change it depends on: the time
   you made that change, plus the time the scenario allows after it. Before your first change,
   a scenario time is read where the scenario puts it, from time 0.
3. Each assertion is then checked as in simulation, on the moved times, with `timeMs` of slack:
   a window that must contain a match grows by `timeMs` at both ends, and a window that must
   hold throughout shrinks by `timeMs` at both ends.
4. An assertion that depends on an input change you never made fails, with nothing observed.
5. When the trace starts at **Run**, the input changes at time 0 are taken at time 0 and not
   searched for: a button you hold as you press **Run** does not move the rest of the scenario.

### What a check on the board cannot tell apart

- A check recorded by polling has 130 ms of slack either way, and every hardware lesson asserts
  its outputs at times only one or two scans apart, 10 or 20 ms. Such a check cannot tell those
  assertions apart, so it is weaker than the check in simulation. With the device trace the
  slack is 20 ms, and the check sees each scan.
- After you press or release a button, the scenario moves its times onto your action. An
  assertion after it that depends on the program's own timer, not on your action, then holds
  only if you acted near the time the scenario names. verify-my-board asserts the blink 100 ms
  and 230 ms after you release its button, so its check passes only when you release the button
  about 1.35 s after **Run**, give or take the tolerance.
- The assertions are not loosened for the board, and the simulation check stays the pass of the
  course.

## A run on the board is labelled apart

A pass on the board is shown as **Passed on hardware**: in the Hardware track strip, which
lists those lessons, and on the lesson's progress line. It does not pass a lesson that can be
graded in simulation, and a pass in simulation is not a pass on hardware. The one exception is
verify-my-board, which has only the hardware track: its check on the board is its pass. Your
progress keeps the newest hardware pass of each lesson apart from its simulation grade, with the
hash of the program (the SHA-256 of the artifact ZPLC deployed to the board in this session,
or of the build's debug map when ZPLC did not deploy it) and the ZPLC version the board
reported. A progress file of an earlier version is read and converted.

## Before you wire anything

- The input and output pins work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything
  from the mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico,
  keep the total under 50 mA.
- Wire with the USB cable unplugged, and check twice before you plug it in.

## What is proven, and what is not yet here

- The check is proven on the development host against synthetic traces: traces built by the
  tests to look like what a board reports. The recorder and the steps of the check are proven
  against simulated sessions. The board choice, the wiring of each board, the labels and the
  disabled check with its reason are proven in ZPLC on Linux.
- No trace from a real board and no run on a physical board are part of this evidence. Runs on
  both boards are hardware-in-the-loop evidence that is still to be recorded.
