## The machine

This is a sorting line for boxes of three heights. Boxes ride in on an infeed belt and pass two light beams, one above the other. Further on, a chain transfer stops each box against a blade and sends it on: straight ahead, to the right or to the left, to one of three bins. Real sorting lines often measure an item well before the place where it is sent, so what a sensor saw has to be carried to the place where it is needed.

![The height-sorting scene seen from above at an angle, with its title above the picture and a key below it. A belt comes in from the left and meets a chain transfer in the middle. From the transfer, one belt goes on to the right and two more run across the picture, each ending in a bin. Every part has a label with its name, its kind and its PLC variable and signal, joined to the part by a line.](images/machine.en.png)

The line has fifteen parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Chain1`      | Chain transfer         | A section of the line whose chains rise between the rollers to move an item sideways onto another line.       |
| `Straight`    | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `SideRight`   | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `SideLeft`    | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Stop1`       | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `BeamLow`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `BeamHigh`    | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeChain`    | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `BinShort`    | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `BinMedium`   | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `BinTall`     | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `Beacon`      | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable      | Signal                | Direction & type  | Meaning                                                 |
| ------------- | --------------------- | ----------------- | ------------------------------------------------------- |
| `RunIn`       | `Infeed.run`          | PLC output · BOOL | TRUE runs the belt forward.                             |
| —             | `Source1`             | —                 | Not wired to the PLC.                                   |
| `Raised`      | `Chain1.raised`       | PLC input · BOOL  | TRUE when the chains are fully up.                      |
| `Lowered`     | `Chain1.lowered`      | PLC input · BOOL  | TRUE when the chains are fully down.                    |
| `RunChain`    | `Chain1.run`          | PLC output · BOOL | TRUE moves items forward along the line (chains down).  |
| `Lift`        | `Chain1.lift`         | PLC output · BOOL | TRUE raises the chains; FALSE lowers them.              |
| `MoveRight`   | `Chain1.moveRight`    | PLC output · BOOL | TRUE moves items sideways to the right (chains up).     |
| `MoveLeft`    | `Chain1.moveLeft`     | PLC output · BOOL | TRUE moves items sideways to the left (chains up).      |
| `RunStraight` | `Straight.run`        | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunRight`    | `SideRight.run`       | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunLeft`     | `SideLeft.run`        | PLC output · BOOL | TRUE runs the belt forward.                             |
| `Hold`        | `Stop1.extend`        | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `Low`         | `BeamLow.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `High`        | `BeamHigh.detect`     | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `AtBlade`     | `EyeChain.detect`     | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| —             | `BinShort`            | —                 | Not wired to the PLC.                                   |
| —             | `BinMedium`           | —                 | Not wired to the PLC.                                   |
| —             | `BinTall`             | —                 | Not wired to the PLC.                                   |
| `Start`       | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                     |
| `Busy`        | `Beacon.amber`        | PLC output · BOOL | TRUE lights the amber lamp.                             |
| `Done`        | `Beacon.green`        | PLC output · BOOL | TRUE lights the green lamp.                             |

Three parts have no variable. `Source1` releases the boxes on its own and the three bins take away what reaches them, so your program never starts or stops them. It never sees a box either, only what the sensors say about it.

## How the machine behaves

`Source1` releases nine boxes: the first about 5 s into the run and then one every 5 s. Their heights are 0.20 m, 0.30 m and 0.40 m. In the scenario run, two boxes are 0.20 m, six are 0.30 m and one is 0.40 m. `BeamLow` sits at 0.25 m and `BeamHigh` at 0.35 m, so a box breaks a beam only if it is taller than the beam.

The beams are well before the blade. In the run of the reference solution, the first box enters `BeamLow` at 7.6 s and stays in it for 0.8 s. At 9.9 s, 2.3 s after it entered the beam, `EyeChain` sees it standing against the blade. Every box takes about 4.9 s to get from `Source1` to the blade, and passes the beams about 2.3 s before it reaches it.

```timing
span: 12000
signals:
  - { name: Low, edges: [7640, 8440] }
  - { name: AtBlade, edges: [9910, 12000] }
marks:
  - { from: 7640, to: 9910, label: '2.3 s' }
caption: The first box of a run is in the low beam for 0.8 s, and stands against the blade 2.3 s after it entered the beam
```

The blade needs about 0.4 s to rise after `Hold` turns on. The chains need about 0.4 s to rise after `Lift` turns on, and about 0.4 s to go down after it turns off. With the chains down, `RunChain` carries a box forward. With the chains up, `MoveRight` and `MoveLeft` move it sideways.

## A sensor sees the box only while it passes

A beam contact conducts only while something is in the beam. The box has left the beams long before it reaches the blade, so at the blade the beams say nothing about it. But the program needs the height there, to choose the direction.

So the program needs a **memory bit** for each beam: a BOOL variable of its own, not wired to any part, that remembers "this beam was broken". A plain coil would not do, because it follows its rung: when the beam goes FALSE, the coil goes FALSE. A **set** coil turns its bit on and leaves it on, even after the power that reached it disappears. A **reset** coil turns it off and leaves it off. So one rung with a set coil remembers the beam, and a bit stays set until a rung with a reset coil clears it.

Two memory bits hold three answers: neither beam was broken, only the low one, or both. A memory bit that is set and never reset keeps the answer of an earlier box, and every box after it is judged by that answer. When to reset it is a decision of the machine, not of the language.

## Worked example

A parcel gauge at a depot is a short tunnel that holds one parcel at a time: an upstream gate lets the next parcel in only after the exit eye has seen the previous one leave. Two beams in the tunnel, `GaugeLow` and `GaugeHigh`, measure the height of a parcel while it passes. Further on, at the exit, `ExitEye` sees the parcel and the program must choose a lane: flat, standard or bulky. The lane is needed when the parcel is at the exit, and by then the beams are FALSE again.

```ld-figure
src: reading/parcel-gauge.ld.json
caption: Rungs 1 and 2 remember the beams, rungs 3 to 5 choose the lane, rungs 6 and 7 forget when the parcel has left
```

Read it from the top. Rungs 1 and 2 set a memory bit whenever its beam is broken. A parcel that breaks both beams sets both bits, and a parcel that breaks neither sets none. Rungs 3, 4 and 5 look at `ExitEye` and at the bits. A bulky parcel set `SawHigh`. A standard one set `SawLow` and not `SawHigh`, so rung 4 has a normally closed contact on `SawHigh`, which conducts while that bit is off; a bulky parcel also sets `SawLow`, and the contact keeps it out of this lane. A flat one set neither, so rung 5 has a normally closed contact on `SawLow`.

Rungs 6 and 7 use an N contact on `ExitEye`, which conducts for one scan when `ExitEye` goes from TRUE to FALSE, which is when the parcel has left. Each one resets a memory bit. They sit below the lane rungs, which are solved first in every scan. The gate then lets the next parcel in.

```ld-try
src: reading/parcel-gauge.ld.json
inputs:
  - { name: GaugeLow, kind: switch }
  - { name: GaugeHigh, kind: switch }
  - { name: ExitEye, kind: switch }
outputs: [ToFlat, ToStandard, ToBulky]
caption: Switch GaugeLow on and off, then switch ExitEye on and off
```

Press Run. Switch `GaugeLow` on and then off, as a parcel passing under the low beam does. Both beams are FALSE again, yet `SawLow` stays set. Now switch `ExitEye` on: `ToStandard` lights. Switch `ExitEye` off and the bits are reset. Switch `ExitEye` on again with no beam in between: `ToFlat` lights. Then switch both beams on and off, and `ExitEye` on: `ToBulky` lights.

This gauge handles one parcel at a time and has nothing to lift or slide. The line of the practice is not that kind of machine: when to reset the memory bits there is for you to decide from what the boxes do on it.

## Common mistakes

- Reading the beams at the blade. The box has left them long before, so at the blade they say nothing about its height.
- Remembering a beam with a plain coil. The coil follows its rung, so it is FALSE again when the beam is FALSE and remembers nothing. Use a set coil.
- Setting a memory bit and never resetting it. The bit keeps the answer of an earlier box, so a short box that follows a tall one is sent the wrong way.
- Putting a rung that uses a memory bit below the rung that resets it. In that scan the rung sees the bit already reset.

> [!NOTE]
> A box that moves fast past a beam can be in it for a short time, and a program that reads it too late misses it. Here the box is in the low beam for 0.8 s, which is about 80 scans: the program sees it, and what it has to do is keep what it saw.

## Check yourself

```quiz
question: Why does the Ladder program of the height line need a memory bit for each beam?
options:
  - { text: 'Because a beam contact conducts only while the box passes, and the program needs the height later, at the blade', correct: true, feedback: 'Yes. The set coil keeps what the beam showed after the box has gone by.' }
  - { text: 'Because a beam needs a memory bit to see the box', feedback: 'A beam is TRUE whenever a box breaks it; it needs nothing from the program.' }
  - { text: 'Because the blade cannot hold a box unless the beams remember it', feedback: 'The blade is driven by Hold. The beams only measure the height.' }
```

```quiz
question: In the parcel gauge of the worked example, a parcel breaks GaugeLow but never GaugeHigh, and then ExitEye turns TRUE. Which lane coil is on?
options:
  - { text: 'ToStandard', correct: true, feedback: 'Right. SawLow is set and SawHigh is not, which is the standard lane.' }
  - { text: 'ToFlat', feedback: 'Rung 5 needs SawLow to be off, and this parcel set it.' }
  - { text: 'ToBulky', feedback: 'Rung 3 needs SawHigh, and this parcel never broke the high beam.' }
```

## What you will do in the practice

The starting project has no rungs: its inputs, outputs and variables are declared and nothing uses them. You will draw the program of the line: a press of the start button, which the scenario gives at {{t:200}} ms, runs the belts, every box is sorted by its height into its own bin, and the green lamp `Done` lights when the nine boxes are handled, before the scenario ends at {{t:62000}} ms. Then press {{ui:learn.check}}.
