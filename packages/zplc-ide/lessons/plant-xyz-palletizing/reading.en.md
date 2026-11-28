## The machine

A three-axis gantry palletizer picks individual boxes from an infeed belt with a vacuum pad and places them in a programmed X–Y–Z grid on a pallet. Unlike a layer palletizer that moves four boxes at once, a gantry places one box at a time at any coordinate within its frame, so changing the stack pattern is a change in the program rather than in the mechanics.

![The three-axis-palletizing scene seen from the front. On the left, a belt conveyor with a cyan emitter mark, a start button, a stop blade and a diffuse optical sensor feeds boxes under a large rectangular gantry frame. Inside the frame, a blue vertical vacuum head moves across X, Y and Z above a wooden pallet on the right, with a stack light behind the pallet. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has eight parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Blade1`      | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `EyePick`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Gantry1`     | Three-axis gantry      | A three-axis handling robot on a frame over the work area that moves a gripper in X, Y and Z.                 |
| `Pallet1`     | Pallet                 | A wooden pallet that carries a load through the plant and onto a truck.                                       |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `StackLight1` | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable  | Signal                | Direction & type                         | Meaning                                                 |
| --------- | --------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `RunBelt` | `Belt1.run`           | PLC output · BOOL                        | TRUE runs the belt forward.                             |
| `Emit`    | `Emitter1.emit`       | PLC output · BOOL                        | Each rising edge releases one item onto the line.       |
| `Hold`    | `Blade1.extend`       | PLC output · BOOL                        | TRUE raises the blade across the belt; FALSE lowers it. |
| `EyePick` | `EyePick.detect`      | PLC input · BOOL                         | TRUE while an object is in the beam.                    |
| `XCmd`    | `Gantry1.xSet`        | PLC output · INT, 0 to 1000 = 0 to 1.6 m | The position the X axis must go to.                     |
| `YCmd`    | `Gantry1.ySet`        | PLC output · INT, 0 to 1000 = 0 to 1.2 m | The position the Y axis must go to.                     |
| `ZCmd`    | `Gantry1.zSet`        | PLC output · INT, 0 to 1000 = 0 to 1.2 m | The position the Z axis must go to.                     |
| `XPos`    | `Gantry1.xPos`        | PLC input · INT, 0 to 1000 = 0 to 1.6 m  | Where the X axis is now.                                |
| `YPos`    | `Gantry1.yPos`        | PLC input · INT, 0 to 1000 = 0 to 1.2 m  | Where the Y axis is now.                                |
| `ZPos`    | `Gantry1.zPos`        | PLC input · INT, 0 to 1000 = 0 to 1.2 m  | Where the Z axis is now.                                |
| `Grip`    | `Gantry1.grip`        | PLC output · BOOL                        | TRUE closes the gripper (vacuum on, or jaws closed).    |
| `Gripped` | `Gantry1.gripped`     | PLC input · BOOL                         | TRUE while the gripper holds an item.                   |
| —         | `Pallet1`             | —                                        | Not wired to the PLC.                                   |
| `Start`   | `StartButton.pressed` | PLC input · BOOL                         | TRUE while the button is held down.                     |
| `Green`   | `StackLight1.green`   | PLC output · BOOL                        | TRUE lights the green lamp.                             |
| `Amber`   | `StackLight1.amber`   | PLC output · BOOL                        | TRUE lights the amber lamp.                             |

Here every axis is numeric: you write a target in integer counts (`0` to `1000`) and read back the current position in the same scale. No timed jogs are needed.

## Numeric positions, tolerance bands and pattern arithmetic

Driving a numeric gantry through a repeated stack rests on three ideas:

- **Scaling metres to counts.** When a stroke of `S` metres maps to `0..1000`, a position `p` metres becomes `round(p / S * 1000)` counts. For example, on a `2.0 m` axis, `1.0 m` is `500` counts; on a `1.6 m` axis, one count is `1.6 mm`.
- **Arrival within a band.** A real drive can settle a count or two away from its command. Instead of testing exact equality (`Pos = Cmd`), compare each axis against a narrow band (`Pos >= Cmd - tol AND Pos <= Cmd + tol`), combine all axes into one BOOL, and let every moving state wait for it.
- **One counter for the whole pattern.** Rather than writing separate steps for each item, keep one zero-based item counter `n`. The remainder `n MOD slotsPerLayer` picks the slot inside the current layer, and `n / slotsPerLayer` (or a comparison against `slotsPerLayer`) picks the layer height.

```timing
span: 6000
signals:
  - { name: Grip, edges: [3310, 5420] }
  - { name: Gripped, edges: [3310, 5420] }
caption: On the first box of a run, Grip is on from 3.3 s to 5.4 s and Gripped follows it within a scan or two, because a vacuum pad attaches and releases almost at once
```

Moving vertically before moving horizontally keeps the carried item clear of the belt and of the boxes already stacked on the pallet.

## Worked example

A two-axis tray packer loads six cans into a crate that holds two layers of three cans in a row. Its X axis spans `2.0 m` (`0..1000` counts) and its Y axis spans `1.0 m` (`0..1000` counts). Each can sits `200` counts apart in X starting at `300`, layer `0` sets down at `Y = 200` and layer `1` sets down `180` counts higher.

One counter `Count` (`0` to `5`) computes both the slot and the layer, and `AtTarget` checks both axes within `±2` counts:

```st
PROGRAM TrayLoader
VAR_INPUT
    PosX    : INT;
    PosY    : INT;
    RunAuto : BOOL;
END_VAR
VAR_OUTPUT
    SetX : INT;
    SetY : INT;
    Done : BOOL;
END_VAR
VAR
    State    : INT;
    Count    : INT;
    SlotIdx  : INT;
    LayerIdx : INT;
    AtTarget : BOOL;
END_VAR

SlotIdx  := Count MOD 3;
LayerIdx := Count / 3;
AtTarget := PosX >= SetX - 2 AND PosX <= SetX + 2
        AND PosY >= SetY - 2 AND PosY <= SetY + 2;

CASE State OF
    0:
        IF RunAuto THEN
            SetY  := 850;
            State := 1;
        END_IF;
    1:
        IF AtTarget THEN
            SetX  := 300 + SlotIdx * 200;
            State := 2;
        END_IF;
    2:
        IF AtTarget THEN
            SetY  := 200 + LayerIdx * 180;
            State := 3;
        END_IF;
    3:
        IF AtTarget THEN
            Count := Count + 1;
            SetY  := 850;
            State := 4;
        END_IF;
    4:
        IF AtTarget THEN
            IF Count >= 6 THEN
                State := 5;
            ELSE
                SetX  := 0;
                State := 1;
            END_IF;
        END_IF;
END_CASE;

Done := State = 5;
END_PROGRAM
```

Notice the order of moves: `State 0` raises Y to the safe travel height (`850`) before X ever moves, `State 1` travels horizontally to the computed slot, `State 2` lowers to the layer height, and `State 3` raises Y again before returning X to `0`.

This packer has only two axes, places three cans in a line per layer, and has no belt, stop blade or vacuum pad. In the practice, the gantry moves in three axes (X, Y and Z) over a 2 by 2 grid, grips each box held at the stop blade of a running belt, and waits for a short settle and release time.

## Common mistakes

- Testing exact equality `XPos = XCmd`. It passes in this simulation, where the axis stops exactly on its command, but a real drive settles a count or two away and the step waits forever.
- Travelling in X or Z below the safe height. The carried box hits the first layer and knocks boxes off, and Check fails on a dropped box.
- Turning `Grip` off before the gantry arrives at the drop height. The box falls from above and counts as a dropped item.

> [!NOTE]
> Choose the safe travel height so that the bottom of a carried box stays above the top of the highest layer on the pallet.

## Check yourself

```quiz
question: In a tray packer that puts 3 items per layer, Count starts at 0. For Count = 4, what are SlotIdx = Count MOD 3 and LayerIdx = Count / 3?
options:
  - { text: 'Slot 1, layer 1', correct: true, feedback: 'Yes. 4 divided by 3 is 1 with remainder 1, so item 4 is the second slot of the second layer.' }
  - { text: 'Slot 2, layer 1', feedback: 'Remainder of 4 divided by 3 is 1, not 2; slot 2 is Count = 5.' }
  - { text: 'Slot 1, layer 0', feedback: 'Layer 0 holds Count = 0, 1 and 2; by Count = 4 the packer is on layer 1.' }
```

```quiz
question: Why does a numeric-axis sequence check a small tolerance band around the command instead of Pos = Cmd?
options:
  - { text: 'Because a real axis can settle one count away from its command, which would stall an exact check', correct: true, feedback: 'Right. A narrow band such as ±1 count lets the step advance reliably without sacrificing accuracy.' }
  - { text: 'Because Structured Text does not support = on INT variables', feedback: 'Structured Text supports = on INT; the band is needed because of how physical positions round to integer counts.' }
  - { text: 'Because the gantry moves faster when a tolerance band is used', feedback: 'The tolerance band only affects when the PLC considers the move finished, not the axis speed.' }
```

## What you will do in the practice

The starting program in `src/Palletizing.st` declares the three axis positions and commands, the belt, blade, vacuum and lamp signals, and commands no position yet. On `Start`, which the scenario presses at {{t:200}} ms, you will raise the gantry clear of the belt, pick each box from the blade, place eight boxes in a 2 by 2 pattern of two layers on `Pallet1`, and light `Green` after the eighth. Then press {{ui:learn.check}}.
