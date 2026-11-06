---
title: Learner kits
sidebar_label: Learner kits
description: "The two learner boards of the course, the parts a learner needs, and how a lesson declares its hardware track and its wiring."
tags: [learn, hardware, boards]
---

# Learner kits

This page tells you which board and parts the course needs, what a hardware lesson must declare, and which safety limits every wiring page repeats. Read it before you buy parts or write a hardware lesson.

Every simulation lesson is graded on your computer. The 34 lessons on the **Hardware** track also have a wiring file for the learner boards, the Raspberry Pi Pico (RP2040) and the ESP32-S3-DevKitC-1, which use the same breadboard parts. Evidence level: host. The wiring checks below run in CI, but no hardware run of a lesson has been recorded on a board yet, so the hardware track is a plan backed by those checks, not by a board.

## The two kits

Each board has a kit page with the pin map generated from the board I/O description, the bill of materials, the prebuilt firmware file and where its SHA-256 is published, the flashing steps and the voltage limit. It also lists the hardware lessons that have a wiring page for that board.

- [Raspberry Pi Pico (RP2040)](./rpi-pico-rp2040.md)
- [ESP32-S3-DevKitC-1 (N8R8)](./esp32-s3-devkitc.md)

## One bill of materials

The course has a single bill of materials, the same for both boards (`packages/zplc-ide/lessons/kit.json`):

- one board, and a USB data cable that fits its connector;
- a breadboard of 830 points;
- six 5 mm LEDs (red, green and yellow) with six 330 Ω resistors, one in series with each;
- four 6×6 mm push buttons;
- two 10 kΩ resistors and a 10 kΩ linear potentiometer;
- a 100 nF capacitor;
- twenty male-to-male jumper wires.

The parts are reused from lesson to lesson. The lesson CI checks, for each board, that the kit covers everything a hardware lesson needs at the same time.

## What a hardware lesson declares

A lesson lists the track in its `lesson.json` and adds a `hardware` block:

```json
"tracks": ["simulation", "hardware"],
"hardware": {
  "wiring": "wiring.json",
  "tolerances": { "timeMs": 200, "analogPercent": 5 }
}
```

- `timeMs` is how far, in either direction, a sample of a trace recorded from the board may sit from the scenario time that an assertion names. It cannot be less than one scan of the program plus the jitter margin of a device trace.
- `analogPercent` is how far an analog value may deviate, as a percentage of its full scale.
- A lesson without the hardware track keeps `unsupported.hardware`, with a reason and an "instead" in English and Spanish.
- A lesson that only runs on a board, such as "verify my board", lists `"tracks": ["hardware"]` and says in `unsupported.simulation` why it has no simulation grade.

## The wiring file

`wiring.json` lists the parts on the breadboard and the board channel each one connects to. It names channel ids (`DO0`, `DI1`, `AI0`), never GPIO numbers. The pins come from the board I/O description, `firmware/app/boards/boards.json`, so a pin that moves in the firmware moves in every diagram.

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

A `boards` list on a part limits it to some learner boards; without it the part is wired on both. A channel the board carries itself, such as the on-board LED of the Pico, needs no wiring. Every input of both boards is a part on a header pin: the BOOT button of the ESP32-S3 is a strapping pin and is never one of them.

The lesson CI refuses a hardware lesson when:

- the lesson lists the hardware track and has no `hardware` block or no `wiring.json`;
- a part names a channel that one of the learner boards does not have, or a channel of the wrong direction;
- the program uses an input or output that no part is wired to, or a part is wired to a channel the program does not use. An address with no channel on a board passes only when the project declares it in `io.virtual`.

## Safe parts only

Every hardware lesson uses logic-level signals and low-voltage parts, and the course has no mains wiring. The lesson CI enforces it:

- A part is an LED, a resistor, a button, a potentiometer, a capacitor or a jumper wire, and nothing else. No relay, motor or buzzer is ever driven from a pin.
- Every LED on a header pin is red, green or yellow, with a series resistor of at least 330 Ω.
- No label names a voltage above 3.3 V, and none names mains.

Every wiring page repeats the voltage limit of the kit:

- The I/O pins work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin, and join the grounds.
- Keep each output under 10 mA (one LED with 330 Ω draws about 4 mA). On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before plugging it in.

## Wiring diagrams

The diagram of a lesson on a board is drawn from `wiring.json` and the board I/O description. It shows a strip of the board header with the pins the lesson uses (GPIO, header position and channel id), each part as its schematic symbol, and the GND rail. Every part and pin has a text label, so colour is never the only cue, and a text list of the same wiring (part by part, pin by pin) sits beside each diagram for a screen reader. The same inputs always give the same diagram.
