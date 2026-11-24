## The machine

This is the first machine of the course, and the smallest station of a packing line: a box is put on a belt, the belt carries it to the far end, and a sensor there tells the program that the box has arrived. Real lines are long chains of stations like this one, and each of them starts and stops a belt from what its sensors see.

![The belt-to-sensor scene seen from the front. A belt conveyor on legs runs from left to right. On the left, four cyan corner marks show where the emitter puts a box on the belt, and behind the belt stands the start button on a pedestal. At the far right end a sensor on a post looks across the belt. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has four parts. The table says what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part                              | What it is in a real plant                                                                                    | Signal                | PLC variable | Direction  | Type | Meaning                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------- | ------------ | ---------- | ---- | ------------------------------------------------- |
| `Belt1` (Belt conveyor)           | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              | `Belt1.run`           | `Run`        | PLC output | BOOL | TRUE runs the belt forward.                       |
| `Emitter1` (Item emitter)         | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. | `Emitter1.emit`       | `Emit`       | PLC output | BOOL | Each rising edge releases one item onto the line. |
| `EyeFar` (Diffuse optical sensor) | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             | `EyeFar.detect`       | `EyeFar`     | PLC input  | BOOL | TRUE while an object is in the beam.              |
| `StartButton` (Push button)       | A button on the operator panel that is pressed only while a finger holds it.                                  | `StartButton.pressed` | `Start`      | PLC input  | BOOL | TRUE while the button is held down.               |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only the four variables: it never sees the box itself, only what the sensor says about it.

## A press is short, the job is long

A push button is TRUE only while a finger holds it, for a fraction of a second. The belt, though, must keep running for several seconds, until the box reaches the sensor. If Run simply copied Start, the belt would move only while the button is held and stop with the box in the middle.

So the program needs a **memory**: a BOOL variable of its own, not wired to any part, that remembers "the belt should be running". One condition sets it, another clears it, and the output follows it.

```timing
span: 6000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: Memory, edges: [200, 4800] }
  - { name: EyeFar, edges: [4800, 6000] }
  - { name: Run, edges: [200, 4800] }
caption: A short press sets the memory, the sensor clears it, and the belt follows the memory
```

The sensor stays TRUE while the box stands in front of it, so it keeps the memory cleared. That is what you want: the box waits at the end of the belt until someone takes it away.

When the set and the clear are both TRUE in the same scan, the statement written last wins, because the statements run from top to bottom. Decide which one should win: here a stop from the sensor matters more than a start.

## Worked example

A roller shutter over a loading door has an Open button and a top limit switch. A short press must open the shutter all the way: the motor runs until the limit switch says the shutter is up. This is the same problem as the belt, solved here with a seal-in, the form you met in Ladder diagram and in the motor lesson:

```st
PROGRAM Shutter
VAR_INPUT OpenButton : BOOL; TopLimit : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; END_VAR
VAR Opening : BOOL; END_VAR
Opening := (OpenButton OR Opening) AND NOT TopLimit;
Motor := Opening;
END_PROGRAM
```

Read the assignment from the right. `OpenButton OR Opening` stays TRUE after the button is released, because Opening holds itself. `AND NOT TopLimit` breaks the hold as soon as the limit switch closes, and it also wins when both are TRUE. Two IF statements, one that sets Opening and one after it that clears it, do the same thing in a form many programmers find easier to read.

## Common mistakes

- Driving the belt straight from the button. The belt moves only while the button is held, and the box stops halfway.
- Setting the memory and never clearing it. The belt carries the box past the sensor and off the end of the belt.
- Clearing before setting, so that a held button restarts the belt while the box is still in front of the sensor.
- Forgetting to declare the memory. Every variable the program uses is declared, and a memory of the program goes in `VAR`.

> [!NOTE]
> The sensor sees the box only while the box is in its beam. A box that moves fast past a sensor can be in the beam for a short time, and a program that reads it too late misses it. Here the belt stops the box in the beam, so the signal stays TRUE.

## Check yourself

```quiz
question: Why does the belt need a memory variable when Start is wired straight to the program?
options:
  - { text: 'Because Start is TRUE only while the button is held, and the belt must keep running after that', correct: true, feedback: 'Yes. The memory remembers the press after the finger is gone.' }
  - { text: 'Because an output cannot be written from an input', feedback: 'An output can copy an input. The belt would then stop as soon as the button is released.' }
  - { text: 'Because the sensor needs a memory to see the box', feedback: 'The sensor is TRUE while the box is in its beam; it needs nothing from the program.' }
```

```quiz
question: In the same scan Start and EyeFar are both TRUE. The program sets the memory first and clears it in the next statement. What is the memory at the end of the scan?
options:
  - { text: 'FALSE', correct: true, feedback: 'Right. The statements run from top to bottom, so the clear, written last, wins.' }
  - { text: 'TRUE', feedback: 'The set ran first, but the clear ran after it in the same scan.' }
  - { text: 'It changes on every scan', feedback: 'Both conditions give the same result on every scan: the clear always comes last.' }
```

## What you will do in the practice

The starting program declares the inputs Start and EyeFar and the outputs Run and Emit, and drives nothing. You will write the program of the station: a press of the start button, which the scenario gives at {{t:200}} ms, puts one box on the belt and runs it, and the belt stops when EyeFar sees the box. Then press {{ui:learn.check}}.
