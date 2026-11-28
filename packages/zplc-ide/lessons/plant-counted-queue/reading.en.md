## The machine

This station runs a fixed batch of three boxes across a belt conveyor. Pressing `StartButton` starts the batch: `Emitter1` places boxes onto the left end of `Belt1` one at a time, `EyeIn` sees each box 0.7 m after the emitter, `EyeOut` sees each box near the discharge end, `Remover1` takes away every box that reaches the far end, and `DoneLight` lights once the third box has reached `EyeOut`.

![The counted-queue scene seen from the front. A belt conveyor on legs runs from left to right. On the left end, four cyan corner marks show where Emitter1 places a box, with StartButton on a pedestal behind the belt. Two diffuse optical sensors, EyeIn near the entry and EyeOut near the exit, stand behind the belt looking across it. Behind the right end stands DoneLight on a pedestal, and at the far right end a metal bin labeled Remover1 collects the boxes. Each wired part has a label with its name, its kind and its signal; Remover1 has no signal.](images/machine.en.png)

The station has seven parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EyeIn`       | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeOut`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Remover1`    | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `DoneLight`   | Indicator light        | A pilot lamp on the operator panel that shows one state.                                                      |

| Variable | Signal                | Direction & type  | Meaning                                           |
| -------- | --------------------- | ----------------- | ------------------------------------------------- |
| `Run`    | `Belt1.run`           | PLC output · BOOL | TRUE runs the belt forward.                       |
| `Emit`   | `Emitter1.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line. |
| `EyeIn`  | `EyeIn.detect`        | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `EyeOut` | `EyeOut.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.              |
| —        | `Remover1`            | —                 | Not wired to the PLC.                             |
| `Start`  | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.               |
| `Done`   | `DoneLight.lit`       | PLC output · BOOL | TRUE switches the lamp on.                        |

`Remover1` is not wired to the PLC: it clears any box that reaches the end of the belt. Your program sees only `Start`, `EyeIn` and `EyeOut`, and drives `Run`, `Emit` and `Done`.

## Counting a batch on a moving belt

A sensor stays TRUE for dozens of scans while a single box moves through its beam. If your program simply added 1 on every scan where `EyeIn` was TRUE, one box would count as dozens. An up-counter (`CTU`) solves that because it counts **rising edges** on its `CU` input: it increments its current value `CV` by 1 each time `CU` goes from FALSE to TRUE, and holds that count while the box stays in the beam. When `CV` reaches the preset value `PV`, the counter's `Q` output turns TRUE.

On a belt that both loads and unloads a batch, one count is not enough:

- **Loading count**: when the third box enters the belt, the emitter must stop releasing new boxes — otherwise a fourth box would enter the line.
- **Unloading count**: at that moment the third box has just entered the belt and is still travelling toward the far end. If the belt stopped when the loading count reached 3, boxes would be left stranded on the belt. The belt must keep running until the third box reaches `EyeOut`.

```timing
span: 20000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: EyeIn, edges: [1450, 2250, 3300, 4100, 5150, 5950] }
  - { name: EyeOut, edges: [4050, 4850, 5900, 6700, 7750, 20000] }
  - { name: Run, edges: [200, 7750] }
  - { name: Done, edges: [7750, 20000] }
caption: The loading and unloading counts overlap, and the belt stops with the third box still in EyeOut's beam, when Done turns ON
```

Because `Emit` releases one item on each rising edge, releasing three boxes means creating three separate rising edges, spaced far enough apart that each box has moved clear before the next one is placed on the belt.

## Worked example

A bottle-packing chute fills cartons of six bottles. A single optical sensor `BottleEye` sees each bottle drop into the carton. While fewer than six bottles have entered, `FeedGate` stays open (`TRUE`). As soon as the sixth bottle passes `BottleEye`, `FeedGate` closes (`FALSE`) and `CartonFull` lights up until the operator presses `NewCarton` to reset the counter for the next empty carton:

```st
PROGRAM BottlePacker
VAR_INPUT BottleEye : BOOL; NewCarton : BOOL; END_VAR
VAR_OUTPUT FeedGate : BOOL; CartonFull : BOOL; END_VAR
VAR PackCount : CTU; END_VAR
PackCount(CU := BottleEye, R := NewCarton, PV := 6);
CartonFull := PackCount.Q;
FeedGate := NOT PackCount.Q;
END_PROGRAM
```

Read it from the top. `PackCount` is declared as a `CTU` instance in `VAR` and called on every scan. Each bottle produces one rising edge on `BottleEye`, so `PackCount.CV` steps from 0 to 6 once per bottle regardless of how many scans the bottle spends in the beam. While `PackCount.Q` is FALSE, `FeedGate` is TRUE and `CartonFull` is FALSE. On the sixth rising edge, `PackCount.Q` turns TRUE, which lights `CartonFull` and closes `FeedGate` in the same scan. Pressing `NewCarton` sets `R` to TRUE, which clears `CV` to 0 and `Q` to FALSE.

This chute has only one point to count and a gate that stays open on its own. The belt station of the practice has to remember that a short start press began the batch, pace the emitter so boxes do not collide, and keep the belt running after the third box is loaded until the third box reaches `EyeOut`. Those decisions are yours to make.

## Common mistakes

- Stopping the belt as soon as the loading counter reaches 3. The third box has only just entered the belt and never reaches `EyeOut`.
- Holding `Emit` TRUE continuously. `Emitter1` only releases one box per rising edge; a signal that never returns to FALSE never triggers a second box.
- Triggering the next box before the previous one clears the loading zone. Two boxes overlap at the emitter and collide.
- Calling a `CTU` inside an `IF` that stops running. A counter must be called on every scan so it sees both the FALSE and TRUE levels that form each rising edge.

> [!NOTE]
> `CTU` needs a FALSE-to-TRUE transition on `CU` to count. If `CU` is already TRUE on the very first scan, or stays TRUE without ever returning to FALSE between two items, the counter will not register a new edge.

## Check yourself

```quiz
question: Why does a CTU counter count a box only once even though the box stays in the sensor beam for many scan cycles?
options:
  - { text: 'Because CTU increments only on a rising edge (FALSE to TRUE) of its CU input', correct: true, feedback: 'Yes. Staying TRUE on later scans does not increment CV again until CU goes FALSE and rises once more.' }
  - { text: 'Because CTU runs only once per second', feedback: 'CTU runs on every scan cycle you call it; it is the rising-edge detection on CU that prevents repeated counts.' }
  - { text: 'Because the optical sensor outputs a single-scan pulse', feedback: 'A diffuse optical sensor stays TRUE for the whole time the box is in its beam.' }
```

```quiz
question: In the bottle packer worked example, five bottles have passed BottleEye and the sixth bottle has just entered the beam. What are FeedGate and CartonFull at the end of that scan?
options:
  - { text: 'FeedGate is FALSE and CartonFull is TRUE', correct: true, feedback: 'Right. The sixth rising edge brings CV to PV (6), so PackCount.Q becomes TRUE, closing FeedGate and lighting CartonFull.' }
  - { text: 'FeedGate is TRUE and CartonFull is FALSE', feedback: 'PackCount.Q turns TRUE as soon as CV reaches 6, on the rising edge of the sixth bottle.' }
  - { text: 'Both FeedGate and CartonFull are TRUE', feedback: 'FeedGate is assigned NOT PackCount.Q, so it is always the opposite of CartonFull.' }
```

## What you will do in the practice

The starting program declares the inputs `Start`, `EyeIn` and `EyeOut` and the outputs `Run`, `Emit` and `Done`, with an empty body. The scenario presses `Start` at {{t:200}} ms and releases it at {{t:400}} ms. You will load three boxes one at a time without collisions, deliver boxes into `Remover1` with none dropped or colliding, and stop the belt with `Done` lit by {{t:20000}} ms, once the third box has reached `EyeOut`. Then press {{ui:learn.check}}.
