## The machine

A layer palletizer builds a full layer of boxes on an infeed, squares them into a tight block, lifts the whole layer with a clamp head and stacks it on a pallet. Packing lines use this layout when boxes arrive in pairs and must leave on pallets in neat, repeated layers.

![The layer-palletizer scene seen from the front. On the left, an infeed belt carries boxes from two lane emitters past a start button and an optical sensor into a walled forming zone. Above the zone, a gantry frame carries a vertical clamp head across to a wooden pallet on the right, with a stack light beside the pallet. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has eight parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Emitter2`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EyeIn`       | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Palletizer1` | Layer palletizer       | A machine that squares boxes into a layer and sets the whole layer on a pallet.                               |
| `Pallet1`     | Pallet                 | A wooden pallet that carries a load through the plant and onto a truck.                                       |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `StackLight1` | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable     | Signal                   | Direction & type  | Meaning                                                    |
| ------------ | ------------------------ | ----------------- | ---------------------------------------------------------- |
| `Run`        | `Infeed.run`             | PLC output · BOOL | TRUE runs the belt forward.                                |
| `Emit1`      | `Emitter1.emit`          | PLC output · BOOL | Each rising edge releases one item onto the line.          |
| `Emit2`      | `Emitter2.emit`          | PLC output · BOOL | Each rising edge releases one item onto the line.          |
| `Eye`        | `EyeIn.detect`           | PLC input · BOOL  | TRUE while an object is in the beam.                       |
| `XMin`       | `Palletizer1.xAtMin`     | PLC input · BOOL  | TRUE when the X axis is at its start limit.                |
| `XMax`       | `Palletizer1.xAtMax`     | PLC input · BOOL  | TRUE when the X axis is at its end limit.                  |
| `YMin`       | `Palletizer1.yAtMin`     | PLC input · BOOL  | TRUE when the Y axis (up) is at its lowest.                |
| `YMax`       | `Palletizer1.yAtMax`     | PLC input · BOOL  | TRUE when the Y axis (up) is at its highest.               |
| `Squared`    | `Palletizer1.squared`    | PLC input · BOOL  | TRUE when the squaring pusher is closed.                   |
| `LayerReady` | `Palletizer1.layerReady` | PLC input · BOOL  | TRUE when a full layer of boxes rests in the forming zone. |
| `Gripped`    | `Palletizer1.gripped`    | PLC input · BOOL  | TRUE while the gripper holds an item.                      |
| `XPlus`      | `Palletizer1.xPlus`      | PLC output · BOOL | TRUE moves the X axis forward while it is held.            |
| `XMinus`     | `Palletizer1.xMinus`     | PLC output · BOOL | TRUE moves the X axis back while it is held.               |
| `YPlus`      | `Palletizer1.yPlus`      | PLC output · BOOL | TRUE moves the Y axis up while it is held.                 |
| `YMinus`     | `Palletizer1.yMinus`     | PLC output · BOOL | TRUE moves the Y axis down while it is held.               |
| `Square`     | `Palletizer1.square`     | PLC output · BOOL | TRUE closes the squaring pusher on the layer.              |
| `Grip`       | `Palletizer1.grip`       | PLC output · BOOL | TRUE closes the gripper (vacuum on, or jaws closed).       |
| —            | `Pallet1`                | —                 | Not wired to the PLC.                                      |
| `Start`      | `StartButton.pressed`    | PLC input · BOOL  | TRUE while the button is held down.                        |
| `Amber`      | `StackLight1.amber`      | PLC output · BOOL | TRUE lights the amber lamp.                                |
| `Green`      | `StackLight1.green`      | PLC output · BOOL | TRUE lights the green lamp.                                |

This palletizer has digital axes: limit switches (`XMin`, `XMax`, `YMin`, `YMax`) report only the two ends of each stroke, and jog outputs (`XPlus`, `XMinus`, `YPlus`, `YMinus`) move the head while held. There is no position sensor in between.

## Timed jogs from axis speed and pitch

When an axis has limit switches only at its ends, the program cannot read an intermediate height. To stop at a known distance below the top limit, you home the axis to the top limit first, hold the downward jog output for a calculated time `t`, and then wait for the head to coast to rest.

You do not need to find that time by trial. The machine's configuration gives the vertical stroke, the top speed `v`, the acceleration `a` and the item height (the pitch between layers). Two motion regimes relate the drive time `t` to the total distance `d` the axis travels from rest to rest:

- **Long jog (reaches top speed, `t >= v / a`).** The axis ramps up to `v`, cruises at `v`, and coasts to rest at the same rate `a` once the output turns off. The distance lost while accelerating equals the coasting distance while braking, so they cancel out: `d = v * t`, which gives `t = d / v`.
- **Short jog (never reaches top speed, `t < v / a`).** The axis accelerates for time `t` and coasts to rest for another time `t`, covering `0.5 * a * t * t` on each half. The total distance is `d = a * t * t`, which gives `t = sqrt(d / a)`.

In `Palletizer1`, the vertical axis has a `1.0 m` stroke, top speed `1.5 m/s` and acceleration `2 m/s²`, so reaching top speed takes `0.75 s`. Each standard box is `0.3 m` tall. From those numbers you can work out the distance from `YMax` to each layer and the jog time for each stop, then store the table of times in an `ARRAY` filled by one `FOR` loop so a single sequence handles every layer.

```timing
span: 2400
signals:
  - { name: AtTop, edges: [0, 200] }
  - { name: JogDown, edges: [200, 600] }
  - { name: Moving, edges: [200, 1000] }
  - { name: OpenClamp, edges: [1200, 2400] }
caption: A 400 ms jog on Palletizer1 comes to rest 800 ms after it starts, and only then does the clamp open
```

Notice the gap between `JogDown` turning off and `OpenClamp` turning on. Releasing the jog output only begins braking; the head is still moving until it comes to rest. On `Palletizer1` this 400 ms jog is a short jog, so the head needs another 400 ms to stop: it comes to rest 800 ms after the jog began (`d = 2 * 0.4 * 0.4 = 0.32 m`). The diagram shows an ideal jog of exactly 400 ms. In the simulator the output follows the program one scan (10 ms) late, so a jog set to `PT` lasts `PT + 10 ms` and the head stops a little further down.

## Worked example

A vertical rack loader has a digital lift with a top limit switch `TopSwitch`, a downward jog output `LiftDown`, top speed `1.0 m/s` and acceleration `4.0 m/s²`. Reaching top speed takes `1.0 / 4.0 = 0.25 s`. Four shelves sit below the top limit: shelf `0` is `0.40 m` down, and each next shelf is `0.25 m` further down (`0.40 m`, `0.65 m`, `0.90 m`, `1.15 m`).

Because every stop is at least `0.25 s`, the lift reaches top speed on every move, so `t = d / v` gives `400 ms` for shelf `0` plus `250 ms` per shelf. A `FOR` loop fills `DropMs` once on `StartLoad`, and the same three steps serve every shelf:

```st
PROGRAM RackLoader
VAR_INPUT
    StartLoad : BOOL;
    TopSwitch : BOOL;
    Shelf     : INT;
END_VAR
VAR_OUTPUT
    LiftDown : BOOL;
    AtShelf  : BOOL;
END_VAR
VAR
    Phase  : INT;
    DropMs : ARRAY[0..3] OF INT;
    k      : INT;
    Preset : TIME;
    MoveT  : TON;
    RestT  : TON;
END_VAR

IF Shelf >= 0 AND Shelf <= 3 THEN
    Preset := INT_TO_TIME(DropMs[Shelf]);
END_IF;

MoveT(IN := Phase = 1, PT := Preset);
RestT(IN := Phase = 2, PT := T#400ms);

CASE Phase OF
    0:
        IF StartLoad AND TopSwitch THEN
            FOR k := 0 TO 3 DO
                DropMs[k] := 400 + 250 * k;
            END_FOR;
            Phase := 1;
        END_IF;
    1:
        IF MoveT.Q THEN
            Phase := 2;
        END_IF;
    2:
        IF RestT.Q THEN
            Phase := 3;
        END_IF;
END_CASE;

LiftDown := Phase = 1 AND NOT MoveT.Q;
AtShelf  := Phase = 3;
END_PROGRAM
```

The guard `IF Shelf >= 0 AND Shelf <= 3` keeps the array index inside bounds on every scan. `INT_TO_TIME` turns the millisecond integer into a `TIME` preset for `MoveT`, and `RestT` waits for the lift to finish braking before `AtShelf` turns on.

This loader adds time for each deeper shelf and moves one axis only. In the palletizer of the practice, each higher layer sits closer to `YMax`, the first layer uses `YMin` instead of a timer, and the head also loads pairs, squares the block, grips, travels in X and returns.

## Common mistakes

- Opening the clamp as soon as the jog timer ends. The head is still coasting to rest and drops the layer.
- Starting a timed jog from an unknown height. Always reference the axis against a limit switch (`YMax`) before timing a move.
- Indexing an array without checking its upper bound. When the layer counter reaches `3` after the last layer, reading `JogMs[3]` goes past `ARRAY[0..2]`.
- Moving the head while the squaring pusher is still extended. Wait for `Squared` to turn FALSE before lowering the clamp.

> [!NOTE]
> Timed jogs are open-loop: if the axis speed or load changes, the stopping height shifts. When a machine has position feedback, closed-loop numeric commands avoid that drift, which is what the next lesson uses.

## Check yourself

```quiz
question: A digital axis has top speed 1.0 m/s and acceleration 4.0 m/s² (ramp time 0.25 s). Starting from rest at the top limit, how long must the jog output stay TRUE to travel 0.50 m?
options:
  - { text: '500 ms', correct: true, feedback: 'Yes. Because 0.50 s is longer than the 0.25 s ramp time, acceleration and braking cancel out and t = d / v = 0.50 / 1.0 = 0.50 s.' }
  - { text: '250 ms', feedback: '250 ms is only the ramp time; at 1.0 m/s that covers 0.25 m, half the required distance.' }
  - { text: '1000 ms', feedback: 'Holding the output for 1.0 s at 1.0 m/s would travel 1.0 m, twice as far as needed.' }
```

```quiz
question: Why does the program wait in a settle step after the downward jog timer finishes, before opening the clamp?
options:
  - { text: 'Because the axis still coasts to rest after the jog output turns off', correct: true, feedback: 'Right. Releasing the jog starts deceleration; opening the clamp while the head is moving can drop the boxes.' }
  - { text: 'Because TON timers cannot reset in the same scan they finish', feedback: 'A TON resets as soon as its IN input goes FALSE; the wait is for the mechanical axis, not the timer.' }
  - { text: 'Because the clamp output is ignored while YMax is FALSE', feedback: 'The clamp responds to Grip at any height; the pause ensures the head has stopped moving first.' }
```

## What you will do in the practice

The starting program in `src/LayerPalletizer.st` declares the inputs, outputs and the array `JogMs`, and drives nothing. On `Start`, which the scenario presses at {{t:200}} ms, you will fill `JogMs` with a `FOR` loop, then load pairs of boxes, square each layer, carry it to the pallet and stack three layers of four boxes before lighting `Green`. Then press {{ui:learn.check}}.
