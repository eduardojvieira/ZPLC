## The machine

This is an automated warehouse, the kind that keeps goods on shelves too high to reach by hand. One machine does all the work, a stacker crane: it runs along an aisle, takes a box from the infeed belt, puts it in a cell of the rack and, when someone asks for that box, brings it back to the dock. The rack has three columns of two shelves, six cells in all, and this lesson uses only the first shelf of each column.

![The stacker-crane warehouse scene seen from above and to one side. A rack of shelves stands in the middle with the mast of the crane in front of it. On the left an infeed belt, with the emitter at its far end, leads to the crane; on the right an outfeed belt ends at a bin, with a stack light beside it. In front of the rack are the start button and the three request buttons. Each part has a label with its name, its kind and the signals wired to it.](images/machine.en.png)

The warehouse has eleven parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                           |
| ------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Crane1`      | Stacker crane          | The crane of an automated warehouse: it runs along an aisle, stores boxes in the cells of a rack and takes them out. |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.                     |
| `Source1`     | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item.        |
| `Outfeed`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.                     |
| `OutBin`      | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.                |
| `InEye`       | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.                    |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                         |
| `Req1`        | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                         |
| `Req2`        | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                         |
| `Req3`        | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                         |
| `StackLight1` | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                            |

| Variable    | Signal                | Direction & type               | Meaning                                                             |
| ----------- | --------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `InPos`     | `Crane1.inPosition`   | PLC input · BOOL               | TRUE when the crane stands still at the column and level asked for. |
| `Raised`    | `Crane1.raised`       | PLC input · BOOL               | TRUE when the fork is lifted.                                       |
| `Centre`    | `Crane1.forkCentre`   | PLC input · BOOL               | TRUE when the fork is back in the centre.                           |
| `AtLeft`    | `Crane1.forkAtLeft`   | PLC input · BOOL               | TRUE when the fork is fully out to the left.                        |
| `AtRight`   | `Crane1.forkAtRight`  | PLC input · BOOL               | TRUE when the fork is fully out to the right.                       |
| `Loaded`    | `Crane1.loaded`       | PLC input · BOOL               | TRUE while a box rests on the fork.                                 |
| `Bay`       | `Crane1.bay`          | PLC output · INT, 0 to 3 bay   | The rack column to travel to (0 is the dock).                       |
| `Level`     | `Crane1.level`        | PLC output · INT, 0 to 2 level | The rack level to travel to (0 is the dock).                        |
| `Raise`     | `Crane1.raise`        | PLC output · BOOL              | TRUE lifts the fork a little, to pick a box up or set it down.      |
| `ForkLeft`  | `Crane1.forkLeft`     | PLC output · BOOL              | TRUE extends the fork to the left while it is held.                 |
| `ForkRight` | `Crane1.forkRight`    | PLC output · BOOL              | TRUE extends the fork to the right while it is held.                |
| `BeltRight` | `Crane1.beltRight`    | PLC output · BOOL              | TRUE runs the belt on the fork towards the rack side.               |
| `RunIn`     | `Infeed.run`          | PLC output · BOOL              | TRUE runs the belt forward.                                         |
| —           | `Source1`             | —                              | Not wired to the PLC.                                               |
| `RunOut`    | `Outfeed.run`         | PLC output · BOOL              | TRUE runs the belt forward.                                         |
| —           | `OutBin`              | —                              | Not wired to the PLC.                                               |
| `InEye`     | `InEye.detect`        | PLC input · BOOL               | TRUE while an object is in the beam.                                |
| `Start`     | `StartButton.pressed` | PLC input · BOOL               | TRUE while the button is held down.                                 |
| `Req1`      | `Req1.pressed`        | PLC input · BOOL               | TRUE while the button is held down.                                 |
| `Req2`      | `Req2.pressed`        | PLC input · BOOL               | TRUE while the button is held down.                                 |
| `Req3`      | `Req3.pressed`        | PLC input · BOOL               | TRUE while the button is held down.                                 |
| `Green`     | `StackLight1.green`   | PLC output · BOOL              | TRUE lights the green lamp.                                         |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only these variables: it never sees a box, only what the crane and the sensor say about it.

The crane does two kinds of work. It travels: Bay picks a column of the rack and Level a shelf, and Bay 0 with Level 0 is the dock where the two belts end. InPos turns TRUE when the crane stands still at the place asked for. And it handles boxes: the fork slides out to the left, towards the infeed, or to the right, towards the rack and the outfeed. Raise lifts the fork a few centimetres, which is how it picks a box up off the rails of a cell or sets one down on them. The belt on the fork rolls a box on or off it.

The crane cannot travel while its fork is out. If the program asks for another Bay or Level with the fork out, the crane stays where it is, and the fact `blocked` counts the refused request once.

Boxes arrive by themselves: Source1 releases one at 8 s, one at 16 s and one at 24 s, three in all, and the infeed belt carries each to InEye while RunIn is TRUE. The request buttons Req1, Req2 and Req3 ask for the box in column 1, 2 or 3. A press lasts a fraction of a second, and the crane can be busy for much longer, so a request made while it works must still be served afterwards.

The scenario presses Start at {{t:200}} ms, lets the three boxes arrive and be stored, and then presses Req1 at {{t:50000}} ms and Req3 at {{t:50500}} ms, while the crane is still busy with the first. The diagram is a run of the finished program: a cell is high while it holds a box at rest, and Green lights once two boxes have been put on the outfeed.

```timing
span: 90000
signals:
  - { name: Req1, edges: [50000, 50300] }
  - { name: Req3, edges: [50500, 50800] }
  - { name: Cell1, edges: [18390, 54330] }
  - { name: Cell2, edges: [31330, 90000] }
  - { name: Cell3, edges: [45640, 68680] }
  - { name: Green, edges: [78860, 90000] }
caption: The request for column 3 waits until the crane has served column 1, then column 3 is emptied
```

## A job is a chain of steps

Storing one box is not one action. The crane takes the box onto the fork, travels, slides the fork into the cell, lowers it and goes back. Each movement takes time, and the next must not start before the machine says that the last one is done. A sequential function chart draws this well: one step for each movement, and a transition that waits for the sensor that reports it. The chart follows the machine, however fast or slow it moves.

The active step is also the memory of the job. While a step in the middle of the chain is active, the program knows that a job is under way, although the button that started it was released long ago. No extra variable says "a job is running". When the job ends, the chart is back at its waiting step.

## Worked example

A shop sends parcels to its loft with a small hoist. A press of `Send` starts one trip: the hoist rises to the loft, a pusher slides the tray out onto the loft floor, the pusher comes back, and the hoist goes down to the shop again. The inputs are `Send` and the four sensors `AtLoft`, `Pushed`, `Home` and `AtShop`; the outputs are `Up`, `Down` and `Push`.

One movement gives one step, and each step leaves when the sensor of its movement turns TRUE:

| Step      | Outputs that are TRUE | Leaves when                        |
| --------- | --------------------- | ---------------------------------- |
| `IDLE`    | none                  | `Send`                             |
| `RISE`    | `Up`                  | `AtLoft`: the hoist is at the loft |
| `SLIDE`   | `Push`                | `Pushed`: the pusher is fully out  |
| `RETRACT` | none                  | `Home`: the pusher is fully in     |
| `LOWER`   | `Down`                | `AtShop`: the hoist is at the shop |

`IDLE` is the initial step, and `LOWER` leads back to it. Each action writes all three outputs, so every step says the whole state of the hoist. Here is a run, with the sensors played back by a script: `Send` is pressed twice, the second time while the hoist is still rising.

```timing
span: 9000
signals:
  - { name: Send, edges: [1000, 1300, 2000, 2300] }
  - { name: Up, edges: [1010, 3010] }
  - { name: Push, edges: [3010, 4010] }
  - { name: Down, edges: [5010, 8010] }
caption: One trip for two presses, because the second press comes while RISE is active and only IDLE looks at Send
```

Follow the first press. `IDLE` is active and sees `Send`, so on the next scan `RISE` is active and `Up` is TRUE. When the loft sensor turns TRUE, `RISE` ends and `Up` falls in the same scan that `Push` rises, because the next action writes every output. The second press finds `RISE` active, and nothing looks at `Send` there, so the hoist ignores it. A hoist that must not lose a press would need a memory of its own for it.

This hoist has no fork, no rack and nothing to choose between. The crane of the practice has a rack with a box in some cells and none in others, and what its chart must do for a request is for you to work out from what the crane can and cannot do.

## Common mistakes

- Writing an output only in the step that turns it on. In the hoist, if `SLIDE` writes only `Push := TRUE` and `RETRACT` writes nothing, `Push` stays TRUE through `RETRACT`, so the pusher is told to stay out.
- Starting the next movement before the sensor of the last one says it is done. In a run of the crane where the fork was sent out before `InPos`, `blocked` reached 2 and all three boxes stayed in the rack.
- Waiting for the wrong sensor. `Home` is TRUE when the pusher is in, which is where `SLIDE` starts, so a `SLIDE` that waited for `Home` would end on the next scan, with `Push` TRUE for a single scan.
- Naming a step with an IEC keyword. A step called `RETURN` does not compile: the message is "Step name may not be an IEC keyword".

> [!NOTE]
> A chart shows the order of a machine, not its safety. The crane refuses a move with its fork out, but a real warehouse also has guards and limit switches wired outside the program.

## Check yourself

```quiz
question: In the hoist, RISE is active and the operator presses Send again. What does the hoist do?
options:
  - { text: 'Nothing: only IDLE looks at Send, and IDLE is not active', correct: true, feedback: 'Right. The press is gone before the chart is back at IDLE, so the hoist makes one trip.' }
  - { text: 'It starts a second trip as soon as the first ends', feedback: 'Nothing remembers the press. The second one came while RISE was active, and RISE does not read Send.' }
  - { text: 'It stops and goes back to IDLE', feedback: 'RISE leaves only when AtLoft is TRUE; Send is not one of its conditions.' }
```

```quiz
question: The program asks the crane for another Bay while the fork is out. What happens?
options:
  - { text: 'The crane stays where it is, and the request is counted in blocked', correct: true, feedback: 'Yes. The crane does not travel with the fork out, and every refused request is counted once.' }
  - { text: 'The crane travels with the fork out', feedback: 'It cannot: its travel is held while the fork is out.' }
  - { text: 'The crane pulls the fork in by itself and then travels', feedback: 'The fork stays out while the program holds ForkLeft or ForkRight; the crane never pulls it in to travel.' }
```

## What you will do in the practice

The starting chart already stores every box that arrives on the infeed: it takes the box to the first free cell, and it keeps track of which cells hold a box and which requests are waiting. It has no way to bring a box back, so a press of a request button does nothing. You will make the crane serve a request: take the box out of the requested cell, bring it to the dock and put it on the outfeed. The lamp must be green at {{t:90000}} ms. Then press {{ui:learn.check}}.
