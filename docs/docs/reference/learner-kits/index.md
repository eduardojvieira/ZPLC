---
title: Learner kits
sidebar_label: Learner kits
description: "The two learner boards of the course, the parts a learner needs, and how a lesson declares its hardware track and its wiring."
tags: [learn, hardware, boards]
---

# Learner kits

The course grades every simulation lesson on this computer. Lessons that list the **Hardware** track
are written for the learner boards of the course, the Raspberry Pi Pico (RP2040) and the
ESP32-S3-DevKitC-1: both use the same breadboard parts, and every hardware lesson has one wiring file
that serves both boards. No hardware run of a lesson has been recorded on a board yet; until one is,
the hardware track is a plan backed by the wiring checks below, not by a board.

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

## The two kits

Each learner board has a kit page with its pin map generated from the board I/O description, the bill
of materials, the prebuilt firmware file and where its SHA-256 is published, the flashing steps and the
voltage limit. It lists every hardware lesson with a wiring page for that board.

- [Raspberry Pi Pico (RP2040)](./rpi-pico-rp2040.md)
- [ESP32-S3-DevKitC-1 (N8R8)](./esp32-s3-devkitc.md)

## One kit for the whole course

The course has one bill of materials, the same for either board: one board, a USB data cable, a
breadboard, six LEDs with six 330 Ω resistors, three push buttons, two 10 kΩ resistors, a 10 kΩ
potentiometer, a 100 nF capacitor and twenty jumper wires. The parts are reused from lesson to lesson:
the lesson CI checks that the kit holds what each hardware lesson needs at once, on each board.

## Safe parts only

Every hardware lesson uses logic-level inputs and outputs and low-voltage parts, and the course contains
no mains wiring. The lesson CI enforces it (LRN-016):

- a part is an LED, a resistor, a button, a potentiometer, a capacitor or a jumper wire, and nothing
  else: no relay, motor or buzzer is ever driven from a pin;
- every LED on a header pin is red, green or yellow, with a series resistor of at least 330 Ω;
- no part names a voltage above 3.3 V, and nothing names mains.

Every wiring page states the voltage limit of the kit:

- The I/O pins work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from
  mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin, and join the grounds.
- Keep each output under 10 mA (one LED with 330 Ω draws about 4 mA). On the Pico, keep the total
  under 50 mA.
- Wire with the USB cable unplugged, and check twice before plugging it in.

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
part is wired on both boards. A channel that the board carries itself, the on-board LED of the Pico, needs
no wiring. Every input of both boards is a part on a header pin: the BOOT button of the ESP32-S3 is a
strapping pin and is never one of them.

The lesson CI refuses a hardware lesson when:

- the lesson lists the hardware track and has no `hardware` block or no `wiring.json`;
- a part names a channel that one of the learner boards does not have;
- the program of the lesson uses an input or output that no part is wired to, or a part is wired to a
  channel that the program does not use. An address that a board has no channel for passes only when
  the project declares it in `io.virtual`.

## Wiring diagrams

The wiring of a lesson on a board is drawn from `wiring.json` and the board I/O description: a strip of
the board's header with the pins the lesson uses (GPIO, header position and channel id), each part as its
schematic symbol, and the GND rail. Every part and pin carries a text label, so colour is never the only
cue, and a text list of the same wiring (part by part, pin by pin) goes beside each diagram for a screen
reader. The same inputs always give the same diagram.
