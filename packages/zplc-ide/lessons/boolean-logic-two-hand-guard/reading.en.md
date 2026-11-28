## Decisions made of yes and no

Most of what a machine decides is a yes or a no. May the motor run? Is the door shut? Must the lamp light? Each answer is a BOOL, a value that is either TRUE or FALSE, and most answers are made of other answers: the motor may run if the door is shut and nobody is pressing stop.

**Boolean logic** is the arithmetic of such answers. With four operators a program turns the inputs it reads into the outputs it writes. A condition built only from them has no memory: on every scan its result depends only on the values of this scan.

## The four operators

| Operator | The result is TRUE when     | Example in ST                      |
| -------- | --------------------------- | ---------------------------------- |
| `AND`    | both sides are TRUE         | `Run := Ready AND Start;`          |
| `OR`     | at least one side is TRUE   | `Alarm := HighLevel OR LowLevel;`  |
| `XOR`    | exactly one side is TRUE    | `Mismatch := SwitchA XOR SwitchB;` |
| `NOT`    | the value after it is FALSE | `FillValve := NOT TankFull;`       |

The timing diagram feeds the same two inputs, A and B, to each operator. Time runs to the right; a line is up while its signal is TRUE.

```timing
span: 5000
signals:
  - { name: A, edges: [1000, 3000] }
  - { name: B, edges: [2000, 4000] }
  - { name: 'A AND B', edges: [2000, 3000] }
  - { name: 'A OR B', edges: [1000, 4000] }
  - { name: 'A XOR B', edges: [1000, 2000, 3000, 4000] }
  - { name: 'NOT A', edges: [0, 1000, 3000] }
caption: Two inputs and what each operator makes of them
```

AND is TRUE only where both lines are up. OR is TRUE wherever at least one is up. XOR is TRUE where exactly one is up, so it falls while both are up. NOT A is the mirror of A.

An operator joins as many conditions as you need: `A AND B AND C` is TRUE only when all three are TRUE, and `A OR B OR C` when any one of them is.

## Reading a longer condition

Structured Text works out NOT first, then AND, then XOR, then OR, the way arithmetic works out a multiplication before an addition. So `Start OR Jog AND Ready` means `Start OR (Jog AND Ready)`: Start alone runs the machine, even when it is not ready. When you mean something else, write the parentheses: `(Start OR Jog) AND Ready`.

NOT applies only to the one value right after it. `NOT DoorClosed AND Ready` is `(NOT DoorClosed) AND Ready`. To turn a whole condition around, put it in parentheses: `NOT (DoorClosed AND Ready)`.

An assignment such as `Flap := TallBox AND NOT LaneFull;` writes its output on every scan, so the output follows its condition: when an input changes, the output changes in the same scan. Give each output one statement that holds its whole condition.

## Worked example

A sorting conveyor carries boxes past a flap that can swing out and push a box into a side lane. A height eye, `TallBox`, is TRUE while a tall box passes; tall boxes go to the side lane, unless the lane is full, which the switch `LaneFull` reports. The flap has a position switch, `FlapIsOut`, that is TRUE while the flap is really out. While the belt runs (`BeltRunning`), the command and the position switch should always agree; when they do not, the flap is stuck or slow, and a fault lamp lights.

Each output answers one question, so each gets one statement:

- The flap swings out for a tall box when the lane is not full: two conditions joined with AND, and the lane switch enters as `NOT LaneFull`.
- The fault lamp lights when the command and the position differ, but only while the belt runs: the difference is an XOR, and the XOR in turn is joined with AND to the belt.

```st
PROGRAM Diverter
VAR_INPUT
  TallBox : BOOL;
  LaneFull : BOOL;
  FlapIsOut : BOOL;
  BeltRunning : BOOL;
END_VAR
VAR_OUTPUT
  Flap : BOOL;
  FlapFault : BOOL;
END_VAR
Flap := TallBox AND NOT LaneFull;
FlapFault := (Flap XOR FlapIsOut) AND BeltRunning;
END_PROGRAM
```

The second statement reads `Flap`, which the first statement has just written in the same scan. The parentheses matter: without them, `Flap XOR FlapIsOut AND BeltRunning` would mean `Flap XOR (FlapIsOut AND BeltRunning)`, because AND comes before XOR.

Follow it with the belt running. A tall box arrives and the flap is commanded out; the position switch confirms a moment later, so for that moment FlapFault is TRUE. The box passes and the flap goes back in, with the same short fault. Later the lane is full: the next tall box passes and the flap stays in.

```timing
span: 5000
signals:
  - { name: TallBox, edges: [1000, 2000, 3500, 4500] }
  - { name: LaneFull, edges: [3000] }
  - { name: Flap, edges: [1000, 2000] }
  - { name: FlapIsOut, edges: [1200, 2200] }
  - { name: FlapFault, edges: [1000, 1200, 2000, 2200] }
caption: Two tall boxes, the second with the side lane full; BeltRunning is TRUE all along
```

A real diverter gives the flap a short time to move before it lights the fault lamp; that needs a timer, which this page leaves out.

## Common mistakes

- Writing OR where every condition is needed. The output then turns on with only one of them.
- Leaving out parentheses. `Start OR Jog AND Ready` is `Start OR (Jog AND Ready)`, because AND comes before OR.
- Putting NOT on the wrong part. `NOT A AND B` turns around only A; `NOT (A AND B)` turns around the whole condition.
- Using OR for "exactly one". OR is also TRUE when both sides are TRUE; XOR is FALSE then.
- Writing the same output in two statements. The statement written last wins, and the first one has no effect.

> [!WARNING]
> A condition in a program decides when a machine may move. It does not make the machine safe: a two-hand control and a guard that protect people are devices of their own, wired so that they stop the machine whatever the program does.

## Check yourself

```quiz
question: A program has Run := Start OR Jog AND Ready; with Start TRUE, Jog FALSE and Ready FALSE. What is Run?
options:
  - { text: 'TRUE', correct: true, feedback: 'Yes. AND comes before OR, so the statement is Start OR (Jog AND Ready), and Start alone makes it TRUE.' }
  - { text: 'FALSE', feedback: 'That would be (Start OR Jog) AND Ready. Without the parentheses AND is worked out first.' }
  - { text: 'It changes on every scan', feedback: 'The inputs do not change, so the result is the same on every scan.' }
```

```quiz
question: Two level switches on a tank should always agree. A lamp must light when exactly one of them is TRUE. Which operator joins them?
options:
  - { text: 'XOR', correct: true, feedback: 'Right. XOR is TRUE when exactly one side is TRUE, and FALSE when both agree.' }
  - { text: 'OR', feedback: 'OR is also TRUE when both switches are TRUE, which is a normal state.' }
  - { text: 'AND', feedback: 'AND is TRUE only when both switches are TRUE, which is the case where they agree.' }
```

## What you will do in the practice

The machine of the practice is a press with a two-hand control: it may close only while the operator holds two push buttons, one for each hand, so that no hand can be under the tool, and only while its guard is closed. The starting program enables the press with either hand and leaves the two lamps OFF. You will give each of the three outputs its own condition: PressEnable only with both hands and the guard closed, GuardLamp while the guard is open, and OneHandWarning while exactly one hand is on its button. The scenario changes the inputs every {{t:10}} ms. Then press {{ui:learn.check}}.
