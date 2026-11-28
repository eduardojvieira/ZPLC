## The machine

This is a height sorter. Boxes of three heights arrive one at a time on the infeed belt, and two light beams across the belt measure each box as it passes. A stop blade then holds the box at the chain transfer in the middle of the line, the program decides, and the chain transfer lets the box go straight on or lifts it and sends it sideways. Short boxes go straight on to one bin, medium boxes to one side, and tall boxes to the other.

![The height-sorting scene with a chain transfer, seen from the front. A belt conveyor, Infeed, comes in from the left and reaches a chain transfer, Chain1, in the middle, with a stop blade, Stop1, beside it. From the chain transfer one belt continues straight on to the right and one belt leads off to each side, and each of the three belts ends at a bin: BinShort, BinMedium and BinTall. Three diffuse sensors, BeamLow, BeamHigh and EyeChain, watch the line. Source1 releases the boxes, StartButton is a push button and Beacon is a stack light. Each part has a label with its name, its kind and the variables and signals wired to it, with an arrow for each input and output.](images/machine.en.png)

The station has fifteen parts. The tables say what each one is in a real plant and what its signals mean to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

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

Two of the three sensors measure the box. `BeamLow` looks across the infeed at 0.25 m above the belt and `BeamHigh` at 0.35 m, so a short box breaks neither, a medium box breaks `BeamLow` only, and a tall box breaks both. The third sensor, `EyeChain`, sees a box standing at the blade.

`Source1` releases a box every 5 s, up to nine boxes. In the 40 s of the scenario it releases eight; in a run without the fault, the first five reach a bin before the end, four medium and one tall. A medium or a tall box breaks a beam for 0.8 s as it passes.

## A sensor that tells the wrong story

Your program never sees a box. It sees what its sensors say, and it believes them: when `High` is TRUE, the box is tall. That works while the sensors tell the truth. A sensor can also stick: it goes on reading TRUE whatever is in front of it.

In the scenario of this lesson, the plant triggers the fault action `stuckOn` on `BeamHigh` at 21 s. From then on `High` is TRUE for ever, and every box that breaks `BeamLow` also seems to break `BeamHigh`, so it looks tall.

```timing
span: 30000
signals:
  - { name: BeamLow, edges: [7640, 8440, 12640, 13440, 17640, 18440, 22640, 23440, 27640, 28440] }
  - { name: BeamHigh, edges: [17640, 18440, 21010] }
caption: 'BeamLow and BeamHigh in the run: a box breaks a beam for 0.8 s, and from 21 s BeamHigh stays on'
```

A program with no diagnosis sorts on, and sends the boxes that are not tall to the tall bin: in the run of the starting program, two boxes that are not tall end in `BinTall`.

To see that something is wrong, the program needs a fact that it can read and that does not fit the machine. A **diagnosis** compares what a sensor says with what the machine tells the program about it. Once the program knows, it must also react, and the reaction has to fit the machine: some parts can stop at once, others must finish what they have started. A fault is remembered until someone clears it, so that it cannot go away on its own and let the line start again.

## Worked example

A roller door has two limit switches: `IsOpen` is TRUE when the door is fully up and `IsClosed` when it is fully down. A press of `Raise` runs the motor until the door is fully up. The two switches can never be TRUE together, so if they are, one of them is stuck and the program cannot tell which. In that case the motor must stop and stay stopped, and an alarm must light.

```st
PROGRAM RollerDoor
VAR_INPUT Raise : BOOL; IsOpen : BOOL; IsClosed : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; Alarm : BOOL; END_VAR
VAR DoorFault : BOOL; END_VAR
IF IsOpen AND IsClosed THEN DoorFault := TRUE; END_IF;
Motor := Raise AND NOT IsOpen AND NOT DoorFault;
Alarm := DoorFault;
END_PROGRAM
```

Read it from the top. The first IF finds the fact: both switches TRUE at once cannot happen. It sets `DoorFault`, and nothing in the program ever clears it. The motor needs `Raise`, a door that is not yet open, and no fault. Suppose the door is rising and the two switches become TRUE together, and then one of them goes back to FALSE. Without the memory, the motor would start again as soon as `IsOpen` went FALSE with `Raise` still held; with `DoorFault`, it stays stopped and `Alarm` stays on.

This machine has a fact that one scan is enough to read: two switches that cannot both be on. The beam of the sorter is on or off in either case, so one scan proves nothing. What proves its fault, and how soon the program must act, you must decide from what the machine tells you about its boxes. The door also has one motor to stop; the sorter has several parts, and which of them to stop is also for you to decide.

## Common mistakes

- Trusting a sensor for ever. In the run of the starting program, two boxes that are not tall end in `BinTall`.
- Deciding too early. A program that decides before a tall box has finished passing the beam stops the line with a healthy sensor; in the run, such a program left the tall box unsorted and the scenario failed.
- Deciding too late. A program that waits too long lets a box be sorted on the false reading; in the run, one box went to the wrong bin and the scenario failed.
- Stopping every belt. A box already on the way to its bin is stranded on a stopped belt; in the run of a program that also stopped the three outfeed belts, the tall box never reached `BinTall` and the scenario failed.

> [!NOTE]
> The scenario only triggers a beam that sticks on. A beam stuck off, a jam of the chain module or a box that falls need a different fact and a different reaction.

## Check yourself

```quiz
question: 'In the roller door, both switches are TRUE for a moment and then one of them goes back to FALSE. Why does the program of the example need the memory DoorFault?'
options:
  - { text: 'Because without it the motor would start again as soon as the contradiction went away', correct: true, feedback: 'Yes. The switches may only disagree for a moment, but one of them is still stuck, so the program must keep what it found.' }
  - { text: 'Because an output cannot depend on two inputs at once', feedback: 'An output can depend on any number of inputs. The motor already depends on Raise and IsOpen.' }
  - { text: 'Because the alarm needs a variable of its own', feedback: 'Alarm could copy any BOOL. The memory is there to remember the fault, not to light the lamp.' }
```

```quiz
question: 'BeamHigh has stuck on and the program has no diagnosis. A medium box, which breaks BeamLow only, arrives. Where does the sorter send it?'
options:
  - { text: 'To BinTall, because it sees both beams broken', correct: true, feedback: 'Right. A box that breaks both beams is tall, and the stuck beam makes every box that breaks BeamLow look tall.' }
  - { text: 'To BinMedium, because it only broke BeamLow', feedback: 'The program cannot know that the box did not break BeamHigh: the beam reads TRUE for every box.' }
  - { text: 'To BinShort, because the beam is faulty', feedback: 'A short box breaks neither beam. The program has no way to send a box to BinShort when it sees BeamLow on.' }
```

## What you will do in the practice

The starting program already sorts the boxes, and it trusts `BeamHigh` for ever. You will add a diagnosis. The scenario presses Start at {{t:200}} ms and triggers the fault action `stuckOn` on `BeamHigh` at {{t:21000}} ms. From then on the line must stop, and stay stopped, before the stuck beam sends a box to the wrong bin: the infeed and the chain module off, the blade still holding, Busy off, and the boxes already on their way still arriving. Then press {{ui:learn.check}}.
