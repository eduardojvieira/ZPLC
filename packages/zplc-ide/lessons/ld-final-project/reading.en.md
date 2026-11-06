## From a description to a program

On a real project, nobody hands you a Ladder program. They hand you a few paragraphs: what the machine does, when it must stop, what a person can press. This is the **functional description**. Your job is to turn it into a program that you can test, and to be able to say which sentence of the description each rung comes from.

Think of a packing station in a plant. A belt carries parts past a sensor. When a box has enough parts, the belt must stop so that someone can close the box. A packer can stop the belt, an emergency stop can stop it, and if a part blocks the sensor the belt must stop and report a fault. That is a small machine, but every real machine is built from the same kinds of sentences.

This lesson gives you no new instruction. It gives you a method to use the ones you already know: seal-in, normally closed stops, a counter, a timer and a latch.

## Step 1: read it and list the inputs and outputs

Read the description slowly, and underline every thing that can be sensed or pressed (an **input**) and every thing that the program switches (an **output**). Then write them in a table. This table is your map of the program.

Here is the table for a small box counter that counts parts and lights a lamp when the box is full.

| Name    | Kind   | Meaning                                |
| ------- | ------ | -------------------------------------- |
| Sensor  | Input  | TRUE while a part passes the sensor    |
| Reset   | Input  | TRUE while the reset button is pressed |
| BoxFull | Output | Lamp, TRUE once four parts are counted |

Note how the buttons are described. A stop button is usually wired **normally closed**: it conducts at rest, so a broken wire stops the machine instead of leaving it running. The program then reads TRUE at rest and FALSE while the button is pressed. Name such inputs so that you remember it, for example `StopOK`.

## Step 2: plan the steps

Before you draw a contact, write the behavior as short sentences with a cause and an effect. Each sentence becomes a rung, or part of one.

1. Each rising edge of `Sensor` counts one part.
2. When the count reaches four, `BoxFull` is ON.
3. `Reset` empties the count and turns `BoxFull` OFF.

Here is how the first two sentences look in Ladder. A **counter** (CTU) adds one each time its input goes from FALSE to TRUE, and its output turns ON when the count reaches the preset `PV`.

```ld-figure
src: reading/parts-counter.ld.json
caption: "A CTU counts the parts; BoxFull follows its output"
```

## Try it

Press Run, then press and release `Sensor` four times. Watch the lamp. Then press `Reset`.

```ld-try
src: reading/parts-counter.ld.json
inputs:
  - { name: Sensor, kind: push }
  - { name: Reset, kind: push }
outputs: [BoxFull]
caption: "Four presses fill the box; Reset empties it"
```

Notice that holding the button down counts only one part. The counter reacts to the edge, not to the level. That is the kind of detail a description often does not say, and a test must catch.

```timing
span: 4000
signals:
  - { name: Sensor, edges: [500, 800, 1100, 1400, 1700, 2000, 2300, 2600] }
  - { name: BoxFull, edges: [2300] }
caption: "BoxFull turns on at the fourth rising edge of Sensor"
```

## Step 3: plan the tests

A program is finished when you can show that it works, not when it looks right. Write the tests as a list, in the same order as the description, and add the cases that the description does not mention.

- What must happen: the belt starts, a box fills, the lamp lights.
- What must not happen: the belt must not restart by itself after a stop, and a fault must not clear while the sensor is still blocked.
- The order of events: reset before the batch is full, and a stop while the box is filling.

The scenario of the practice follows this idea. Most of its checks are about what must **not** happen, because a program that only does what is asked passes the easy case and still fails on the machine.

> [!WARNING]
> The emergency stop of a real machine is wired in hardware and cuts power to the dangerous parts without going through the PLC. The program may read it to know the machine stopped, but the program never provides the stop. ZPLC makes no safety claim, and a passing scenario is not a safety proof.

## Common mistakes

- Starting to draw before listing the inputs and outputs. You end up with a variable that two rungs write.
- Reading a normally closed stop as if it were TRUE when pressed. Check each input against the wiring.
- Testing only the happy path. Add at least one test per "must not".
- Changing three rungs at once after a failed assertion. Change one, check, and read the next failure.

## Check yourself

```quiz
question: "The stop button is wired normally closed. What does the program read while nobody presses it?"
options:
  - { text: "TRUE", correct: true, feedback: "The contact conducts at rest, so the input is on until someone presses the button." }
  - { text: "FALSE", feedback: "That would be a normally open button. Here a press makes the input FALSE." }
```

```quiz
question: "Which test belongs to what must NOT happen?"
options:
  - { text: "The belt stays off after an emergency stop until a new Start", correct: true, feedback: "It checks that the program does not restart by itself." }
  - { text: "The belt runs after Start", feedback: "That is what must happen." }
  - { text: "The lamp lights when the box is full", feedback: "That is also what must happen." }
```

## What you will do in the practice

You get a packing station with five inputs and three outputs, and a starter that only holds the belt in. Read the five requirements in the objective, list the inputs and outputs, then add a counter, a timer for a blocked sensor, a latched fault and the stop conditions. Press Check and use each failed assertion to find the requirement you missed. If you want to look inside, run the program in Simulation and use the Watch table as in the previous lesson.
