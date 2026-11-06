## What this is for

Some actions must never happen together, and some must never happen unless a condition is true. A door of an industrial oven must be closed before the heater turns on. A conveyor must not start while a guard is open. A motor must not turn forward and backward at the same moment.

A rule like this, built into the program so that one thing blocks another, is called an **interlock**. This page explains interlocks and **permissives** from zero, using a motor with a lid, and then connects them to the reversing motor of the practice.

## Two kinds of "not now"

There are two common rules, and it helps to name them.

- A **permissive** is a condition that must be true for something to be allowed. "The lid must be closed to run the mixer." If the permissive is missing, the output cannot be on. If it disappears while the output is on, the output goes off.
- A **mutual lock** is a rule between two outputs: when one is on, the other is not allowed. "The forward contactor and the reverse contactor are never on together."

Both are done in Ladder with the same tool: a contact placed **in series** with the output. Contacts in series work like a chain of doors, and power passes only if every door is open. So every extra condition you add in series is one more thing that can block the output.

## Why a reversing motor needs it

A three-phase motor turns the other way when two of its three wires swap places. A **reversing starter** has two **contactors**, which are heavy relays that switch the motor power: the forward contactor connects the wires one way and the reverse contactor connects them the other way.

If both contactors close at once, the two swapped connections meet and make a short circuit between phases. The result can be a blown fuse, a damaged contactor or worse. So the program must make it impossible for both outputs to be on, even if the operator presses both buttons together. That is a mutual lock.

## How it looks in Ladder

Here is a mixer with a lid. The motor holds itself on once started. It needs two things in series to run: the lid closed, and the stop button not pressed.

```ld-figure
src: reading/mixer-lid.ld.json
caption: A seal-in rung with two series conditions. The lid is a permissive, and the stop button is a normally closed contact in the rung.
```

Read the rung from left to right. Power starts at the left rail. It can pass through `StartButton`, or through the contact of `Motor` itself in the lower branch, which is the seal-in that keeps the motor on. Then it must pass `LidClosed` and the stop button before it reaches the coil.

In this lab, `StopButton` is `TRUE` while the button is pressed, so the rung uses a **normally closed** (NC) contact on it. That contact conducts while its bit is off, that is, while nobody presses the button. Pressing the button opens the contact and cuts the power.

## Try it

Close the lid with its switch, then press and release the start button. The motor keeps running. Now open the lid. The motor stops, and it stays stopped even if you close the lid again, until you press start again.

```ld-try
src: reading/mixer-lid.ld.json
inputs:
  - { name: StartButton, kind: push }
  - { name: StopButton, kind: push }
  - { name: LidClosed, kind: switch }
outputs: [Motor]
timing: [StartButton, LidClosed, Motor]
caption: Press LidClosed to close the lid, then press StartButton. Press LidClosed again to open it.
```

Also try pressing the start button while the lid is open. Nothing happens, because the permissive is missing.

## What happens over time

The timing below shows the motor holding itself on after the start button is released, and dropping out when the lid opens.

```timing
span: 6000
signals:
  - { name: LidClosed, edges: [200, 3000] }
  - { name: StartButton, edges: [500, 1000] }
  - { name: Motor, edges: [500, 3000] }
marks:
  - { from: 500, to: 3000, label: Motor }
caption: The motor starts on StartButton, holds itself on, and drops out when the lid opens.
```

## Why a real stop button is wired normally closed

In a real panel the stop button is a switch that is closed at rest. Its PLC input reads `TRUE` while nobody presses it, and a rung that stops on it uses a normally open contact on that input. The reason is what happens when a wire breaks. If a wire to a normally open stop button breaks, the button can never be read as pressed, and nobody notices that the motor can no longer be stopped. If a wire to a normally closed stop button breaks, the program reads it as pressed, and the motor stops. The failure makes the machine safe. This is called **fail-safe** wiring.

## Common mistakes

> [!WARNING]
> An interlock in the program is not a safety device. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim. A real reversing starter also has a mechanical or electrical lock on the contactors themselves.

- Putting the lock only on one of two outputs. Each output must see the other one.
- Using a normally open contact where a normally closed one is needed, or the other way round. Check which state allows the output.
- Forgetting that a seal-in keeps an output on. A permissive must be in series with the whole rung, including the seal-in, or the output will stay on after the permissive is gone.

## Check yourself

```quiz
question: A permissive contact is placed in the seal-in branch only, not in series with the whole rung. The motor is running and the permissive is lost. What happens?
options:
  - { text: 'The motor keeps running.', correct: true, feedback: Right. The rest of the rung still conducts, so the lost permissive blocks nothing. }
  - { text: 'The motor stops at once.', feedback: Only if the permissive is in series with the whole path to the coil. }
```

```quiz
question: Why must the program stop both contactors from closing together?
options:
  - { text: 'Together they would short-circuit two phases of the motor supply.', correct: true, feedback: Right. Each contactor connects the wires in a different order. }
  - { text: 'Together they would drain the PLC battery.', feedback: Contactors are driven by the outputs, not by a battery. }
```

## What you will do in the practice

In the practice you get a reversing motor with a forward rung and a reverse rung, each with a seal-in, a stop button and a lubrication permissive. The two directions do not yet know about each other. You will add the mutual lock to each rung and check that the two contactors are never on together, and that losing the lubrication permissive drops either direction.
