---
slug: /learn/hardware-track
id: hardware-track
title: Hardware track
sidebar_label: Hardware track
description: "The hardware track of Learn, for a Raspberry Pi Pico or an ESP32-S3-DevKitC-1 of your own: choosing the board, who starts each physical operation, and how a check on the board is made and labelled. No board has a hardware record yet."
tags: [learn, lessons, hardware]
unlisted: true
---

# Hardware track

Every lesson can be passed in simulation, with no hardware. The hardware track takes the
same lessons to a board on your desk, one of two learner boards:
a Raspberry Pi Pico (RP2040) or an ESP32-S3-DevKitC-1.
No check on either board has been recorded yet: see the end of this page.

## Choose your board

At the bottom of the Learn home, the **Hardware track** strip has a **Your board** group with
both boards. Choose the one you have. With the keyboard, move to the group with Tab, move
between the boards with the arrow keys and press Enter or Space. Studio says the board you
chose and keeps it on this computer.

## You start every physical operation

Learn never connects to a board, deploys, runs, stops, forces a value or flashes firmware by
itself. You do each of these with the usual Studio controls. The hardware check only reads a
board that you connected, deployed to and started; it refuses a board that is not connected
or not running, and it stops when the board stops.

## How a run on the board is checked

The hardware check uses the lesson's reference scenario, the same file and content hash as the
check in simulation. Studio reads the lesson's inputs and outputs from the board at a fixed
interval, through the same read that fills the Watch table, and records them as a trace. The
lesson declares two tolerances: `timeMs`, how far in either direction a sample may sit from
the time an assertion names, and `analogPercent`, for analog values.

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

Scenarios hold on/off conditions only today, so `analogPercent` has nothing to compare yet.

A failed check says which assertion failed, at what time in the recorded trace, the expected
and observed values, and which sample of the trace it read.

## A run on the board is labelled apart

A pass on the board is shown as **Passed on hardware**: in the Hardware track strip, which
lists those lessons, and on the lesson's progress line. It does not pass the lesson in the
course, which is graded in simulation, and a pass in simulation is not a pass on hardware.
Your progress keeps the newest hardware pass of each lesson apart from its simulation grade,
and a progress file of an earlier version is read and converted.

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
  tests to look like what a board reports. The recorder is proven against a simulated session.
  The board choice and the labels are proven in Studio on Linux.
- No trace from a real board and no run on a physical board are part of this evidence. Runs on
  both boards are hardware-in-the-loop evidence that is still to be recorded.
- The wiring card of each lesson and the button that records and checks a run from the lesson
  panel are not in Studio yet.
