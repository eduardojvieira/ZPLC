## What this is for

Picture the light in the stairwell of an apartment building. You press a button at the bottom, and the light comes on. You walk up, and the light stays on for a while after you let go, long enough to reach the top. Then it goes off by itself. Nobody pressed "off". Something inside counted time.

Machines need that kind of counting all the time. A conveyor motor must keep running for a few seconds after the last box so that the belt empties. A buzzer must not sound the instant a door opens, only if it stays open. A sensor that flickers must be ignored unless it stays on long enough to be real. In a PLC, a **timer** does the counting.

## The idea

A timer is a block you place in a rung. It has an input called **IN**, a **preset time** called **PT** (the time it counts, such as `T#3s`, three seconds), and an output called **Q**. Inside it keeps a running clock. The PLC updates the clock on every scan, so the timer needs no wiring other than IN, PT and Q.

There are two timers you will use constantly. They are mirror images.

- **TON**, the **on-delay timer**. When IN turns on, TON starts counting. Only after IN has stayed on for the whole PT does Q turn on. If IN turns off before PT is up, the count is lost and Q never rises. When IN turns off, Q turns off at once.
- **TOF**, the **off-delay timer**. When IN turns on, Q turns on at once. When IN turns off, TOF starts counting. Q stays on until PT is up, and then it turns off. If IN comes back before PT is up, the count restarts and Q never fell.

A simple way to remember it: TON delays the **rise** of a signal, and TOF delays the **fall**.

## The stairway light is a TOF

The stairway light stays on after you release the button, so it is an off-delay: a **TOF**. The button feeds IN, and Q feeds the lamp. The figure shows the rung, with the block in the middle: contact on the left, timer, then coil.

```ld-figure
src: reading/stair-light.ld.json
caption: Button feeds IN of the TOF; its Q drives Lamp
```

Press and release the button in the lab. The lamp turns on at once, then stays on for the preset after you release.

```ld-try
src: reading/stair-light.ld.json
inputs:
  - { name: Button, kind: push }
outputs: [Lamp]
timing: [Button, Lamp]
caption: Press the button and release it; the lamp keeps going for T#3s
```

## What happens over time

The timing diagram of a TOF shows what the lab just did. The button is on from the first mark to the second. The lamp rises with the button and falls a full PT after the button falls.

```timing
span: 6000
signals:
  - { name: Button, edges: [500, 1500] }
  - { name: Lamp, edges: [500, 4500] }
marks:
  - { from: 1500, to: 4500, label: PT }
caption: TOF keeps Q on for PT after IN falls
```

## The door buzzer is a TON

Now the opposite need. A cold-store door may be opened briefly to take a box, and that is fine. But a door left open wastes cold air, so a buzzer should sound only if the door stays open. That is an on-delay: a **TON**. Switch the door open in the lab and wait. Then try closing it before the time is up.

```ld-try
src: reading/door-buzzer.ld.json
inputs:
  - { name: DoorOpen, kind: switch }
outputs: [Buzzer]
timing: [DoorOpen, Buzzer]
caption: Open the door and wait for T#2s; close it earlier and the buzzer never sounds
```

```timing
span: 6000
signals:
  - { name: DoorOpen, edges: [500, 4000] }
  - { name: Buzzer, edges: [2500, 4000] }
marks:
  - { from: 500, to: 2500, label: PT }
caption: TON turns Q on only after IN has stayed on for PT
```

Compare the two diagrams. In both, the delay is exactly PT. In the TOF it is added after the fall of the input; in the TON, after the rise.

## Writing the time

A preset is a value of type TIME. It starts with `T#` and has a number and a unit: `T#300ms` for three hundred milliseconds, `T#3s` for three seconds, `T#2m` for two minutes. A timer's clock moves by whole scans, so a very short preset is only as exact as the scan time.

## Common mistakes

> [!WARNING]
> A timer delays a signal in software. It does not make a machine safe. Do not use a timer to hold a dangerous machine running after a stop is requested. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim about any lesson.

- Mixing the two up. If the lamp must stay on after the button, you need a TOF. If the buzzer must wait, you need a TON.
- Setting a preset in the wrong unit and getting a delay that is a thousand times too long or too short.
- Expecting a TON to remember a short pulse. If IN falls before PT, the count is lost.
- Sharing one timer between two rungs. Each timer block is declared once, with its own name, and is placed once.

## Check yourself

```quiz
question: A sensor flickers on for a very short moment, again and again, from electrical noise. You want to ignore anything shorter than half a second. Which timer do you place after the sensor?
options:
  - { text: 'A TON with a preset of T#500ms', correct: true, feedback: Right. A TON raises Q only after IN stays on for the whole preset, so short pulses never get through. }
  - { text: 'A TOF with a preset of T#500ms', feedback: A TOF would pass every flicker through and then stretch each one by half a second. }
  - { text: 'No timer, a plain contact is enough', feedback: A plain contact copies every flicker. }
```

## What you will do in the practice

In the practice there are two rungs with a contact wired straight to a coil. You will place a TOF of `T#300ms` in the first, so `Light` stays on after `Button` is released, and a TON of `T#200ms` in the second, so `Confirmed` ignores the short sensor pulse that ends at {{t:140}} ms. The test presses the button at {{t:100}} ms and checks that the light is still on at {{t:450}} ms.
