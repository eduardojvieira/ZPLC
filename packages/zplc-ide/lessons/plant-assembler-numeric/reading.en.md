## The machine

This is the same assembly station as before—three belts in a line, two emitters, two stop blades, two optical sensors, a remover, a start button and a stack light—with one difference on `Pick1`. Instead of four direction outputs and four limit switches, the two-axis pick-and-place unit takes numeric position setpoints in centimetres (`XSet`, `YSet`) and reports its current position in centimetres (`XPos`, `YPos`).

![The numeric two-axis assembly scene seen from the front. Three belt conveyors stand in a line from left to right: LidBelt with LidEmitter, LidBlade and LidEye on the left; BaseBelt with BaseEmitter, BaseBlade and BaseEye in the middle; and ExitBelt ending at Remover1 on the right. Pick1 bridges LidBelt and BaseBelt and exposes numeric position inputs XPos and YPos and setpoint outputs XSet and YSet instead of limit switches. StartButton sits behind LidBelt and StackLight1 stands beside ExitBelt. Each part has a label with its name, its kind and its wired signals.](images/machine.en.png)

The station has thirteen parts. The tables say what each one is in a real plant and what its signals mean to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                    | What it is in a real plant                                                                                    |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `LidBelt`     | Belt conveyor           | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `BaseBelt`    | Belt conveyor           | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `ExitBelt`    | Belt conveyor           | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `LidEmitter`  | Item emitter            | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `BaseEmitter` | Item emitter            | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `LidBlade`    | Stop blade              | A plate that rises across the belt to hold items back until they are let through.                             |
| `BaseBlade`   | Stop blade              | A plate that rises across the belt to hold items back until they are let through.                             |
| `LidEye`      | Diffuse optical sensor  | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `BaseEye`     | Diffuse optical sensor  | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Pick1`       | Two-axis pick and place | A two-axis handling unit that picks an item up with a gripper and sets it down somewhere else.                |
| `Remover1`    | Item remover            | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button             | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `StackLight1` | Stack light             | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable    | Signal                | Direction & type                        | Meaning                                                 |
| ----------- | --------------------- | --------------------------------------- | ------------------------------------------------------- |
| `RunLid`    | `LidBelt.run`         | PLC output · BOOL                       | TRUE runs the belt forward.                             |
| `RunBase`   | `BaseBelt.run`        | PLC output · BOOL                       | TRUE runs the belt forward.                             |
| `RunExit`   | `ExitBelt.run`        | PLC output · BOOL                       | TRUE runs the belt forward.                             |
| `EmitLid`   | `LidEmitter.emit`     | PLC output · BOOL                       | Each rising edge releases one item onto the line.       |
| `EmitBase`  | `BaseEmitter.emit`    | PLC output · BOOL                       | Each rising edge releases one item onto the line.       |
| `HoldLid`   | `LidBlade.extend`     | PLC output · BOOL                       | TRUE raises the blade across the belt; FALSE lowers it. |
| `HoldBase`  | `BaseBlade.extend`    | PLC output · BOOL                       | TRUE raises the blade across the belt; FALSE lowers it. |
| `LidReady`  | `LidEye.detect`       | PLC input · BOOL                        | TRUE while an object is in the beam.                    |
| `BaseReady` | `BaseEye.detect`      | PLC input · BOOL                        | TRUE while an object is in the beam.                    |
| `Gripped`   | `Pick1.gripped`       | PLC input · BOOL                        | TRUE while the gripper holds an item.                   |
| `XPos`      | `Pick1.xPos`          | PLC input · REAL, 0 to 100 = 0 to 1 m   | Where the X axis is now.                                |
| `YPos`      | `Pick1.yPos`          | PLC input · REAL, 0 to 30 = 0 to 0.3 m  | Where the Y axis is now.                                |
| `Grip`      | `Pick1.grip`          | PLC output · BOOL                       | TRUE closes the gripper (vacuum on, or jaws closed).    |
| `XSet`      | `Pick1.xSet`          | PLC output · REAL, 0 to 100 = 0 to 1 m  | The position the X axis must go to.                     |
| `YSet`      | `Pick1.ySet`          | PLC output · REAL, 0 to 30 = 0 to 0.3 m | The position the Y axis must go to.                     |
| —           | `Remover1`            | —                                       | Not wired to the PLC.                                   |
| `Start`     | `StartButton.pressed` | PLC input · BOOL                        | TRUE while the button is held down.                     |
| `Green`     | `StackLight1.green`   | PLC output · BOOL                       | TRUE lights the green lamp.                             |
| `Amber`     | `StackLight1.amber`   | PLC output · BOOL                       | TRUE lights the amber lamp.                             |

The range of `XPos` and `XSet` is `0.0` to `100.0` cm (`0` to `1` m), and the range of `YPos` and `YSet` is `0.0` to `30.0` cm (`0` to `0.3` m).

## Setpoints, feedback and position tolerance

A limit switch only tells you whether an axis is at one end of its travel. A servo or stepper axis with an encoder reports its position as a `REAL` number and moves toward whatever setpoint you write. That lets one axis stop at any point along its stroke—not only the ends—without adding extra switches.

Because `REAL` position feedback is a measurement, **never test exact equality** (`Pos = Target`). Rounding error or a small settling difference can leave `Pos` at `64.999` when `Target` is `65.0`, so `Pos = Target` stays FALSE forever and the machine stalls.

Instead, test whether the axis is inside a **position tolerance** around its setpoint:

```st
InBand := ABS(Pos - Target) < Band;
```

`ABS(Pos - Target)` is the distance between where the axis is and where you asked it to go, regardless of which side it approaches from. When that distance is smaller than `Band`, the move is done.

Two habits keep numeric sequences readable and reliable:

- **Name every coordinate in `VAR CONSTANT`:** writing `MarkPos` and `ParkPos` instead of bare numbers makes each state easy to read and keeps every comparison consistent.
- **Change the setpoint once when entering the move state:** write the new setpoint in the transition that enters a move state, then let that state wait for the tolerance flag before advancing to the next state.

## Worked example

A linear shuttle carries a work-piece along a single rail between a park position (`10.0` cm) and a stamping head (`65.0` cm). A press of `CmdStart` sends the shuttle to the stamping head, triggers `StampCmd` until the head reports `MarkDone`, and then returns the shuttle to park. The move is considered done when `RailPos` is within `0.5` cm of `RailSet`.

```st
PROGRAM LabelShuttle
VAR_INPUT
    CmdStart : BOOL;
    MarkDone : BOOL;
    RailPos  : REAL;
END_VAR
VAR_OUTPUT
    RailSet   : REAL;
    StampCmd  : BOOL;
    ReadyLamp : BOOL;
END_VAR
VAR
    State  : INT;
    InBand : BOOL;
END_VAR
VAR CONSTANT
    ParkPos : REAL := 10.0;
    MarkPos : REAL := 65.0;
    Band    : REAL := 0.5;
END_VAR

InBand := ABS(RailPos - RailSet) < Band;

IF State = 0 AND CmdStart THEN
    RailSet := MarkPos;
    State := 1;
ELSIF State = 1 AND InBand THEN
    State := 2;
ELSIF State = 2 AND MarkDone THEN
    RailSet := ParkPos;
    State := 3;
ELSIF State = 3 AND InBand THEN
    State := 0;
END_IF;

StampCmd  := State = 2;
ReadyLamp := State = 0;
END_PROGRAM
```

```timing
span: 8000
signals:
  - { name: CmdStart, edges: [500, 900] }
  - { name: InBand, edges: [0, 500, 2800, 4200, 6500, 8000] }
  - { name: StampCmd, edges: [2800, 4200] }
  - { name: ReadyLamp, edges: [0, 500, 6500, 8000] }
marks:
  - { from: 500, to: 2800, label: 'RailSet = 65.0' }
  - { from: 4200, to: 6500, label: 'RailSet = 10.0' }
caption: Each transition writes RailSet once and advances State; the next state waits until InBand is TRUE
```

Follow the scan order when `CmdStart` arrives in `State = 0`. `InBand` was computed at the top of the scan against the old setpoint, so the `IF` branch sets `RailSet := MarkPos;` and moves to `State := 1`, and none of the `ELSIF` branches run on that same scan. On the next scan, `InBand` is recomputed against `65.0`, becomes FALSE while the shuttle travels, and turns TRUE once `RailPos` enters `64.5 .. 65.5` cm.

This shuttle has only one axis, one cycle at a time, and an external `MarkDone` signal. In the practice you must coordinate two numeric axes without crossing while lowered, handle part feeding, stop blades and vacuum grip/release, and count three completed assemblies.

## Common mistakes

- Comparing `REAL` positions with `=`. A tiny residual difference leaves the condition FALSE forever and freezes the sequence.
- Writing a new setpoint and checking the old tolerance flag in the same scan (for example using separate `IF` blocks instead of `IF / ELSIF`). The state skips straight past the move before the axis has started.
- Changing the horizontal setpoint before the vertical axis is within tolerance of the safe height. Both axes move at once and the pad sweeps diagonally across the belts.
- Choosing a tolerance too wide, so the gripper starts acting before the pad is centred over the part, or too tight for the axis to settle inside it.
- Driving an output only inside one `IF` branch and forgetting to clear it when leaving that state.

> [!NOTE]
> `ABS(Pos - Target) < Band` works whether the axis approaches from below or from above. If you omit `ABS`, the check passes immediately whenever the axis is already below the target.

## Check yourself

```quiz
question: Why does LabelShuttle check ABS(RailPos - RailSet) < Band instead of RailPos = RailSet?
options:
  - { text: 'Because RailPos is a REAL measurement that may settle close to RailSet without ever equalling it exactly', correct: true, feedback: 'Yes. A tolerance band succeeds as soon as the axis is close enough to its target.' }
  - { text: 'Because Structured Text does not allow = on REAL values', feedback: 'The operator = compiles on REAL values, but tiny rounding or positioning differences can make it stay FALSE forever.' }
  - { text: 'Because ABS makes the axis move faster', feedback: 'ABS only computes the distance between the current position and the setpoint; it does not change axis speed.' }
```

```quiz
question: In LabelShuttle, RailSet is 65.0 and Band is 0.5. When RailPos is 64.6, what is InBand?
options:
  - { text: 'TRUE, because ABS(64.6 - 65.0) is 0.4, which is less than 0.5', correct: true, feedback: 'Right. The shuttle is within 0.5 cm of 65.0 cm, so the move is done.' }
  - { text: 'FALSE, because 64.6 is still below 65.0', feedback: 'ABS removes the minus sign, so approaching from below works the same as approaching from above.' }
  - { text: 'FALSE, because 64.6 is not equal to 65.0', feedback: 'The tolerance check does not require exact equality, only a distance smaller than Band.' }
```

## What you will do in the practice

The starting program in `src/Assembler.st` declares all inputs and outputs of the station, including `XPos`, `YPos`, `XSet` and `YSet`, and drives nothing yet. You will write the Structured Text program that commands `Pick1` with numeric setpoints and a position tolerance, feeds and holds lids and bases, assembles three pairs without crossing the belts while lowered, lets each finished assembly leave on the exit belt, and lights `Green` after the third. Save your program and press {{ui:learn.check}}.
