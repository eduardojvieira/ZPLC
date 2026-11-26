## One result, one line at a time

A machine decides most things with yes-or-no answers: may the motor run, is the door shut, must the lamp light. Each answer is a BOOL, TRUE or FALSE, and **Boolean logic** builds answers from other answers with four operators: AND, OR, XOR and NOT.

An **Instruction List** program, IL for short, writes that logic as a column of short lines. Each line is one **instruction**: an operator and, almost always, an operand, the variable it works on. The PLC keeps one value while it runs the lines, the **current result**, and every line does something with it. The lines run from top to bottom on every scan.

## The instructions of Boolean logic

| Instruction | What happens to the current result                     |
| ----------- | ------------------------------------------------------ |
| `LD X`      | it becomes the value of X; a new condition starts here |
| `LDN X`     | it becomes the opposite of X                           |
| `AND X`     | it becomes the result AND X                            |
| `ANDN X`    | it becomes the result AND NOT X                        |
| `OR X`      | it becomes the result OR X                             |
| `XOR X`     | it becomes the result XOR X                            |
| `ST Y`      | it stays as it is, and the output Y receives a copy    |

AND is TRUE when both values are TRUE, OR when at least one is, XOR when exactly one is, and NOT gives the opposite of a value. A condition of several parts is one LD followed by one line for each further part, and an ST at the end writes it to its output.

There is no order of operators in IL: the order of the lines is the order of the work. The lines `LD Start`, `OR Jog`, `AND Ready` give `(Start OR Jog) AND Ready`, because the OR is done first. To get `Start OR (Jog AND Ready)`, work out the AND first: `LD Jog`, `AND Ready`, `OR Start`.

## Worked example

A drying oven may heat only while the operator switch `HeatOn` is on, both door switches `DoorSwitchA` and `DoorSwitchB` say the door is shut, and the thermostat `OverTemp` has not tripped. A door lamp shows that both switches say open. The two switches should always agree, and a fault lamp lights when they do not.

```il
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

        LD    HeatOn
        AND   DoorSwitchA
        AND   DoorSwitchB
        ANDN  OverTemp
        ST    Heater
        LDN   DoorSwitchA
        ANDN  DoorSwitchB
        ST    DoorLamp
        LD    DoorSwitchA
        XOR   DoorSwitchB
        ST    SwitchFault
END_PROGRAM
```

Read it as three groups, one for each output, each opened by a load. The first group needs every condition, so it is a chain of AND lines, and ANDN brings in the thermostat turned around. The second starts with LDN, because the lamp wants both switches open. The third is one XOR.

Follow it with the heat switched on and the oven cool. The door closes: switch A closes a moment before switch B, so for that moment SwitchFault is TRUE and the heater waits. Once both are closed the heater runs. Later switch B breaks and reads FALSE although the door is still shut: the AND chain loses one of its conditions, so the heater stops, and the XOR lights the fault lamp.

```timing
span: 5000
signals:
  - { name: DoorSwitchA, edges: [1000] }
  - { name: DoorSwitchB, edges: [1300, 3000] }
  - { name: Heater, edges: [1300, 3000] }
  - { name: SwitchFault, edges: [1000, 1300, 3000] }
caption: The door closes, then switch B breaks; HeatOn is TRUE and OverTemp FALSE all along
```

A real oven gives the two switches a short time to agree before it lights the fault lamp; that needs a timer, which this page leaves out.

## Common mistakes

- Starting a new condition without a load. After ST the current result is still there, so an AND line right after it goes on with the condition of the output above.
- Reading the lines as a written formula. IL has no order of operators: each line works on the result of the lines above it.
- Using LD where LDN is needed, or AND where ANDN is needed. The condition then waits for the opposite of the signal.
- Using OR for "exactly one". OR is also TRUE when both values are TRUE; XOR is FALSE then.
- Storing before the condition is complete. An ST in the middle of a chain writes only the part above it.

> [!WARNING]
> A list of instructions decides when a machine may move. It does not make the machine safe: a two-hand control and a guard that protect people are devices of their own, wired so that they stop the machine whatever the program does.

## Check yourself

```quiz
question: The lines are LD Start, OR Jog, AND Ready, ST Run, with Start TRUE, Jog FALSE and Ready FALSE. What is Run?
options:
  - { text: 'FALSE', correct: true, feedback: 'Yes. Start OR Jog gives TRUE, and AND Ready then gives FALSE. The lines are worked out in order.' }
  - { text: 'TRUE', feedback: 'That would be Start OR (Jog AND Ready). In IL the OR line comes first, so it is done first.' }
  - { text: 'It changes on every scan', feedback: 'The inputs do not change, so the lines give the same result on every scan.' }
```

```quiz
question: A program has ST Heater and, on the next line, AND DoorSwitchA with no load before it. What does that AND combine DoorSwitchA with?
options:
  - { text: 'The current result that was just stored in Heater', correct: true, feedback: 'Right. ST leaves the current result as it is, so the AND goes on with it. Start each new condition with LD or LDN.' }
  - { text: 'FALSE, because ST clears the current result', feedback: 'ST only copies the current result into the output; it does not change it.' }
  - { text: 'TRUE, because a new condition starts after ST', feedback: 'Only a load starts a new condition. Without it the AND works on the result above.' }
```

## What you will do in the practice

The machine of the practice is a press with a two-hand control: it may close only while the operator holds two push buttons, one for each hand, and only while its guard is closed. The starting program combines the two hands with OR and stores FALSE in the two lamps. You will make PressEnable ON only with both hands and the guard closed, GuardLamp while the guard is open, and OneHandWarning while exactly one hand is on its button. The scenario changes the inputs every {{t:10}} ms. Then press {{ui:learn.check}}.
