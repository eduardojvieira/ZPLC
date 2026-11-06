## What this is for

Think of the call button beside a hospital bed. A patient presses it for half a second, and a light stays on above the door until a nurse comes and cancels it. The light must remember the call even though the button was released long ago. The same need appears in machines: an alarm that must stay visible after a fault disappears, a gate that stays open after the command pulse, a batch flag that stays set until the operator clears it.

A plain coil cannot do this. A plain coil shows the power that reaches it right now, scan after scan, and forgets it at once. This page introduces the two coils that remember: **SET** and **RESET**.

## The idea

A **SET coil**, also called a latch coil, turns its variable on when power reaches it, and then leaves it on, even after the power is gone. A **RESET coil**, also called an unlatch coil, turns the same variable off when power reaches it, and leaves it off.

- Power reaches a SET coil: the variable becomes `TRUE` and stays `TRUE`.
- Power reaches a RESET coil: the variable becomes `FALSE` and stays `FALSE`.
- No power reaches either coil: the variable keeps whatever it had.

So a variable that holds a state is built from two rungs: one rung that sets it and one rung that resets it. Think of a light switch with two separate buttons, one "on" and one "off", and a lamp that remembers the last button pressed.

Recall that the program runs in scans: read inputs, solve the rungs from top to bottom, write outputs, repeat. A variable that a SET coil has turned on simply stays on in the memory of the PLC from one scan to the next.

In industry the same pair of coils holds a motor running state on a conveyor, remembers that a bottle jam happened, or keeps a tank-filling cycle in progress. The pattern is always the same: one event starts the memory, and a different event ends it. Because the memory is a plain variable, other rungs can read it with an ordinary contact, as they would read a button.

## How it looks in Ladder

In ZPLC, a SET coil is drawn with an S inside the parentheses and a RESET coil with an R. The figure shows the call light: the first rung sets the lamp when the call button is pressed, and the second resets it when the cancel button is pressed.

```ld-figure
src: reading/call-light.ld.json
caption: One rung sets CallLamp, another rung resets it
```

ZPLC accepts exactly one SET and one RESET for a variable, each in its own rung. Two rungs that both write the variable in other ways are refused as multiple writers.

## Try it

Press the call button and release it. The lamp stays on. Then press the cancel button.

```ld-try
src: reading/call-light.ld.json
inputs:
  - { name: CallButton, kind: push }
  - { name: CancelButton, kind: push }
outputs: [CallLamp]
timing: [CallButton, CancelButton, CallLamp]
caption: A short press of CallButton is enough; only CancelButton clears the lamp
```

## What happens over time

The diagram shows the call light over a few seconds. The call button is pressed briefly, but the lamp rises with it and falls only when the cancel button is pressed.

```timing
span: 1500
signals:
  - { name: CallButton, edges: [100, 300] }
  - { name: CancelButton, edges: [1000, 1200] }
  - { name: CallLamp, edges: [100, 1000] }
marks:
  - { from: 100, to: 1000, label: remembered }
caption: The lamp is remembered from the call until the cancel
```

## When both arrive together

What if the call and the cancel are pressed in the same scan? Both rungs have power. The rungs run from top to bottom, so the SET coil writes `TRUE` first and the RESET coil writes `FALSE` afterwards. The rung that comes **last** decides. If you put the RESET rung first, the SET rung wins instead.

This is the **priority** of the latch, and you choose it with the order of the rungs. An alarm that must not be lost usually gives priority to SET, so that a new fault is never cleared by an old acknowledge. A stop function usually gives priority to RESET. This is how the scan order of this runtime works. Other PLCs may order things differently, so check the manual of the PLC you use.

## Common mistakes

> [!WARNING]
> A latched output survives a stop of the program only if the PLC retains it. In ZPLC, source `RETAIN` is not supported, so a latch starts from its initial value after a restart. Never rely on a latch to keep a dangerous machine in a safe state. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim about any lesson.

- Using a SET coil and forgetting the RESET. The variable then stays on forever.
- Putting the SET and the RESET for the same variable in the wrong order and getting the opposite priority from the one you wanted.
- Using a plain coil and a SET coil on the same variable. Choose one way of writing it.
- Believing that a SET coil is a pulse. It is the opposite: it holds.

## Check yourself

```quiz
question: Rung 1 has a SET coil on Alarm driven by Fault. Rung 2 has a RESET coil on Alarm driven by Ack. Fault and Ack are both true in the same scan. What is Alarm after the scan?
options:
  - { text: 'FALSE, because the RESET rung comes last', correct: true, feedback: Right. Both coils act, and the one scanned last leaves its value. }
  - { text: 'TRUE, because a fault is more important', feedback: Importance does not decide it. The order of the rungs does. }
  - { text: 'It keeps its old value', feedback: Both coils have power, so the variable is written twice, and the last write remains. }
```

## What you will do in the practice

In the practice the alarm outputs are plain coils driven by `Fault`, so they go off as soon as the fault is gone, which is the wrong behavior. You will replace them with SET and RESET coils and place the rungs so that, when `Fault` and `Ack` arrive together at {{t:50}} ms, `SetFirst` stays on and `ResetFirst` goes off.
