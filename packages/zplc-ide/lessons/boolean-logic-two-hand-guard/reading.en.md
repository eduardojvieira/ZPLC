## Decisions made of yes and no

Most of what a machine decides is a yes or a no. May the motor run? Is the door shut? Must the lamp light? Each answer is a BOOL, a value that is either TRUE or FALSE, and most answers are made of other answers: the motor may run if the door is shut and nobody is pressing stop.

**Boolean logic** is the arithmetic of such answers. With four operators a program turns the inputs it reads into the outputs it writes. A condition built only from them has no memory: on every scan its result depends only on the values of this scan.

## The four operators

| Operator | The result is TRUE when     | Example in ST                      |
| -------- | --------------------------- | ---------------------------------- |
| `AND`    | both sides are TRUE         | `Run := Ready AND Start;`          |
| `OR`     | at least one side is TRUE   | `Alarm := HighLevel OR LowLevel;`  |
| `XOR`    | exactly one side is TRUE    | `Mismatch := SwitchA XOR SwitchB;` |
| `NOT`    | the value after it is FALSE | `DoorLamp := NOT DoorClosed;`      |

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

An assignment such as `DoorLamp := NOT DoorClosed;` writes its output on every scan, so the output follows its condition: when an input changes, the output changes in the same scan. Give each output one statement that holds its whole condition.

## Worked example

A drying oven has a heater, a thermostat switch `OverTemp` that turns TRUE when the oven is too hot, and an operator switch `HeatOn`. The door is watched by two switches, `DoorSwitchA` and `DoorSwitchB`, that are both TRUE while the door is shut. They should always agree; when they do not, one of them is broken, and the oven lights a fault lamp. A second lamp shows that the door is open.

Each output answers one question, so each gets one statement:

- The heater may heat when the operator wants heat, both door switches say shut, and the oven is not too hot. Every condition is needed, so they are joined with AND, and the thermostat enters as `NOT OverTemp`.
- The door lamp lights when both switches say open: `NOT DoorSwitchA AND NOT DoorSwitchB`.
- The fault lamp lights when exactly one switch says shut: that is XOR.

```st
PROGRAM DryingOven
VAR_INPUT
  HeatOn : BOOL;
  DoorSwitchA : BOOL;
  DoorSwitchB : BOOL;
  OverTemp : BOOL;
END_VAR
VAR_OUTPUT
  Heater : BOOL;
  DoorLamp : BOOL;
  SwitchFault : BOOL;
END_VAR
Heater := HeatOn AND DoorSwitchA AND DoorSwitchB AND NOT OverTemp;
DoorLamp := NOT DoorSwitchA AND NOT DoorSwitchB;
SwitchFault := DoorSwitchA XOR DoorSwitchB;
END_PROGRAM
```

Follow it with the heat switched on and the oven cool. The door closes: switch A closes a moment before switch B, so for that moment SwitchFault is TRUE and the heater waits. Once both are closed the heater runs. Later switch B breaks and reads FALSE although the door is still shut: the AND loses one of its conditions, so the heater stops, and the XOR lights the fault lamp.

```timing
span: 5000
signals:
  - { name: DoorSwitchA, edges: [1000] }
  - { name: DoorSwitchB, edges: [1300, 3000] }
  - { name: Heater, edges: [1300, 3000] }
  - { name: SwitchFault, edges: [1000, 1300, 3000] }
caption: The door closes, then switch B breaks; HeatOn is TRUE and OverTemp FALSE all along
```

Putting both switches in the AND is what makes a broken switch stop the heater instead of letting it run. A real oven gives the two switches a short time to agree before it lights the fault lamp; that needs a timer, which this page leaves out.

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
