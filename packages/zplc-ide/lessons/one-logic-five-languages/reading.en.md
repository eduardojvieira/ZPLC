## You can read a PLC program now

If you followed the Ladder path, you started knowing nothing about PLCs. You now know what a scan cycle is, how contacts and coils make a rung, how a seal-in holds a motor on, how timers and counters work, and how to find a bug with the Watch table. That is the core of the job.

This last lesson is an epilogue. It shows that the logic you learned is not tied to one drawing style. The IEC 61131-3 standard defines **five** programming languages for PLCs, and Ladder (LD) is one of them. A PLC maker may let you mix them in one project. A job may ask you for any of them, so it helps to recognize all five.

## One logic, drawn two ways

Here is a beacon that stays on after a short press and goes off when an Off button is pressed. In Ladder it is a seal-in: `TurnOn` in parallel with the beacon's own contact, then a normally closed contact of `Off`.

```ld-figure
src: reading/beacon.ld.json
caption: "The beacon holds itself on, and Off breaks the rung"
```

```ld-try
src: reading/beacon.ld.json
inputs:
  - { name: TurnOn, kind: push }
  - { name: Off, kind: push }
outputs: [Beacon]
caption: "Press TurnOn and release it, then press Off"
```

The same logic in **Structured Text** (ST) is one line that reads like a formula:

```st
Beacon := (TurnOn OR Beacon) AND NOT Off;
```

And in **Instruction List** (IL) it is a short list of steps, each acting on a "current result":

```il
LD TurnOn
OR Beacon
ANDN Off
ST Beacon
```

Read both and compare them with the rung. The condition is always the same: the beacon is on when a turn-on is pressed or the beacon is already on, and never while Off is pressed.

## The five languages

| Language                        | Looks like                | Best for                                        |
| ------------------------------- | ------------------------- | ----------------------------------------------- |
| Ladder (LD)                     | Relay wiring on two rails | Discrete logic that electricians must read      |
| Structured Text (ST)            | Lines of code             | Math, loops, data and long conditions           |
| Function Block Diagram (FBD)    | Boxes joined by wires     | Signal flow, analog control and reusable blocks |
| Sequential Function Chart (SFC) | Steps and transitions     | Machines that go through ordered stages         |
| Instruction List (IL)           | Short assembly-like lines | Small tasks and low-level thinking              |

### Structured Text

ST is a text language, close to Pascal. Use it when a rung would need a dozen contacts, or when you calculate: scaling an analog value, sorting data, or looping over an array. It is the language most programmers feel at home in.

### Function Block Diagram

FBD draws blocks (AND, OR, a timer, a PID controller) and connects them with lines. Use it when you think in terms of signals flowing through blocks, which is common in process control.

### Sequential Function Chart

SFC draws a machine as **steps** connected by **transitions**. Each step has actions, and a transition says when to move to the next step. Use it for a sequence such as fill, mix and empty, where the machine is always in exactly one stage. The step-bits lesson of the Ladder path was a way to imitate it by hand.

### Instruction List

IL is the simplest text language. It is rarely chosen for new projects, but you meet it in old programs and in small devices, so being able to read it is useful.

## When to use each

You do not need to choose one forever. A practical rule is to use Ladder for the rungs that electricians will read at the machine, ST for calculations, SFC for the order of the stages, and FBD for analog and control blocks. In ZPLC all five run on the same runtime and are graded by the same kind of scenario, as the practice of this lesson shows.

> [!NOTE]
> The language is a way to write the logic, not a different logic. If you can say what the machine must do, you can write it in any of the five.

## Check yourself

```quiz
question: "Which language is the best fit for a machine that goes through the stages fill, mix and empty, in that order?"
options:
  - { text: "Sequential Function Chart", correct: true, feedback: "Steps and transitions describe ordered stages directly." }
  - { text: "Instruction List", feedback: "It can do it, but it does not show the stages." }
  - { text: "Ladder only, with no step memory", feedback: "Ladder can do it with step bits, but a chart shows the stages for you." }
```

## Where to continue in the ZPLC course

The full course is below the Ladder path on the Learn home. These lessons are good next steps:

- "Write a blinker in Structured Text", to start writing in text.
- "Function Block Diagram: a two-hand control with a guard", to see the guard in boxes.
- "A sequence in Sequential Function Chart: fill, then mix", for ordered stages.
- "Instruction List: the current result in a two-hand control", to read IL.
- "Modbus TCP: write a register and read it back" and "MQTT: publish a message and receive it", to connect a PLC to other systems.

## What you will do in the practice

In the practice the gate logic is already written as a condition in Structured Text with a bug. You fix it so that the gate holds itself open and closes on command, then compare the same logic in the other four languages. One scenario grades all five.
