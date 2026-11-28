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

## A Ladder state machine with EQ and MOVE

When a sequence has many moves, an integer `State` variable is easier to manage than a dozen separate step bits: an `INT` holds only one number at a time, so two states can never be active together.

In Ladder, each transition is one rung: an `EQ` box checks the current state number, contacts in series check the feedback signal (such as a limit switch or grip confirmation), and a `MOVE` box writes the next state number into the same `INT` variable. Because `MOVE` runs only while its rung has power, several transition rungs may write to the same state variable.

Put the transition rungs in **reverse order** (highest state at the top, lowest state at the bottom). Because Ladder solves rungs from top to bottom, reversing them ensures that changing from state 1 to state 2 cannot trigger the state 2 rung in the same scan. Below the transitions, one output rung per coil uses `EQ` (or `GE` and `LE` in series for a range of states) and a normally closed limit contact to drive each actuator cleanly.

## Worked example

A single-axis dipping hoist lowers metal parts into a quench tank, soaks them for two seconds, and lifts them back out. `Step` is an `INT` (0 idle, 1 lock hook, 2 lower, 3 soak, 4 lift, 5 unlock). Rung 6 shows a typical transition: while `Step` is 1 and `Locked` is on, `MOVE` writes 2 into `Step` so lowering can begin.

```ld-figure
src: reading/dip-hoist.ld.json
rung: 6
caption: 'Transition from step 1 to step 2: EQ checks the current step, Locked confirms the latch, and MOVE advances Step'
```

Rung 8 shows an output that spans several states: `GE(Step, 1)` and `LE(Step, 4)` in series keep `Lock` energized from locking through lifting, and release it automatically in step 5.

```ld-figure
src: reading/dip-hoist.ld.json
rung: 8
caption: 'A range of states in Ladder: GE and LE in series drive one Lock coil across steps 1 to 4'
```

Try the dipping hoist in the lab. Turn `Top` on first, press `PartReady` once, then switch `Locked` on to start lowering (`GoDown`), switch `Top` off as the hoist leaves the top and `Bottom` on to soak for two seconds; then switch `Bottom` off, watch `GoUp` turn on, and switch `Top` on again: `GoUp` stops, `Lock` opens, and switching `Locked` off returns `Step` to 0.

```ld-try
src: reading/dip-hoist.ld.json
inputs:
  - { name: PartReady, kind: push }
  - { name: Top, kind: switch }
  - { name: Locked, kind: switch }
  - { name: Bottom, kind: switch }
outputs: [Lock, GoDown, GoUp]
timing: [PartReady, Lock, GoDown, GoUp]
caption: Follow each step by turning on the feedback switch for the move in progress
```

This hoist has one vertical axis and dips one part at a time. The station of the practice has two axes, two belts, a stop blade, and a batch of four boxes: when to let a box settle, when to feed each box, and how to count four boxes are decisions left for you.

## Common mistakes

- Putting transition rungs in forward order (0, 1, 2, ...). If two conditions are true on the same scan, the program skips straight across two states in one scan; put transitions in reverse order.
- Driving the same output coil on two rungs. ZPLC refuses a duplicate coil; combine all states that need an actuator onto one rung with parallel branches or a `GE`/`LE` range.
- Lifting before `Gripped` is TRUE or moving sideways before `YMax` is TRUE. Always put the feedback contact of the previous move in series with `EQ` on the transition rung.
- Leaving `Outfeed` running while setting a box down. Keep `RunOut` off during the placing and settling states so the box rests before the belt moves.
- Forgetting a normally closed limit contact on an axis coil. Without `NC` of the limit switch, the axis keeps driving against its end while the state waits for something else.

## Check yourself

```quiz
question: Why are the transition rungs of an EQ/MOVE state machine placed in reverse state order in Ladder?
options:
  - { text: 'So that advancing Step in one rung cannot fire the next state rung in the same scan', correct: true, feedback: 'Yes. Because rungs run top to bottom, putting higher states first guarantees at most one transition per scan.' }
  - { text: 'Because MOVE boxes only work when their numbers decrease', feedback: 'MOVE writes any number in any order; the reverse rung order controls scan-cycle evaluation.' }
  - { text: 'Because EQ boxes cannot read Step more than once per scan', feedback: 'Any number of EQ boxes can read Step in the same scan.' }
```

```quiz
question: In the dipping hoist, why does rung 8 use GE(Step, 1) and LE(Step, 4) in series to drive Lock?
options:
  - { text: 'To keep one single Lock coil energized across steps 1 through 4 and off in steps 0 and 5', correct: true, feedback: 'Right. One coil per output variable is required in Ladder, and GE/LE covers the whole range cleanly.' }
  - { text: 'To write the numbers 1 and 4 into Step at the same time', feedback: 'GE and LE are comparisons, not writes; they only test Step.' }
  - { text: 'To prevent Lock from turning on when Locked is FALSE', feedback: 'Lock must turn on in step 1 while Locked is still FALSE so that the latch can close.' }
```

## What you will do in the practice

The starting diagram in `src/BeltTransfer.ld.json` declares all inputs and outputs of the station and has no rungs yet. The scenario presses `Start` at {{t:200}} ms and releases it at {{t:400}} ms. You will build the `EQ`/`MOVE` state machine that feeds four boxes one at a time, holds each at the blade, picks and places it onto the stopped outfeed belt, lights `Busy` while the transfer runs, and lights `Done` after the fourth box crosses `EyeOut`. Save the file and press {{ui:learn.check}}.
