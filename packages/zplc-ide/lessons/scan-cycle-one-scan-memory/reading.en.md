## One scan at a time

A PLC runs its program over and over, in a loop called the **scan cycle**. Each scan has three parts, always in the same order:

1. It reads every input and keeps a copy of them for the whole scan.
2. It runs the program once, from the first statement to the last.
3. It writes every output.

Then the next scan starts. An input that changes in the middle of a scan is seen only at the start of the next one, and an output takes the last value the program gave it during the scan.

## A variable remembers

A variable declared in `VAR` belongs to the program, not to a wire. It keeps its value from the end of one scan to the start of the next, until a statement gives it a new one. That is the memory of a program.

Inside a scan the statements run from top to bottom, so the order decides what each statement sees. A statement that reads a variable before the line that updates it sees the value of the previous scan; a statement after that line sees the new value. Put the update last, and the variable is the input **one scan late**:

```st
Late := Memory;
Memory := Signal;
```

On each scan the first line copies what Memory held since the last scan, and only then the second line stores the Signal of this scan for the next one.

## A pulse of one scan

With the value of the previous scan, a program can see a change. A signal that is TRUE now and was FALSE on the previous scan has just turned on: that moment is its **rising edge**. The test `Now AND NOT Before` is TRUE on exactly one scan, the scan of the edge, because on the next scan Before is TRUE too. A one-scan pulse like this lets a program do something once per press instead of on every scan the button is held.

## Worked example

A water tank has a float switch, `Float`, that is TRUE while the water is above it. The operator panel keeps a log, and it needs a pulse, `Changed`, on every scan in which the float switch has just moved, up or down. Neither edge alone is enough: the log wants both. A change is a scan in which the value now differs from the value before, and that is what XOR tells: TRUE when its two operands differ.

```st
PROGRAM FloatLog
VAR_INPUT Float : BOOL; END_VAR
VAR_OUTPUT Changed : BOOL; END_VAR
VAR FloatBefore : BOOL := FALSE; END_VAR
Changed := Float XOR FloatBefore;
FloatBefore := Float;
END_PROGRAM
```

The diagram shows a scan every ten milliseconds. FloatBefore is drawn as the first statement reads it, before the last statement updates it, so it follows Float one scan later. Changed is TRUE on the two scans in which Float and FloatBefore differ: when the water rises over the switch and when it falls below it again.

```timing
span: 60
signals:
  - { name: Float, edges: [10, 40] }
  - { name: FloatBefore, edges: [20, 50] }
  - { name: Changed, edges: [10, 20, 40, 50] }
caption: FloatBefore is Float one scan late, and Changed lasts one scan at each change
```

This program has one memory and one statement that reads it. The practice asks for more from its memory: two outputs that each need the value of the previous scan, and an edge in one direction only. Where each statement goes is for you to work out.

## Common mistakes

- Updating the memory before reading it. The memory then holds the value of this scan, not of the previous one, and the edge is never seen.
- Forgetting to declare the memory in `VAR`. Every variable the program uses is declared.
- Testing `Now AND Before` instead of `Now AND NOT Before`. That is TRUE on every scan the signal stays on, not only on the first.
- Expecting the pulse to last as long as the press. It lasts one scan, however long the button is held.

> [!NOTE]
> In the scenario of this lesson a scan lasts ten milliseconds, so a one-scan pulse is very short. A person cannot see it on a lamp, but the trace and the scenario look at every scan.

## Check yourself

```quiz
question: The box counter is written in the other order, EyeBefore := Eye; and then Left := EyeBefore AND NOT Eye;. What does Left do when a box leaves?
options:
  - { text: 'Nothing: it stays FALSE', correct: true, feedback: 'Yes. EyeBefore already holds the Eye of this scan when Left reads it, so the test compares Eye with itself.' }
  - { text: 'It is TRUE for one scan', feedback: 'For that, Left must read EyeBefore before EyeBefore is updated.' }
  - { text: 'It is TRUE while the box is in front of the sensor', feedback: 'Left needs EyeBefore TRUE and Eye FALSE in the same scan, and this order never gives that.' }
```

```quiz
question: Button stays TRUE for five scans in a row. On how many of them is Button AND NOT Before TRUE?
options:
  - { text: 'One, the first', correct: true, feedback: 'Right. From the second scan on, Before is TRUE too, so the test is FALSE.' }
  - { text: 'Five, every scan the button is held', feedback: 'That is Button on its own. NOT Before keeps only the scan of the change.' }
  - { text: 'None', feedback: 'On the first scan Before is still FALSE, so the test is TRUE once.' }
```

## What you will do in the practice

The starting program copies Button to Current and holds Delayed and RisingPulse FALSE. You will add a memory of your own so that Delayed shows Button one scan late and RisingPulse is TRUE only on the scan in which Button turns on: Button turns on at {{t:10}} ms and off at {{t:20}} ms. Then press {{ui:learn.check}}.
