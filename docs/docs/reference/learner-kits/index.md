---
title: Learner kits
sidebar_label: Learner kits
description: "The two learner boards of the course, the parts a learner needs, and how a lesson declares its hardware track and its wiring."
tags: [learn, hardware, boards]
---

# Learner kits

The course runs every lesson in simulation. Lessons that list the **Hardware** track also run on one of
two learner boards: the Raspberry Pi Pico (RP2040) or the ESP32-S3-DevKitC-1. Both boards use the same
breadboard parts, and every hardware lesson has one wiring file that serves both boards.

## How a lesson declares the hardware track

A lesson on the hardware track lists it in `lesson.json` and adds a `hardware` block:

```json
"tracks": ["simulation", "hardware"],
"hardware": {
  "wiring": "wiring.json",
  "tolerances": { "timeMs": 200, "analogPercent": 5 }
}
```

- `timeMs` is how far, in either direction, a sample of a trace recorded from the board may sit from the
  scenario time that an assertion names.
- `analogPercent` is the deviation an analog value may have, as a percentage of its full scale.
- A lesson without the hardware track keeps `unsupported.hardware`, with a reason and an "instead" in
  English and Spanish. A lesson that only runs on a board, such as "verify my board", lists
  `tracks: ["hardware"]` and says in `unsupported.simulation` why it has no simulation grade.

## The wiring file

`wiring.json` lists the parts on the breadboard and the board channel each one connects to. It names
channel ids (`DO0`, `DI1`, `AI0`), never GPIO numbers: the pins come from the board I/O description,
`firmware/app/boards/boards.json`, so a pin that moves in the firmware moves in every diagram.

```json
{
  "schemaVersion": 1,
  "parts": [
    { "id": "lamp", "kind": "led", "channel": "DO0", "color": "red", "resistorOhms": 330, "label": { "en": "Lamp", "es": "Lámpara" } },
    { "id": "start", "kind": "button", "channel": "DI0", "label": { "en": "Start", "es": "Arranque" } }
  ]
}
```

| Kind | How it is wired |
|---|---|
| `led` | From the pin, through its series resistor (`resistorOhms`), to GND. |
| `button` | Between the pin and GND. The internal pull-up of the board reads it. |
| `jumper` | A wire that the learner plugs between the pin and GND to hold an input on. |
| `potentiometer` | Ends on 3V3 and GND, wiper on the analog pin. |

`boards` limits a part to some learner boards, for example the on-board LED of the Pico; without it, the
part is wired on both boards. A channel that the board carries itself (the Pico's LED, the BOOT button of
the ESP32-S3) needs no wiring.

The lesson CI refuses a hardware lesson when:

- the lesson lists the hardware track and has no `hardware` block or no `wiring.json`;
- a part names a channel that one of the learner boards does not have;
- the program of the lesson uses an input or output that no part is wired to, or a part is wired to a
  channel that the program does not use. An address that a board has no channel for passes only when
  the project declares it in `io.virtual`.
