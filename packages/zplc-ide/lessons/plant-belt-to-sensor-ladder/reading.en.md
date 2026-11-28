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

A push button is TRUE only while a finger holds it, for a fraction of a second. A plain coil in Ladder follows its rung on every scan, so a rung straight from Start to Run moves the belt only while the button is held and stops it with the box in the middle.

So the program needs a **memory**: a local BOOL variable — `Running` — not wired to any part, that remembers "the belt should be running". In Ladder, a **SET coil** `(S)` turns the memory on and leaves it on after the button is released, a **RESET coil** `(R)` turns it off when the stop condition arrives, and another rung reads that memory with a contact to drive the output coil.

```timing
span: 6000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: Running, edges: [200, 3260] }
  - { name: EyeFar, edges: [3260, 6000] }
  - { name: Run, edges: [200, 3260] }
caption: A short press sets the memory, the sensor resets it, and the belt follows the memory
```

The sensor stays TRUE while the box stands in front of it, so its rung keeps the memory reset. That is what you want: the box waits at the end of the belt until someone takes it away.

When the SET rung and the RESET rung both conduct in the same scan, the rung drawn **last** wins, because ZPLC solves rungs from top to bottom. Which one should win is a decision of the machine, not of the language.

## Worked example

A scrap conveyor under a cutting machine carries offcuts to a bin. A short press of `ClearBelt` must run the belt until a light curtain at its end, `BeltEmpty`, says that nothing is left on it. But the operator also uses the button to jog the belt: while `ClearBelt` is held, the belt must run even when the curtain says empty. So here the start wins, and the SET rung comes last:

```ld-figure
src: reading/scrap-belt.ld.json
caption: Rung 1 resets Clearing on BeltEmpty, rung 2 sets Clearing on ClearBelt so start wins, and rung 3 drives Motor
```

Read it from top to bottom. Rung 1 resets `Clearing` whenever the curtain sees an empty belt. Rung 2 sets `Clearing` whenever the button is pressed, and because it sits below rung 1, a held button keeps `Clearing` TRUE even while rung 1 resets it on every scan. Rung 3 copies `Clearing` to the `Motor` coil.

```ld-try
src: reading/scrap-belt.ld.json
inputs:
  - { name: ClearBelt, kind: push }
  - { name: BeltEmpty, kind: switch }
outputs: [Motor]
timing: [ClearBelt, BeltEmpty, Motor]
caption: Press and release ClearBelt, then switch BeltEmpty on; hold ClearBelt while BeltEmpty is on
```

Press Run, then press and release `ClearBelt`: the motor keeps running. Switch `BeltEmpty` on: the motor stops. Now hold `ClearBelt` while `BeltEmpty` is still on: the motor runs as long as you hold the button, because rung 2 comes last.

This machine has nothing to place on its belt, only a belt to run. The station of the practice also has to place its box, and which rung wins there is for you to decide from what must happen to the box.

## Common mistakes

- Driving the belt coil straight from the `Start` contact. The belt moves only while the button is held, and the box stops halfway.
- Drawing a SET coil on the memory and forgetting its RESET rung. The belt carries the box past the sensor and off the end of the belt.
- Reading the sensor as a pulse. `EyeFar` stays TRUE for as long as the box stands in its beam, not only on the scan the box arrives.
- Writing the same variable with a plain coil and a SET or RESET coil. ZPLC allows one SET and one RESET rung per latched variable, not a mix with a plain coil.

> [!NOTE]
> The sensor sees the box only while the box is in its beam. A box that moves fast past a sensor can be in the beam for a short time, and a program that reads it too late misses it. Here the belt stops the box in the beam, so the signal stays TRUE.

## Check yourself

```quiz
question: 'Why does the belt need a memory variable instead of a single rung from Start to Run?'
options:
  - { text: 'Because Start is TRUE only while the button is held, and a plain coil drops as soon as the button is released', correct: true, feedback: 'Yes. The memory holds the state after the finger is gone.' }
  - { text: 'Because a Ladder contact cannot read an input directly', feedback: 'A contact can read any input directly. The problem is that Start returns to FALSE too soon.' }
  - { text: 'Because the sensor needs a memory to see the box', feedback: 'The sensor is TRUE while the box is in its beam; it needs nothing from the program.' }
```

```quiz
question: 'In the scrap belt of the worked example, BeltEmpty and ClearBelt are both TRUE in the same scan. What is Clearing at the end of the scan?'
options:
  - { text: 'TRUE', correct: true, feedback: 'Right. Rungs are solved from top to bottom, so the SET rung on ClearBelt, drawn last, wins.' }
  - { text: 'FALSE', feedback: 'Rung 1 resets Clearing first, but rung 2 sets it again after it in the same scan.' }
  - { text: 'It changes on every scan', feedback: 'Both rungs run in the same order on every scan, so the result is the same each time.' }
```

## What you will do in the practice

The starting program declares the inputs Start and EyeFar, the outputs Run and Emit, and the local variable Running, and has no rungs yet. You will draw the rungs of the station: a press of the start button, which the scenario gives at {{t:200}} ms, puts one box on the belt and runs it, and the belt stops when EyeFar sees the box. Then press {{ui:learn.check}}.
