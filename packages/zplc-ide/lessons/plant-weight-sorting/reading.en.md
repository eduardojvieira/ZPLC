## The machine

This is a checkweigher, a station that weighs every item on a line and sends it on by its weight. Boxes of two different masses come down the line one at a time. Each one is held on a scale, weighed, and then either pushed off sideways to a bin for heavy boxes or let through to a bin for light ones. Packing lines use stations like this to reject short-filled bags or to split a product into weight classes before it is packed.

![The weight-sorting scene seen from above at an angle. A long belt, the infeed, runs from left to right, with the item emitter and the start button at its left end. Near the middle of the belt, at the same place, stand a scale with a small display and an orange pusher plate behind the belt. A short side belt leaves the middle of the line toward the front and ends in the heavy bin. The line goes on to the right and ends in the light bin, next to the stack light. Each part has a label with its name and kind, and the parts the program uses also show their variable and signal.](images/machine.en.png)

The station has eleven parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it. A dash means that the part is not wired to the program.

| Part          | Kind          | What it is in a real plant                                                                                    |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Outfeed`     | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `SideBelt`    | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter  | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Blade1`      | Stop blade    | A plate that rises across the belt to hold items back until they are let through.                             |
| `Scale1`      | Scale         | A weighing platform in the line, like a checkweigher, that reports the weight of what lies on it.             |
| `Pusher1`     | Pusher        | A pneumatic cylinder with a plate that pushes an item sideways off the belt.                                  |
| `HeavyBin`    | Item remover  | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `LightBin`    | Item remover  | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button   | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `StackLight1` | Stack light   | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable     | Signal                | Direction & type             | Meaning                                                         |
| ------------ | --------------------- | ---------------------------- | --------------------------------------------------------------- |
| `RunInfeed`  | `Infeed.run`          | PLC output · BOOL            | TRUE runs the belt forward.                                     |
| `RunOutfeed` | `Outfeed.run`         | PLC output · BOOL            | TRUE runs the belt forward.                                     |
| `RunSide`    | `SideBelt.run`        | PLC output · BOOL            | TRUE runs the belt forward.                                     |
| —            | `Source1`             | —                            | Not wired to the PLC.                                           |
| `Hold`       | `Blade1.extend`       | PLC output · BOOL            | TRUE raises the blade across the belt; FALSE lowers it.         |
| `Stable`     | `Scale1.stable`       | PLC input · BOOL             | TRUE once the load has been at rest long enough to be weighed.  |
| `Weight`     | `Scale1.weight`       | PLC input · REAL, 0 to 20 kg | The weight on the platform; 0 until it is stable.               |
| `Extended`   | `Pusher1.extended`    | PLC input · BOOL             | TRUE when the plate is fully out.                               |
| `Retracted`  | `Pusher1.retracted`   | PLC input · BOOL             | TRUE when the plate is fully back.                              |
| `Push`       | `Pusher1.extend`      | PLC output · BOOL            | TRUE drives the plate out across the belt; FALSE pulls it back. |
| —            | `HeavyBin`            | —                            | Not wired to the PLC.                                           |
| —            | `LightBin`            | —                            | Not wired to the PLC.                                           |
| `Start`      | `StartButton.pressed` | PLC input · BOOL             | TRUE while the button is held down.                             |
| `Green`      | `StackLight1.green`   | PLC output · BOOL            | TRUE lights the green lamp.                                     |

Three measures from a run of the lesson solution on this scene help to picture it, each within one scan. The blade needs about 0.4 s to go up or down. The pusher needs about 1.2 s to reach the end of its stroke and about 1.2 s to come back. The source releases twelve boxes, one about every 6 s, and in that run the first box was at rest on the scale 9.5 s after the press of the start button.

A PLC output drives a part of the machine; a PLC input is what a part reports. The program never sees a box, only what the scale, the pusher and the button report about it.

## A number is worth reading only when the scale says so

`Weight` is a REAL number, a measure with a decimal part. It is not a yes or no, so a program cannot use it as a condition by itself. And a scale cannot weigh what is moving: while a box slides onto the platform or rocks on it, the platform has no steady load. Real checkweighers wait until the platform stops swinging, and so does this one. It tells the program with `Stable`.

So there are two rules for the program. Look at `Weight` only while `Stable` is TRUE. Anything it shows at another moment is not the weight of the box; on this scale it is 0.

## A limit turns a number into a decision

To send a box one way or the other, the program compares the number with a **limit**. A comparison such as `Net < 500.0` gives a BOOL, TRUE or FALSE, and that BOOL can be used like any other condition. The limit divides all possible weights into two groups.

Two things are worth checking about a limit. First, where it sits: a real box never weighs exactly its nominal mass, so a limit placed close to one of the masses mixes the two groups. Second, the weight that sits exactly on the limit: `>` and `>=` send it to opposite sides, so the rule of the machine ("at least", or "more than") decides which of them to write.

## Worked example

At the end of a coffee packer, a scale weighs each bag. A bag must hold at least 500 g. The lamp `Short` lights for a settled bag under 500 g, and the lamp `Pass` lights for a settled bag with 500 g or more. While the bag is still being filled, `Settled` is FALSE and neither lamp must light.

```st
PROGRAM BagCheck
VAR_INPUT Settled : BOOL; Net : REAL; END_VAR
VAR_OUTPUT Short : BOOL; Pass : BOOL; END_VAR
Short := Settled AND (Net < 500.0);
Pass := Settled AND (Net >= 500.0);
END_PROGRAM
```

Read it line by line. Each lamp has two conditions joined by AND: the scale says the weight is stable, and the comparison with 500 holds. While the bag is filling, `Settled` is FALSE, so both lamps are off, even though `Net` changes on every scan. Once `Settled` is TRUE, exactly one lamp is on, because `<` and `>=` cover all the weights between them without overlap. A bag of exactly 500 g passes, because the rule says "at least".

This station only lights lamps for the bag that is on the scale. It does not move the bag, count bags or decide what happens when the lamp goes out. The station of the practice must also move each box to its bin and count the boxes, and how it does that, step by step, is for you to work out from what the machine does.

## Common mistakes

- Comparing `Weight` without looking at `Stable`. While a box moves, the reading is 0, so every box would look light.
- Writing `>` where the rule says "at least". The weight that sits exactly on the limit goes to the wrong side.
- Swapping the two sides, so heavy boxes go to the bin of the light ones. The comparison is valid and the program runs; only the bins show it.
- Putting the limit outside the range of the boxes, for example above the heaviest one. Every box then lands on the same side.
- Reading a weight in the wrong unit. The scale reports kilograms, so a limit written in grams never separates two boxes.

> [!NOTE]
> A lamp or a pusher driven by this kind of comparison is a quality check, not a measurement you can certify. A legal scale has its own approvals and its own accuracy; passing a lesson says nothing about that.

## Check yourself

```quiz
question: Why does the bag check look at Settled before it compares Net with 500?
options:
  - { text: 'Because Net changes while the bag is filling, so its value is not the weight of the bag yet', correct: true, feedback: 'Yes. The comparison is only meaningful once the scale says the load is at rest.' }
  - { text: 'Because a REAL value cannot be compared without a BOOL', feedback: 'A REAL value can be compared on its own. The condition is there to choose the moment of the comparison.' }
  - { text: 'Because Settled makes the lamp brighter', feedback: 'A lamp is on or off. Settled only decides when the comparison counts.' }
```

```quiz
question: In the worked example, Settled is TRUE and Net is exactly 500.0. Which lamp is on?
options:
  - { text: 'Pass', correct: true, feedback: 'Right. The rule says "at least 500 g", and >= includes the limit itself.' }
  - { text: 'Short', feedback: 'Short needs Net below 500.0, and 500.0 is not below itself.' }
  - { text: 'Both', feedback: 'Net < 500.0 and Net >= 500.0 are never TRUE together, so at most one lamp is on.' }
```

## What you will do in the practice

The starting project declares the inputs of the station and the outputs of its belts, blade, pusher and stack light, and drives none of them. You will write the program of the station: after the press of the start button, which the scenario gives at {{t:200}} ms, the line runs, each of the twelve boxes is weighed and ends in the bin its weight selects, and the green lamp lights when all twelve are sorted. Then press {{ui:learn.check}}.
