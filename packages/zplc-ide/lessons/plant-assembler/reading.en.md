## The machine

This station joins two parts into one: a lid arrives on the left belt, a base arrives on the middle belt, and a two-axis pick-and-place unit lifts the lid with a vacuum pad and sets it onto the base. Once the lid is in place, the stop blade on the base belt opens and the finished assembly rides out onto the exit belt to the remover.

![The two-axis assembly scene seen from the front. Three belt conveyors stand in a line from left to right: LidBelt with LidEmitter, LidBlade and LidEye on the left; BaseBelt with BaseEmitter, BaseBlade and BaseEye in the middle; and ExitBelt ending at Remover1 on the right. A two-axis pick-and-place frame, Pick1, bridges LidBelt and BaseBelt. StartButton sits behind LidBelt and StackLight1 stands beside ExitBelt. Each part has a label with its name, its kind and its wired signals.](images/machine.en.png)

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

## One step per move, and a branch on a count

A handling unit with two axes must never cross from one belt to another while lowered, or it will strike the parts and the blades. In a sequential function chart, the cleanest way to enforce that order is to give each move its own step and make its transition wait for the limit switch at the end of that move.

- **One move per step:** a vertical move runs until `YAtMin` or `YAtMax` is TRUE; a horizontal move runs only after the vertical axis is up and waits for `XAtMin` or `XAtMax`.
- **Every step writes every output:** an `N` action runs while its step is active, and outputs keep their last value when a step ends. Writing all outputs in each step's `N` action guarantees that no direction command, vacuum valve or emitter pulse stays stuck on.
- **Counting once with `P1`:** an `N` action runs on every scan while the step is active, so adding 1 to a counter inside an `N` action would count scans instead of cycles. A `P1` action (pulse on entry) runs on the single scan the step becomes active, so it increments the counter once per cycle.
- **Branching with exclusive transitions:** when a step can lead to two different next steps—for example, loop back for another cycle or stop at a finished step—the outgoing transitions carry conditions that exclude each other, or priorities that pick the narrower condition first.

## Worked example

Consider a single-axis dipping hoist over a cleaning tank. A press of `RunBtn` lowers a basket into the bath, soaks it for five seconds, lifts it back out, and repeats the dip **two** times before lighting `DoneLamp`. The inputs are `RunBtn`, `AtTop` and `AtBottom`; the outputs are `GoUp`, `GoDown` and `DoneLamp`; a local integer `Dips` starts at `0`.

The chart needs five steps:

1. `WAIT` (initial): `N` action writes `GoUp := FALSE; GoDown := FALSE; DoneLamp := FALSE;`. Transition to `LOWER`: `RunBtn`.
2. `LOWER`: `N` action writes `GoUp := FALSE; GoDown := NOT AtBottom; DoneLamp := FALSE;`. Transition to `SOAK`: `AtBottom`.
3. `SOAK`: `N` action turns all three outputs FALSE, and a `P1` action writes `Dips := Dips + 1;`. Transition to `LIFT`: `SOAK.T >= T#5s`.
4. `LIFT`: `N` action writes `GoUp := NOT AtTop; GoDown := FALSE; DoneLamp := FALSE;`. Two outgoing transitions leave `LIFT`:
   - To `DONE` (priority 1): `AtTop AND Dips >= 2`
   - Back to `LOWER` (priority 2): `AtTop AND Dips < 2`
5. `DONE`: `N` action writes `GoUp := FALSE; GoDown := FALSE; DoneLamp := TRUE;`.

```timing
span: 20000
signals:
  - { name: RunBtn, edges: [500, 1000] }
  - { name: LOWER, edges: [500, 2500, 9500, 11500] }
  - { name: SOAK, edges: [2500, 7500, 11500, 16500] }
  - { name: LIFT, edges: [7500, 9500, 16500, 18500] }
  - { name: DONE, edges: [18500, 20000] }
marks:
  - { from: 2500, to: 7500, label: 'Dips = 1' }
  - { from: 11500, to: 16500, label: 'Dips = 2' }
caption: The P1 action in SOAK increments Dips once per cycle, and the branch after LIFT chooses LOWER or DONE
```

Notice two details. First, `SOAK` increments `Dips` with `P1`, so during the five-second soak `Dips` increases once, not on every scan. Second, the two transitions leaving `LIFT` exclude each other: while `Dips` is 1, only the transition back to `LOWER` can fire; once `Dips` is 2, only the transition to `DONE` can fire.

The dipping hoist has only one axis and no parts to feed, hold or grip. In the practice you must also coordinate two axes without crossing while lowered, handle the vacuum grip and release, and time the emitters and stop blades so each pair arrives, is assembled and leaves cleanly.

## Common mistakes

- Incrementing a cycle counter inside an `N` action instead of a `P1` action. The counter climbs on every scan while the step is active and reaches the target on the first cycle.
- Leaving an output unwritten in a step's `N` action. A direction command, emitter pulse or vacuum output stays TRUE after the step ends.
- Starting a horizontal move before the vertical axis has reached its upper limit switch. The pad sweeps across the belts while down and knocks parts off.
- Releasing a held part on the belt before the gripper has let go, or closing a stop blade again while an exiting part is still in front of its sensor.
- Giving a branching step two transitions whose conditions can both be TRUE without a clear priority, or forgetting the branch that loops back for the next cycle.

> [!NOTE]
> A `P1` action runs once when its step becomes active, even if the step stays active for several seconds. If you want to count completed cycles, attach the `P1` action to a step that is entered exactly once per cycle.

## Check yourself

```quiz
question: In the dipping hoist, what would happen if Dips := Dips + 1; were placed in the N action of SOAK instead of a P1 action?
options:
  - { text: 'Dips would increase on every scan during the soak, so the chart would finish after one dip', correct: true, feedback: 'Yes. An N action runs on every scan while the step is active; P1 runs only on the scan the step becomes active.' }
  - { text: 'Dips would never change because N actions cannot write local variables', feedback: 'An N action can write local variables; the problem is that it runs on every scan, not once.' }
  - { text: 'The chart would stay in SOAK forever', feedback: 'The transition out of SOAK depends on SOAK.T, so it would still leave, but Dips would already be far above 2.' }
```

```quiz
question: In the dipping hoist, LIFT is active after the first soak (Dips = 1) and AtTop becomes TRUE. Which step becomes active on the next scan?
options:
  - { text: 'LOWER, because AtTop AND Dips < 2 is TRUE and AtTop AND Dips >= 2 is FALSE', correct: true, feedback: 'Right. The two conditions exclude each other, so Dips = 1 sends the chart back to LOWER for the second dip.' }
  - { text: 'DONE, because DONE has priority 1', feedback: 'Priority only breaks ties when two conditions are both TRUE. Here Dips >= 2 is FALSE.' }
  - { text: 'Both LOWER and DONE at the same time', feedback: 'Their conditions exclude each other, so only one transition fires.' }
```

## What you will do in the practice

The starting chart in `src/Assembler.sfc.json` has only `IDLE` and `HOMING`, so after homing the pad waits forever and no parts are fed. You will expand the chart to feed lids and bases, coordinate both axes and the vacuum pad to assemble three pairs, let each finished assembly run out onto the exit belt, and light `Green` when all three are done. Save your chart and press {{ui:learn.check}}.
