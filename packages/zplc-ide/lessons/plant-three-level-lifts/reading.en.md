## The machine

This is a goods line that climbs. A box enters at the lowest level, lift A raises it to level 2, a transfer belt carries it to lift B, lift B raises it to level 3, and an outfeed belt delivers it to a bin. Warehouses and factories with several floors move goods like this, one lift for each climb.

![The three-level-lifts scene seen from the front, rising from left to right: an infeed belt at the lowest level, lift A, a transfer belt at the second level, lift B, and an outfeed belt at the third level that ends at a bin. The start button, the emergency stop, a stack light, the box source and three sensors are marked. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The line has thirteen parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `LiftA`       | Lift                   | A vertical conveyor that carries an item between floors or levels of a line.                                  |
| `Transfer`    | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `LiftB`       | Lift                   | A vertical conveyor that carries an item between floors or levels of a line.                                  |
| `Outfeed`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `TopBin`      | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `EyeFoot`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeMid`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeTop`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `EStop1`      | Emergency stop         | The red mushroom button that stops the machine; it stays in until someone twists it to release it.            |
| `StackLight1` | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable      | Signal                | Direction & type  | Meaning                                                                                                      |
| ------------- | --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `RunInfeed`   | `Infeed.run`          | PLC output · BOOL | TRUE runs the belt forward.                                                                                  |
| —             | `Source1`             | —                 | Not wired to the PLC.                                                                                        |
| `AAtLow`      | `LiftA.atLevel1`      | PLC input · BOOL  | TRUE when the platform stands at level 1.                                                                    |
| `AAtHigh`     | `LiftA.atLevel2`      | PLC input · BOOL  | TRUE when the platform stands at level 2.                                                                    |
| `AUp`         | `LiftA.up`            | PLC output · BOOL | TRUE moves the platform up.                                                                                  |
| `ADown`       | `LiftA.down`          | PLC output · BOOL | TRUE moves the platform down.                                                                                |
| `ARun`        | `LiftA.run`           | PLC output · BOOL | TRUE runs the platform's belt forward.                                                                       |
| `RunTransfer` | `Transfer.run`        | PLC output · BOOL | TRUE runs the belt forward.                                                                                  |
| `BAtLow`      | `LiftB.atLevel1`      | PLC input · BOOL  | TRUE when the platform stands at level 1.                                                                    |
| `BAtHigh`     | `LiftB.atLevel2`      | PLC input · BOOL  | TRUE when the platform stands at level 2.                                                                    |
| `BUp`         | `LiftB.up`            | PLC output · BOOL | TRUE moves the platform up.                                                                                  |
| `BDown`       | `LiftB.down`          | PLC output · BOOL | TRUE moves the platform down.                                                                                |
| `BRun`        | `LiftB.run`           | PLC output · BOOL | TRUE runs the platform's belt forward.                                                                       |
| `RunOutfeed`  | `Outfeed.run`         | PLC output · BOOL | TRUE runs the belt forward.                                                                                  |
| —             | `TopBin`              | —                 | Not wired to the PLC.                                                                                        |
| `BoxOnA`      | `EyeFoot.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                                                                         |
| `BoxOnB`      | `EyeMid.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                                                                         |
| `BoxAtTop`    | `EyeTop.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                                                                         |
| `Start`       | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                                                                          |
| `EStopOk`     | `EStop1.ok`           | PLC input · BOOL  | TRUE while the button is released (its normally closed contact); FALSE when it is pushed or its wire is cut. |
| `Green`       | `StackLight1.green`   | PLC output · BOOL | TRUE lights the green lamp.                                                                                  |
| `Red`         | `StackLight1.red`     | PLC output · BOOL | TRUE lights the red lamp.                                                                                    |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only these variables: it never sees a box, only what the sensors say about it.

Lift A rests at level 1 or level 2 of the plant. Lift B rests at level 2 or level 3, but its own signals are called `atLevel1` and `atLevel2`: for each lift, level 1 is its bottom and level 2 is its top. Each lift has a platform that `Up` and `Down` move, and a belt on the platform that `Run` drives.

Facts about this scene, from a run of a finished program, in seconds from the start:

- The box source `Source1` is not wired to the PLC. It puts a box on the infeed every 10 s whatever the program does, five boxes in all, the first about 10 s into the run.
- A box takes about 4.5 s to ride the infeed from its release to `EyeFoot`. A platform takes about 1.4 s to go from its bottom to its top, or back.
- The first box reaches the bin about 26.7 s into the run, and the fifth about 68.7 s. The scenario presses Start at {{t:200}} ms, releases it at {{t:400}} ms and ends at {{t:80000}} ms.
- The emergency stop and the red lamp are wired, but the scenario never presses the stop and the finished program does not read it.

## Two cycles at once

Each lift repeats a cycle for every box: it takes a box at the bottom, rises, runs the box off at the top and comes back down. In the run the cycle lasts about 5.8 s, from the moment the box is seen at the bottom to the moment the platform is back there. Boxes arrive every 10 s, so each lift is free again before the next box comes.

The two cycles are not in step. While lift A is rising with one box, lift B is still lowering after it delivered the box before. In the run, this happens from 25.8 s to 26.8 s:

```timing
span: 6000
signals:
  - { name: LiftA.up, edges: [1450, 2840] }
  - { name: LiftB.down, edges: [1820, 3210] }
  - { name: Transfer.run, edges: [2850, 6000] }
caption: 'Seconds 24 to 30 of the run: lift A rises while lift B lowers, and the transfer belt starts when lift A reaches the top'
```

The only part that both lifts use is the transfer belt: lift A puts a box on it and lift B takes the box from it. If only one lift could work at a time, the two cycles of about 5.8 s would add up to more than the 10 s between boxes, and boxes would queue at the bottom of lift A. The machine needs both lifts to be able to work at the same time, each in its own cycle, and to meet only at the transfer belt.

## Worked example

A goods hoist in a warehouse carries one crate from the ground floor to the first floor, unloads it, and comes back. The inputs are `CrateOn`, which is TRUE while a crate stands on the platform, `AtGround` and `AtFirst`, which say where the platform rests. The outputs are `Up`, `Down` and `Belt`, the belt of the platform.

The jobs are: wait for a crate, raise it, unload it for a time, and lower the platform. Four jobs give four steps, and the last transition leads back to the first step, so that the hoist repeats the cycle for every crate. Each step says the whole state of the hoist: it writes all three outputs.

| Step             | Up    | Down  | Belt  | The step ends when         |
| ---------------- | ----- | ----- | ----- | -------------------------- |
| `WAIT` (initial) | FALSE | FALSE | FALSE | `CrateOn AND AtGround`     |
| `RAISE`          | TRUE  | FALSE | FALSE | `AtFirst`                  |
| `UNLOAD`         | FALSE | FALSE | TRUE  | `UNLOAD.T >= T#3s`         |
| `LOWER`          | FALSE | TRUE  | FALSE | `AtGround`, back to `WAIT` |

Follow a crate through the chart. `WAIT` is active and nothing moves. When the crate is on the platform and the platform is at the ground floor, `RAISE` becomes active and the platform goes up. When `AtFirst` is TRUE, `UNLOAD` runs the belt for three seconds, then `LOWER` brings the platform down, and when `AtGround` is TRUE the chart is back in `WAIT`, ready for the next crate.

At no moment does `Up` or `Down` run together with `Belt`: each step turns on only what its job needs and turns the rest off.

This machine has one hoist. The line of the practice has two lifts that work at once and share one belt, and what the second lift reads and how both begin to work together is for you to decide from what the machine needs.

## Common mistakes

- A cycle that does not lead back to its first step. The lift serves one box and then waits for ever.
- A step with no condition that can become TRUE. The chart stays in that step, and its outputs keep running.
- An output written in one step only. When the step ends, the output keeps its last value; let each step write every output of its lift.
- Using a sensor of one lift in the cycle of the other. Each lift has its own position sensors, and a sensor tells where its own platform or box is.
- Moving a lift while its belt runs. {{ui:learn.check}} cannot see it: in a test run that kept lift A's belt running while it rose, {{ui:learn.check}} still passed. Watch it yourself in the {{ui:plant.panel.view3d}}.

> [!NOTE]
> The grade proves that a box reached the bin and that Green is lit at the end. It does not see the order of the steps of each lift, so a chart can pass and still be wrong in a way only the {{ui:plant.panel.view3d}} shows.

## Check yourself

```quiz
question: In the hoist, WAIT is active, CrateOn is TRUE and AtGround is FALSE, because the platform is between floors. What happens?
options:
  - { text: 'WAIT stays active, because both signals must be TRUE', correct: true, feedback: 'Yes. The condition is CrateOn AND AtGround, so one FALSE signal keeps the chart in WAIT.' }
  - { text: 'RAISE becomes active, because a crate is on the platform', feedback: 'The condition needs both signals. CrateOn alone is not enough.' }
  - { text: 'UNLOAD becomes active after three seconds', feedback: 'The three seconds belong to the clock of UNLOAD, which is not active yet.' }
```

```quiz
question: In the run, lift A is rising with a box while lift B is still lowering after it delivered the box before. How many steps of the whole chart are active?
options:
  - { text: 'Two, one for each lift', correct: true, feedback: 'Right. Each lift is in its own cycle, so each has its own active step.' }
  - { text: 'One, the step of lift A', feedback: 'Lift B is moving too, so a step of lift B is active as well.' }
  - { text: 'Three, because the transfer belt has a step of its own', feedback: 'The transfer belt is driven by the lifts; it is not a cycle of its own.' }
```

## What you will do in the practice

The starting program already holds the cycle of lift A and drives the transfer belt, the outfeed and Green; it has nothing for lift B. You will make lift B carry each box from the transfer belt up to the outfeed while lift A keeps working, so that the five boxes reach the bin and Green is lit at the end, {{t:80000}} ms into the run. Then press {{ui:learn.check}}.
