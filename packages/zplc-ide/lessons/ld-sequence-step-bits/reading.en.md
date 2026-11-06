## What this is for

Many machines do not do everything at once. They do one thing, then the next, then the next. A car wash soaps the car, then rinses it, then dries it. A washing machine fills, washes, drains and spins. A bottling line fills, caps and labels. Each of these is a **sequence**: a list of **steps** that happen one after another, in a fixed order.

A PLC is very good at sequences, and the usual way to write one is called **step bits**. This page explains them from zero. At the end you will extend a sequence for a tank that fills, mixes and drains.

## The idea: one bit per step

A **bit** is a variable that is either on (`TRUE`) or off (`FALSE`). A **step bit** is a bit that means "the machine is in this step right now".

Think of a board game with one token. The token sits on exactly one square. To move, you pick the token up and put it on the next square. The step bits are the squares, and the token is whichever bit is on. The most important rule of a sequence follows from this picture:

> [!NOTE]
> **Exactly one step bit is on at a time.** If two are on, the machine is in two places at once, and something is wrong.

Each step does a job by driving outputs. In a car wash, the soap step turns on the soap sprayer. The output is simply a copy of the step bit, so when the step ends, the sprayer stops by itself.

## How a step ends: the transition

The move from one step to the next is called a **transition**. A transition has a **condition**: something that must be true for the move to happen. The condition is often a timer finishing (the soap has run for long enough), a sensor (the tank is full) or a button.

In Ladder, a transition is written as two small rungs with the same condition:

1. one rung **sets** the next step bit;
2. one rung **resets** the current step bit.

A **set** coil turns its bit on and leaves it on, even after the power that reached it disappears. A **reset** coil turns it off and leaves it off. Because both rungs use the same condition, both actions happen in the same scan, so the token is picked up and put down at the same instant.

```ld-figure
src: reading/car-wash.ld.json
rung: 2
caption: Soap to rinse, part 1. When the soap step is active and its timer is done, set the rinse step.
```

```ld-figure
src: reading/car-wash.ld.json
rung: 3
caption: Soap to rinse, part 2. The same condition resets the soap step.
```

If you forget the second rung, the soap step never ends. The sprayer would keep running while the rinse starts, and two step bits would be on together.

## The timer inside a step

How does a step know that its time is over? With a timer. A **TON** (on-delay timer) turns its output `Q` on after its input has been on for the time `PT`, the **preset**. Here the input of each timer is the step bit itself. While the soap step is active, `SoapTimer` runs. When the step ends, the timer is cut off and starts again from zero next time.

That is why a step bit is so convenient: it starts the timer, drives the output and is reset by the transition, all with the same name.

## Starting the sequence

Something has to put the token on the first square. A start rung does it: when `Go` is pressed **and no step is active**, set the first step bit. The "no step is active" part, written with normally closed contacts, is what stops a second press from starting a second sequence in the middle of the first. A normally closed contact conducts while its bit is off.

## Try it

Press and release `Go`. Watch the soap sprayer for two seconds, then the rinse sprayer for two seconds. Press `Go` again in the middle of the soap step and see that nothing changes.

```ld-try
src: reading/car-wash.ld.json
inputs:
  - { name: Go, kind: push }
outputs: [Soap, Rinse]
timing: [Go, Soap, Rinse]
caption: Press Go once, then press it again while the soap sprayer is on.
```

## What happens over time

Each timer has a preset of `T#2s`. When you press `Go`, the soap step starts and runs for `T#2s`. In the same scan in which the soap time ends, the rinse step turns on and the soap step turns off. There is no gap and no overlap.

```timing
span: 6000
signals:
  - { name: Go, edges: [500, 1000] }
  - { name: Soap, edges: [500, 2500] }
  - { name: Rinse, edges: [2500, 4500] }
marks:
  - { from: 500, to: 2500, label: SoapTimer }
  - { from: 2500, to: 4500, label: RinseTimer }
caption: Soap and rinse follow each other. Go can be released at once, because the step bit holds the sequence.
```

Notice that `Go` is released long before the soap step ends. The step bit remembers that the sequence is running, so the button does not need to be held.

## Common mistakes

> [!WARNING]
> Two step bits on at once is the classic sequence bug. It usually comes from a transition that sets the next step but forgets to reset the current one, or from a rung that sets a step from a condition that stays true for several scans.

- Writing the transition condition without the step bit. Then the condition can fire at any time, not only when the machine is in that step.
- Driving an output directly from a timer instead of from the step bit. The output then has its own life and can disagree with the step.
- Putting the output rungs before the transition rungs. The outputs then show the steps of the previous scan. Put them after.

> [!WARNING]
> A sequence is not a safety function. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim. A real machine also needs a way to stop and reset the sequence safely.

## Check yourself

```quiz
question: The soap step is active and its timer has just finished. A transition has a set rung for the rinse step but no reset rung for the soap step. What happens?
options:
  - { text: 'Both steps stay on together.', correct: true, feedback: Right. Nothing turns the soap bit off, so the token is on two squares. }
  - { text: 'The rinse step never starts.', feedback: It does start, because its set rung works. The problem is that the soap step does not end. }
  - { text: 'The program refuses to run.', feedback: The program is valid. This is a logic error, so it runs and misbehaves. }
```

```quiz
question: Why is Go released early without stopping the sequence?
options:
  - { text: 'The step bit remembers that the sequence is running.', correct: true, feedback: Right. A set coil keeps its bit on after the power that set it is gone. }
  - { text: 'The timer holds the button down.', feedback: A timer does not act on inputs. It only times its own input. }
```

## What you will do in the practice

In the practice you get a tank with three steps: fill, mix and drain, each with its own step bit and timer. The transition from fill to mix is written, and the transition from mix to drain is missing. You will add the two rungs of that transition, one that sets `StepDrain` and one that resets `StepMix`, and then check that the three outputs never overlap.
