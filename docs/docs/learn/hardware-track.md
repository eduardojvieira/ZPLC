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
the boards with the arrow keys and press Enter or Space. Studio says the board you chose and
keeps it on this computer.

## What a lesson shows for your board

In the lesson panel, **On your board** shows, for the board you chose:

- the wiring of the lesson as a diagram, and the same wiring as a numbered list;
- the pin map of the lesson: each part, its channel, the pin and where the pin is;
- the voltage limit, which a button above the diagram takes you to;
- the parts of the whole course;
- the firmware image for the board with its SHA-256, and the flashing steps you follow
  yourself: Studio does not flash a board;
- **Check on board**.

## You start every physical operation

Learn never connects to a board, deploys, runs, stops, forces a value or flashes firmware by
itself. You do each of these with the usual Studio controls. **Check on board** stays disabled,
and says what is missing, until:

1. you chose a board;
2. Studio is connected to it;
3. the lesson program is built, deployed to the board and running;
4. the board reports which board it is, and it is the board you chose. A board that reports
   another board, or none, is named as the problem.

The check only reads the board: it stops when the board stops, and it never starts it again.

## Checking a run on your board

Press **Check on board**. The panel lists the steps: each input change of the lesson's reference
scenario, on the part and channel the wiring names, for example "press and hold Test button
(DI0) now". It shows the step you are on, moves to the next one when the board shows that you
made it, keeps reading for the rest of the scenario, and then grades the run. **Cancel the
check** stops it, and nothing is recorded.

The check uses the lesson's reference scenario, the same file and content hash as the check in
simulation. A failed check says which assertion failed, at what time in the recorded trace, the
expected and observed values, and which sample of the trace it read.

### How the board is read, and the time tolerance

Studio reads the lesson's inputs and outputs through the same read that fills the Watch table,
and waits 100 ms between two reads, the polling interval of the Watch table. One read is at most
two `zplc dbg peek` commands, the input image and the output image, of about 96 characters each.
At 115200 baud that is 2 × 96 × 10 bits / 115200 bit/s, about 17 ms, and the check allows 20 ms.
So a sample follows the one before it by at most 120 ms.

A lesson declares `timeMs`, how far in either direction a sample may sit from the time an
assertion names. It must be at least 120 ms plus one scan of the slowest task of the lesson's
starter project, or the check could fail a correct program: an output changes up to one scan
after its input, and is read up to 120 ms later. Every hardware lesson runs a 10 ms task, so each
declares 130 ms, and Studio refuses a lesson that declares less. These numbers are derived from
the serial settings; they were not taken on a board. `analogPercent` is for analog values;
scenarios hold on/off conditions only today, so it has nothing to compare yet.

### How the scenario is aligned on what you did

In simulation the scenario changes the inputs at exact times. On a board you change them by
pressing buttons, so your timing is human. The check therefore aligns the scenario on what you
did:

1. Each input change of the scenario, in time order, is found in the trace at the first sample,
   after the previous change, that holds the values it sets. A change you never made leaves
   every later change unmade too.
2. A scenario time is moved onto the trace through the input change it depends on: the time
   you made that change, plus the time the scenario allows after it.
3. Each assertion is then checked as in simulation, on the moved times, with `timeMs` of slack:
   a window that must contain a match grows by `timeMs` at both ends, and a window that must
   hold throughout shrinks by `timeMs` at both ends.
4. An assertion that depends on an input change you never made fails, with nothing observed.

### What a check on the board cannot tell apart

- Every hardware lesson asserts its outputs at times only one or two scans apart, 10 or 20 ms.
  With 130 ms of slack either way, the check cannot tell such assertions apart, so on a board it
  is a weaker check than in simulation. The assertions are not loosened for it, and the
  simulation check stays the pass of the course. This holds for every lesson on the hardware track today:
  analog-scaling-integer, blink-structured-text, blinky-ladder-timer-feedback,
  boolean-logic-two-hand-guard, counter-batch-fbd, edge-counter-pulses, function-block-pump-pair,
  instruction-list-door-alarm, motor-start-stop-safe, one-logic-five-languages,
  scan-cycle-one-scan-memory, seal-in-ladder, set-reset-alarm-latch, sfc-fill-mix-sequence,
  structures-arrays-call-panel, timers-on-delay-off-delay, types-arithmetic-comparison and
  verify-my-board.
- An assertion on a timer before the first input change depends on when the program started,
  which a check of a program that is already running cannot know. blinky-ladder-timer-feedback
  and verify-my-board have such assertions.

## A run on the board is labelled apart

A pass on the board is shown as **Passed on hardware**: in the Hardware track strip, which
lists those lessons, and on the lesson's progress line. It does not pass a lesson that can be
graded in simulation, and a pass in simulation is not a pass on hardware. The one exception is
verify-my-board, which has only the hardware track: its check on the board is its pass. Your
progress keeps the newest hardware pass of each lesson apart from its simulation grade, with the
hash of the build (the SHA-256 of its debug map) and the ZPLC version the board reported. A
progress file of an earlier version is read and converted.

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
  disabled check with its reason are proven in Studio on Linux.
- No trace from a real board and no run on a physical board are part of this evidence. Runs on
  both boards are hardware-in-the-loop evidence that is still to be recorded.
