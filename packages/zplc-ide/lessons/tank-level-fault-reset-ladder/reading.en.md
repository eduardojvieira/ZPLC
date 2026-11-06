## What this is for

A machine that has a fault should not forget it. Think of an oven that overheats and shuts off its heater. If the oven cools down for a minute and the heater turns itself on again, the operator never learns that something went wrong, and the cause is still there. A better machine remembers the fault, shows an alarm, and waits for a person to look at it and press a **reset** button.

This page explains how to make a program remember a fault, why the reset must be a deliberate act, and why the order of the rungs matters. The practice then applies it to a tank pump.

## The idea: a fault that stays

A sensor reading is **momentary**: it is true only while the condition lasts. A fault you want to keep needs a bit of **memory**, called a **latch**. A latch is a bit that is turned on by the fault and stays on after the fault is gone.

Ladder has two coils made for this.

- A **set** coil turns its bit on when power reaches it, and leaves it on, even after the power is gone.
- A **reset** coil turns its bit off when power reaches it, and leaves it off.

So the pattern has two rungs: one sets the latch when the fault appears, and one resets it when a person asks for it.

```ld-figure
src: reading/oven-latch.ld.json
caption: An overheat latch. Rung 1 sets it, rung 2 resets it, and rung 3 shows it on a lamp.
```

## Resetting only when it is safe

Look at rung 2. It resets `Locked` only when three things are true: the latch is on, the overheat is gone, and the reset button is pressed. The middle condition is the important one. Without it, a reset that is pressed while the overheat is still present would clear the latch, and the alarm would hide a fault that is still happening.

A good rule: **a reset must never clear a fault that is still happening**, and a reset must be an **action** by a person, not a state. The practice uses the same idea for a pump.

## Try it

Switch `Overheat` on. The alarm turns on. Switch `Overheat` off again: the alarm stays on, because the latch remembers. Now press `Reset`. The alarm goes off. Then try pressing `Reset` while `Overheat` is still on, and see that the latch does not clear.

```ld-try
src: reading/oven-latch.ld.json
inputs:
  - { name: Overheat, kind: switch }
  - { name: Reset, kind: push }
outputs: [Alarm]
timing: [Overheat, Alarm, Reset]
caption: Switch Overheat on and off, then press Reset. Try Reset while Overheat is on.
```

## What happens over time

```timing
span: 6000
signals:
  - { name: Overheat, edges: [1000, 2000] }
  - { name: Alarm, edges: [1000, 3000] }
  - { name: Reset, edges: [3000, 3500] }
marks:
  - { from: 2000, to: 3000, label: Latch }
caption: The overheat lasts one second. The alarm lasts until Reset.
```

Between the moment the overheat disappears and the moment `Reset` is pressed, the alarm is on although the input is off. That interval is the whole point of the latch: it is the time in which a person can notice.

## The order of the rungs matters

A PLC solves the rungs from top to bottom, one scan at a time, and a variable keeps the value that the last rung gave it. So when two rungs write the same bit, **the lower one wins**.

Imagine that rung 1 sets `Locked` when the fault is present, and rung 2 resets it when reset is pressed. If both conditions are true in the same scan, the later rung, the reset, wins, and the fault is cleared although it is still there. That is why the reset rung needs the "fault is gone" condition. It is also why you should place the rungs in a sensible order: set rungs first, reset rungs after them, and the outputs that read the latch at the end.

The same applies to outputs. A rung that drives an alarm lamp from the latch should come **after** the rungs that change the latch. If it came before, the lamp would show the latch of the previous scan, one scan late.

## Common mistakes

> [!WARNING]
> A latched alarm on the screen does not make a machine safe. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim. The latch is a convenience for the operator.

- Using a plain coil for a fault. The coil follows the input, so the fault disappears with the input.
- Letting the reset clear the fault while the cause is still present.
- Letting a held reset button clear a new fault at once. A good reset needs a fresh press after the fault has gone, which means the button must be released and pressed again.
- Putting an output rung before the latch rungs, so that it shows old values.

## Check yourself

```quiz
question: Overheat is still on and the operator presses Reset. The reset rung does not check Overheat. What happens in the same scan?
options:
  - { text: 'The latch is cleared although the fault is still there, so the alarm hides a real fault.', correct: true, feedback: Right. A reset must not act on a fault that is still happening. }
  - { text: 'Nothing, because a set coil always beats a reset coil.', feedback: Not in a PLC. The rung solved last decides. }
```

```quiz
question: Two rungs write the same bit in the same scan. Which value does the bit have at the end?
options:
  - { text: 'The value written by the rung lower in the program.', correct: true, feedback: Right. Rungs are solved from top to bottom, so the last one wins. }
  - { text: 'The value written by the rung higher in the program.', feedback: The higher rung runs first and is overwritten. }
  - { text: 'Random.', feedback: A scan is deterministic. The order of the rungs decides. }
```

## What you will do in the practice

In the practice you get a tank pump that follows a level plant. The pump rung and the alarm rung are written. You will add the rungs that set a fault latch from the emergency input or the pump fault, arm the reset only after the button has been released, and clear the latch with a fresh press, so that the alarm stays on after the fault input goes away. Pay attention to the order of the rungs.
