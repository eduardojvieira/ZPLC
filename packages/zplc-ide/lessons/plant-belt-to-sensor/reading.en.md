## The machine

This is the first machine of the course, and the smallest station of a packing line: a box is put on a belt, the belt carries it to the far end, and a sensor there tells the program that the box has arrived. Real lines are long chains of stations like this one, and each of them starts and stops a belt from what its sensors see.

![The belt-to-sensor scene seen from the front. A belt conveyor on legs runs from left to right. On the left, four cyan corner marks show where the emitter puts a box on the belt, and behind the belt stands the start button on a pedestal. At the far right end a sensor on a post looks across the belt. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has four parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EyeFar`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |

| Variable | Signal                | Direction & type  | Meaning                                           |
| -------- | --------------------- | ----------------- | ------------------------------------------------- |
| `Run`    | `Belt1.run`           | PLC output · BOOL | TRUE runs the belt forward.                       |
| `Emit`   | `Emitter1.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line. |
| `EyeFar` | `EyeFar.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `Start`  | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.               |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only the four variables: it never sees the box itself, only what the sensor says about it.

## A press is short, the job is long

A push button is TRUE only while a finger holds it, for a fraction of a second. The belt, though, must keep running for several seconds, until the box reaches the sensor. If Run simply copied Start, the belt would move only while the button is held and stop with the box in the middle.

So the program needs a **memory**: a BOOL variable of its own — `Running` — not wired to any part, that remembers "the belt should be running". One condition sets it, another clears it, and the output follows it.

```timing
span: 6000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: Running, edges: [200, 3260] }
  - { name: EyeFar, edges: [3260, 6000] }
  - { name: Run, edges: [200, 3260] }
caption: A short press sets the memory, the sensor clears it, and the belt follows the memory
```

The sensor stays TRUE while the box stands in front of it, so it keeps the memory cleared. That is what you want: the box waits at the end of the belt until someone takes it away.

When the set and the clear are both TRUE in the same scan, the statement written last wins, because the statements run from top to bottom. Which one should win is a decision of the machine, not of the language.

## Worked example

A scrap conveyor under a cutting machine carries offcuts to a bin. A short press of `ClearBelt` must run the belt until a light curtain at its end, `BeltEmpty`, says that nothing is left on it. But the operator also uses the button to jog the belt: while `ClearBelt` is held, the belt must run even when the curtain says empty. So here the start wins, and its IF comes last:

```st
PROGRAM ScrapBelt
VAR_INPUT ClearBelt : BOOL; BeltEmpty : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; END_VAR
VAR Clearing : BOOL; END_VAR
IF BeltEmpty THEN Clearing := FALSE; END_IF;
IF ClearBelt THEN Clearing := TRUE; END_IF;
Motor := Clearing;
END_PROGRAM
```

Read it from the top. The first IF clears the memory whenever the curtain sees an empty belt. The second IF sets it whenever the button is pressed, and because it comes last, a held button keeps the belt running even while the first IF clears the memory on every scan. When the button is released with offcuts still on the belt, `Clearing` stays TRUE and the belt goes on until the curtain sees it empty.

This machine has nothing to place on its belt, only a belt to run. The station of the practice also has to place its box, and which statement wins there is for you to decide from what must happen to the box.

## Common mistakes

- Driving the belt straight from the button. The belt moves only while the button is held, and the box stops halfway.
- Setting the memory and never clearing it. The belt carries the box past the sensor and off the end of the belt.
- Reading the sensor as a pulse. EyeFar stays TRUE for as long as the box stands in its beam, not only on the scan the box arrives.
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
question: In the scrap belt of the worked example, BeltEmpty and ClearBelt are both TRUE in the same scan. What is Clearing at the end of the scan?
options:
  - { text: 'TRUE', correct: true, feedback: 'Right. The statements run from top to bottom, so the IF on ClearBelt, written last, wins.' }
  - { text: 'FALSE', feedback: 'The IF on BeltEmpty clears it first, but the IF on ClearBelt sets it again after it in the same scan.' }
  - { text: 'It changes on every scan', feedback: 'Both IFs run on every scan in the same order, so the result is the same each time.' }
```

## What you will do in the practice

The starting program declares the inputs Start and EyeFar and the outputs Run and Emit, and drives nothing. You will write the program of the station: a press of the start button, which the scenario gives at {{t:200}} ms, puts one box on the belt and runs it, and the belt stops when EyeFar sees the box. Then press {{ui:learn.check}}.
