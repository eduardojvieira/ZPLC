## The machine

This station moves boxes across a gap between two conveyors. Boxes arrive on the infeed belt on the left, where a raised stop blade holds each box under a two-axis pick-and-place gantry. The gantry lowers a clamp, grips the box, lifts it, carries it across to the outfeed belt on the right, and sets it down so the outfeed can carry it to the remover bin. Real packing and assembly lines use stations like this whenever a product must cross an aisle, change height, or move from one line to another.

![The belt-to-belt-transfer scene seen from the front. On the left, an infeed belt conveyor on legs has four cyan corner marks where Source1 places boxes, StartButton behind its left end, a stop blade Stop1 near its right end, and a diffuse optical sensor EyePick looking across the belt. Spanning the gap between the two belts stands Pick1, a two-axis gantry with a vertical carriage and clamp. On the right, an outfeed belt conveyor carries boxes past a sensor EyeOut and a stack light Beacon into the bin Remover1. Each part has a label with its name, its kind and its wired signals.](images/machine.en.png)

The station has ten parts. The tables say what each one is in a real plant and what its signals mean to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                    | What it is in a real plant                                                                                    |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor           | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Outfeed`     | Belt conveyor           | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter            | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Stop1`       | Stop blade              | A plate that rises across the belt to hold items back until they are let through.                             |
| `EyePick`     | Diffuse optical sensor  | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeOut`      | Diffuse optical sensor  | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Pick1`       | Two-axis pick and place | A two-axis handling unit that picks an item up with a gripper and sets it down somewhere else.                |
| `Remover1`    | Item remover            | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button             | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `Beacon`      | Stack light             | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable  | Signal                | Direction & type  | Meaning                                                 |
| --------- | --------------------- | ----------------- | ------------------------------------------------------- |
| `RunIn`   | `Infeed.run`          | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunOut`  | `Outfeed.run`         | PLC output · BOOL | TRUE runs the belt forward.                             |
| `Emit`    | `Source1.emit`        | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `Hold`    | `Stop1.extend`        | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `Waiting` | `EyePick.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `OutEye`  | `EyeOut.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `XMin`    | `Pick1.xAtMin`        | PLC input · BOOL  | TRUE when the X axis is at its start limit.             |
| `XMax`    | `Pick1.xAtMax`        | PLC input · BOOL  | TRUE when the X axis is at its end limit.               |
| `YMin`    | `Pick1.yAtMin`        | PLC input · BOOL  | TRUE when the Y axis (up) is at its lowest.             |
| `YMax`    | `Pick1.yAtMax`        | PLC input · BOOL  | TRUE when the Y axis (up) is at its highest.            |
| `Gripped` | `Pick1.gripped`       | PLC input · BOOL  | TRUE while the gripper holds an item.                   |
| `XPlus`   | `Pick1.xPlus`         | PLC output · BOOL | TRUE moves the X axis forward while it is held.         |
| `XMinus`  | `Pick1.xMinus`        | PLC output · BOOL | TRUE moves the X axis back while it is held.            |
| `YPlus`   | `Pick1.yPlus`         | PLC output · BOOL | TRUE moves the Y axis up while it is held.              |
| `YMinus`  | `Pick1.yMinus`        | PLC output · BOOL | TRUE moves the Y axis down while it is held.            |
| `Grip`    | `Pick1.grip`          | PLC output · BOOL | TRUE closes the gripper (vacuum on, or jaws closed).    |
| —         | `Remover1`            | —                 | Not wired to the PLC.                                   |
| `Start`   | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                     |
| `Busy`    | `Beacon.amber`        | PLC output · BOOL | TRUE lights the amber lamp.                             |
| `Done`    | `Beacon.green`        | PLC output · BOOL | TRUE lights the green lamp.                             |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program never sees a box directly: it knows only what the optical sensors, the axis limit switches, and the grip feedback report.

## One state per move, driven by feedback

A manipulator cannot work by guesswork or fixed delays alone. An axis takes time to travel from one end to the other, and a gripper takes time to close around an item. If the program starts lifting before the gripper reports that the item is held, the item stays behind. On a real machine, moving sideways before the vertical axis reaches its upper limit drives the item into the stop blade or the belt; this scene does not model that collision, so only your sequence keeps the clamp up while it crosses.

The clean way to coordinate moves is a **state machine**: an `INT` variable holds the current state number, and each move has its own state. A `CASE` block checks only the transition that leaves the current state, waiting for the feedback signal of that move — a limit switch, a grip confirmation, or a timer — before advancing to the next state.

```timing
span: 6000
signals:
  - { name: Lock, edges: [500, 5000] }
  - { name: Locked, edges: [900, 5400] }
  - { name: GoDown, edges: [900, 2000] }
  - { name: Bottom, edges: [2000, 4100] }
  - { name: GoUp, edges: [4000, 5000] }
  - { name: Top, edges: [0, 1000, 5000, 6000] }
marks:
  - { from: 2000, to: 4000, label: Soak }
caption: Each move starts only after the previous feedback turns on, and stops as soon as its own limit turns on
```

Outputs are best computed in one place below the `CASE` block, straight from the state number and the limit switches. Then every output is written on every scan: it is TRUE in the states that need it and FALSE in every other state, with no forgotten resets.

## Worked example

A heat-treatment station dips metal parts into a quench tank with a single-axis hoist. When a part hangs on the hook (`PartReady`) and the hoist is at the top (`Top`), the program closes the hook latch (`Lock`) and waits for `Locked`. Only then does it lower the hoist (`GoDown`) until `Bottom` turns on, soak the part for two seconds (`Soak`), lift back to `Top`, and open the latch. The tank heater (`HeaterOn`) runs only while the hoist is idle at the top, never while a part is moving or submerged.

```st
PROGRAM DipHoist
VAR_INPUT
    PartReady : BOOL;
    Locked    : BOOL;
    Bottom    : BOOL;
    Top       : BOOL;
END_VAR
VAR_OUTPUT
    Lock     : BOOL;
    GoDown   : BOOL;
    GoUp     : BOOL;
    HeaterOn : BOOL;
END_VAR
VAR
    Step : INT;
    Soak : TON;
END_VAR

Soak(IN := Step = 3, PT := T#2s);

CASE Step OF
    0:
        IF PartReady AND Top THEN
            Step := 1;
        END_IF;
    1:
        IF Locked THEN
            Step := 2;
        END_IF;
    2:
        IF Bottom THEN
            Step := 3;
        END_IF;
    3:
        IF Soak.Q THEN
            Step := 4;
        END_IF;
    4:
        IF Top THEN
            Step := 5;
        END_IF;
    5:
        IF NOT Locked THEN
            Step := 0;
        END_IF;
END_CASE;

Lock     := Step >= 1 AND Step <= 4;
GoDown   := Step = 2 AND NOT Bottom;
GoUp     := Step = 4 AND NOT Top;
HeaterOn := Step = 0;
END_PROGRAM
```

Read it from the top. `Soak` is called on every scan, outside the `CASE`, with `IN := Step = 3`, so it times only while the hoist is in the soak state and resets itself as soon as `Step` leaves 3. Inside the `CASE`, each state waits for one confirmation: `Locked` before lowering, `Bottom` before soaking, `Soak.Q` before lifting, `Top` before opening the latch, and `NOT Locked` before returning to idle. Below the `CASE`, `Lock` stays on from state 1 through state 4, each axis command stops as soon as its limit switch turns on (`AND NOT Bottom`, `AND NOT Top`), and `HeaterOn` is off for every active state.

This hoist has only one vertical axis and dips one part per start. The station of the practice has two axes, two belts, a stop blade, and a batch of four boxes: when to let a box settle, when to feed the next box, and how to count the four boxes are decisions left for you.

## Common mistakes

- Lifting before grip feedback is TRUE. Turning `Grip` on starts closing the clamp; wait for `Gripped` before commanding `YPlus`, or the box is left behind.
- Moving horizontally while the clamp is still down. Always wait for `YMax` before moving across between the two belts.
- Leaving the receiving belt running while setting a box down. A moving belt carries the box away before it settles; the scene counts it as dropped.
- Assigning outputs inside only one `CASE` branch. A variable keeps its previous value on later scans unless another statement clears it; compute every output from the state below the `CASE`.
- Calling a `TON` timer inside a `CASE` branch. A timer that is only called in one state stops updating when the state changes and may never reset; call every timer unconditionally on every scan and gate its `IN` with the state.

> [!NOTE]
> An axis command such as `XPlus` or `YMinus` moves the carriage only while the output is TRUE. Guarding it with `AND NOT XMax` or `AND NOT YMin` ensures the command drops in the exact scan the limit switch turns on.

## Check yourself

```quiz
question: Why does the dipping hoist wait for Locked in state 1 before moving to state 2?
options:
  - { text: 'Because closing the latch takes time, and lowering before Locked could drop the part', correct: true, feedback: 'Yes. Command and confirmation are two separate signals; the next move waits for the feedback.' }
  - { text: 'Because a PLC cannot turn Lock and GoDown on in the same program', feedback: 'A PLC can drive several outputs at once. The sequence waits so the mechanical latch is closed before the hoist moves.' }
  - { text: 'Because Locked is a PLC output that must be written first', feedback: 'Locked is a PLC input from the latch sensor, not an output.' }
```

```quiz
question: In the dipping hoist, GoDown is written as Step = 2 AND NOT Bottom. What happens in the scan when Bottom becomes TRUE?
options:
  - { text: 'Step changes to 3 and GoDown turns FALSE in that same scan', correct: true, feedback: 'Right. The CASE advances Step to 3, and the output line below evaluates to FALSE immediately.' }
  - { text: 'GoDown stays TRUE for one extra scan until Step reaches 4', feedback: 'Because the output assignments sit below the CASE, they see the new Step and Bottom right away.' }
  - { text: 'Soak finishes immediately because Bottom is TRUE', feedback: 'Soak only starts timing when Step becomes 3; it still waits two seconds before Soak.Q turns TRUE.' }
```

## What you will do in the practice

The starting program in `src/BeltTransfer.st` declares all inputs and outputs of the station and drives nothing. The scenario presses `Start` at {{t:200}} ms and releases it at {{t:400}} ms. You will write the state machine that feeds four boxes one at a time, holds each at the blade, picks and places it onto the stopped outfeed belt, lights `Busy` while the transfer runs, and lights `Done` after the fourth box crosses `EyeOut`. Save the file and press {{ui:learn.check}}.
