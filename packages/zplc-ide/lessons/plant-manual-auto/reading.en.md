## The machine

This station joins two parts into one: a lid arrives on the left belt, a base arrives on the middle belt, and a two-axis pick-and-place unit lifts the lid with a vacuum pad and sets it onto the base. Once the lid is in place, the stop blade on the base belt opens and the finished assembly rides out onto the exit belt to the remover.

![The two-axis assembly scene seen from the front. Three belt conveyors stand in a line from left to right: LidBelt with LidEmitter, LidBlade and LidEye on the left; BaseBelt with BaseEmitter, BaseBlade and BaseEye in the middle; and ExitBelt ending at Remover1 on the right. A two-axis pick-and-place frame, Pick1, bridges LidBelt and BaseBelt. StartButton sits behind LidBelt and StackLight1 stands beside ExitBelt. Each part has a label with its name, its kind and its wired signals.](images/machine.en.png)

The image and the tables show thirteen of its parts. The tables say what each one is in a real plant and what its signals mean to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

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

| Variable    | Signal                | Direction & type  | Meaning                                                 |
| ----------- | --------------------- | ----------------- | ------------------------------------------------------- |
| `RunLid`    | `LidBelt.run`         | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunBase`   | `BaseBelt.run`        | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunExit`   | `ExitBelt.run`        | PLC output · BOOL | TRUE runs the belt forward.                             |
| `EmitLid`   | `LidEmitter.emit`     | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `EmitBase`  | `BaseEmitter.emit`    | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `HoldLid`   | `LidBlade.extend`     | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `HoldBase`  | `BaseBlade.extend`    | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `LidReady`  | `LidEye.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `BaseReady` | `BaseEye.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `XAtMin`    | `Pick1.xAtMin`        | PLC input · BOOL  | TRUE when the X axis is at its start limit.             |
| `XAtMax`    | `Pick1.xAtMax`        | PLC input · BOOL  | TRUE when the X axis is at its end limit.               |
| `YAtMin`    | `Pick1.yAtMin`        | PLC input · BOOL  | TRUE when the Y axis (up) is at its lowest.             |
| `YAtMax`    | `Pick1.yAtMax`        | PLC input · BOOL  | TRUE when the Y axis (up) is at its highest.            |
| `Gripped`   | `Pick1.gripped`       | PLC input · BOOL  | TRUE while the gripper holds an item.                   |
| `XPlus`     | `Pick1.xPlus`         | PLC output · BOOL | TRUE moves the X axis forward while it is held.         |
| `XMinus`    | `Pick1.xMinus`        | PLC output · BOOL | TRUE moves the X axis back while it is held.            |
| `YPlus`     | `Pick1.yPlus`         | PLC output · BOOL | TRUE moves the Y axis up while it is held.              |
| `YMinus`    | `Pick1.yMinus`        | PLC output · BOOL | TRUE moves the Y axis down while it is held.            |
| `Grip`      | `Pick1.grip`          | PLC output · BOOL | TRUE closes the gripper (vacuum on, or jaws closed).    |
| —           | `Remover1`            | —                 | Not wired to the PLC.                                   |
| `Start`     | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                     |
| `Green`     | `StackLight1.green`   | PLC output · BOOL | TRUE lights the green lamp.                             |
| `Amber`     | `StackLight1.amber`   | PLC output · BOOL | TRUE lights the amber lamp.                             |

Notice how `Pick1` is driven in this scene: four direction outputs (`XPlus`, `XMinus`, `YPlus`, `YMinus`) move the axes while TRUE, and four limit switches (`XAtMin`, `XAtMax`, `YAtMin`, `YAtMax`) report when an axis has reached either end.

The station of this lesson has five more push buttons on its panel, which the image and the tables above do not show. Like `StartButton`, each one is TRUE only while a finger holds it. `ModeBtn` is wired to `ModeButton.pressed`. The four jog buttons are `JogXPlus` (toward the base belt), `JogXMinus` (toward the lid belt), `JogYPlus` (up) and `JogYMinus` (down), wired to the signals `JogXPlus.pressed`, `JogXMinus.pressed`, `JogYPlus.pressed` and `JogYMinus.pressed`.

In the run of the solution, the three assemblies take about 32 s, from the Start press to the green lamp.

## Two modes, two kinds of press

A machine like this runs on its own in **automatic**: the program drives the cycle, and a press of Start begins it. But an operator sometimes has to move the pad by hand, for example to put it where a person can reach it. For that the machine has a **manual** mode. There, a **jog** button moves one axis only while the button is held: the pad stops when the finger lifts, and when the axis reaches its limit switch.

So the same panel carries two kinds of press. A jog is a press that lasts as long as the finger does. A mode change is a press that must count once, however long the finger stays down. A button gives the program the same signal for both, so the program has to treat them differently.

## A press lasts many scans

The program runs one scan every 0.01 s in the scenario of this lesson, a hundred scans a second. A finger holds a button for a fraction of a second: the scenario of this lesson holds the mode button for 0.4 s, which is about 40 scans. A statement written for "the button is TRUE" runs on every one of them.

A **rising edge** is the scan in which an input has just gone from FALSE to TRUE. It lasts one scan, however long the button stays down. In Structured Text, an `R_TRIG` function block gives it: you call it with the input on `CLK`, and its output `Q` is TRUE for that one scan.

```timing
span: 600
signals:
  - { name: Button, edges: [100, 500] }
  - { name: Edge, edges: [100, 110] }
caption: A press of 0.4 s lasts about 40 scans; its rising edge lasts one scan
```

When something must happen once per press, drive it from the edge. When something must last while the button is held, drive it from the button itself.

## Worked example

A ticket machine at a car-park barrier has a button `Take` and a sensor `Empty` that is TRUE when the roll has run out. A press of `Take` must release exactly one ticket, however long the driver keeps the button down. When the roll is empty, the press must do nothing. The program also counts the tickets it has released.

```st
PROGRAM TicketMachine
VAR_INPUT Take : BOOL; Empty : BOOL; END_VAR
VAR_OUTPUT Release : BOOL; END_VAR
VAR TakeEdge : R_TRIG; Given : INT; END_VAR
TakeEdge(CLK := Take);
Release := TakeEdge.Q AND NOT Empty;
IF Release THEN Given := Given + 1; END_IF;
END_PROGRAM
```

Read it from the top. `TakeEdge` is called on every scan with the button on `CLK`. Its `Q` is TRUE on the one scan in which `Take` rises, so `Release` is TRUE for one scan and `Given` goes up by one. Hold `Take` for 0.4 s with `Empty` FALSE: `Release` is TRUE on a single scan and `Given` is 1. Press again with `Empty` TRUE: `Release` stays FALSE and `Given` stays 1.

This machine has one button and one meaning for it. The station of the practice has several buttons and not every press means the same thing, so which signal does what is for you to decide from how the machine must behave.

## Common mistakes

- Driving a job that must happen once from the level of the button. If `Release` were `Take AND NOT Empty`, it would be TRUE on every scan of the press, and in the run a press of 0.4 s counted 40 tickets instead of one.
- Driving a job that must last while the button is held from its edge. The edge lasts one scan, so the output would last one scan too, not as long as the finger.
- Letting Start act in every mode. In the starting program, a Start press while the machine is in manual starts the cycle at once: in the scenario, when Start is pressed at 5.2 s, the belts run and a lid and a base are put on their belts.

> [!NOTE]
> A real manual mode also limits the speed of a jog. Here the pad always moves at the speed the scene gives it, 0.4 m/s, so the speed is not part of the practice.

## Check yourself

```quiz
question: In the ticket machine, Take is held for 0.4 s while Empty is FALSE. How many tickets does Release count?
options:
  - { text: 'One', correct: true, feedback: 'Yes. The rising edge lasts one scan, so Release is TRUE once and Given goes up by one.' }
  - { text: 'About 40, one for every scan of the press', feedback: 'That would happen if Release followed the button itself. It follows the rising edge, which lasts one scan.' }
  - { text: 'None, because Take never changes', feedback: 'Take goes from FALSE to TRUE when the button is pressed. That change is the rising edge.' }
```

```quiz
question: After the first ticket, the roll runs out and Empty becomes TRUE. The driver presses Take again. What happens?
options:
  - { text: 'Release stays FALSE and Given stays 1', correct: true, feedback: 'Right. The edge is there, but AND NOT Empty keeps Release FALSE.' }
  - { text: 'Release is TRUE for one scan and Given becomes 2', feedback: 'Empty is TRUE, so NOT Empty is FALSE and Release stays FALSE even on the scan of the edge.' }
  - { text: 'Release stays TRUE for as long as the button is held', feedback: 'Release never follows the button. It follows the edge, and Empty blocks that too.' }
```

## What you will do in the practice

The starting program already runs the automatic assembly cycle, and it has no mode. You will add one. The machine powers up in manual, and each press of the mode button switches between manual and automatic. In manual, the jog buttons move the pad and Start does nothing; in automatic, the cycle runs and the jog buttons do nothing. The scenario presses the mode button at {{t:13200}} ms, starts the cycle at {{t:13800}} ms, holds a jog button down in the middle of the cycle, and presses the mode button again at {{t:54000}} ms. Then press {{ui:learn.check}}.
