## Counting what passes

Machines count all the time: trays on a stack, bottles in a case, strokes of a press since its last oiling. Each of these is an event, something that happens and is over: a tray arrives, a bottle passes, the press comes down once.

A PLC does not see events. It sees inputs, once per scan. A tray that stops under a sensor keeps that input TRUE for hundreds of scans, and it is still one tray. Counting means adding one for each arrival, not for each scan in which the input is TRUE.

## An edge is a change between two scans

What marks an arrival is the moment the input changes. The program compares the value of an input in this scan with its value in the scan before.

- A **rising edge** is a change from FALSE to TRUE: the tray has just arrived. It lasts exactly one scan.
- A **falling edge** is a change from TRUE to FALSE: the tray has just left.

The level of the input, TRUE or FALSE, says whether something is there now. The rising edge says that something has just come. The diagram shows one input with two arrivals, a short one and a long one; each has one rising edge, so each counts once.

```timing
span: 4000
signals:
  - { name: TrayHere, edges: [500, 900, 2000, 3500] }
marks:
  - { from: 500, to: 900, label: '1' }
  - { from: 2000, to: 3500, label: '2' }
caption: A short arrival and a long one; each begins with one rising edge
```

## A counter is an instance you call

You do not have to compare the scans yourself. The **CTU**, the up counter, is a function block that does it: it keeps the value of its input from the scan before and adds one only on a rising edge. Like every function block, you declare an instance of it in `VAR`, with a name of its own:

```st
VAR
  Strokes : CTU;
END_VAR
```

Then you call it once on every scan, naming its inputs with `:=`, and read its outputs after the call. A CTU has three inputs and two outputs.

- **CU**, count up, a BOOL. Each rising edge of CU adds one.
- **R**, reset, a BOOL. While R is TRUE, the count is zero.
- **PV**, the preset value, an INT: the number to count to.
- **Q**, a BOOL, TRUE while the count is at or above PV. You read it as `Strokes.Q`.
- **CV**, the current value, an INT: the count so far. You read it as `Strokes.CV`.

A call looks like `Strokes(CU := PressDown, R := Oiled, PV := 500);`. The count does not stop at PV: CV goes on rising with each edge, and Q stays TRUE until a reset. While R is TRUE the counter still watches CU, so an edge that comes while R is held is not counted, now or later.

## Worked example

A tray stacker receives trays from a conveyor. Each tray stops under a sensor, `TrayHere`, until the stacker lifts it onto the stack, which takes several seconds. After four trays the stack is full: the lamp `StackFull` lights, an operator takes the stack away and presses the pulsador `StackTaken`. A display shows how many trays are on the stack now.

Each tray keeps `TrayHere` TRUE for a long time, so the program must count rising edges, which is what a CTU does. The pulsador clears the count, and the display reads CV.

```st
PROGRAM Stacker
VAR_INPUT TrayHere : BOOL; StackTaken : BOOL; END_VAR
VAR_OUTPUT StackFull : BOOL; TraysOnStack : INT; END_VAR
VAR
  Trays : CTU;
END_VAR
Trays(CU := TrayHere, R := StackTaken, PV := 4);
StackFull := Trays.Q;
TraysOnStack := Trays.CV;
END_PROGRAM
```

Follow it on the diagram. Each tray makes `TrayHere` rise once, however long it stays. On the fourth rising edge CV reaches 4 and `StackFull` rises. It stays on while the fourth tray leaves, because a falling edge does not count. When the operator presses `StackTaken`, CV goes back to zero and the lamp goes out.

```timing
span: 10000
signals:
  - { name: TrayHere, edges: [500, 1800, 2500, 3800, 4500, 5800, 6500, 7800] }
  - { name: StackFull, edges: [6500, 8800] }
  - { name: StackTaken, edges: [8800, 9300] }
marks:
  - { from: 6500, to: 8800, label: 'CV = 4' }
caption: Four long arrivals count four; the pulsador clears the count and the lamp
```

## Common mistakes

- Counting with an IF, as in `IF TrayHere THEN Count := Count + 1; END_IF`. That adds one on every scan in which the input is TRUE, hundreds for one tray. Count rising edges with a CTU.
- Calling the counter inside an IF. When the instance is not called it does not see CU, so an edge that comes and goes meanwhile is lost. Call it on every scan.
- Leaving R unconnected, or giving it a signal that is always TRUE. Without R the count never returns to zero; with R always TRUE it never leaves it.
- Expecting Q to fall when the count passes PV. Q is TRUE while CV is at or above PV, and only a reset turns it off.
- Choosing the preset one too high or one too low. PV is the number of arrivals at which Q must turn on.
- Reading Q before the call. A statement above the call sees the Q of the previous scan.

> [!WARNING]
> A count in a program is only as good as its sensor: a bouncing contact adds false counts, and a pulse shorter than a scan can be missed. Never let a count be the only thing that stops a machine before it hurts someone.

## Check yourself

```quiz
question: A program counts with IF Sensor THEN Count := Count + 1; END_IF. A part stays in front of Sensor for 40 scans. By how much does Count rise?
options:
  - { text: 'By 40', correct: true, feedback: 'Yes. The IF adds one on every scan in which Sensor is TRUE. A CTU would add one, on the rising edge.' }
  - { text: 'By one', feedback: 'That is what a CTU does. This IF looks at the level of Sensor, not at its change.' }
  - { text: 'By zero', feedback: 'Sensor is TRUE in each of those scans, so the IF runs its statement each time.' }
```

```quiz
question: A CTU has PV := 3 and R stays FALSE. Five rising edges arrive on CU. What are Q and CV?
options:
  - { text: 'Q is TRUE and CV is 5', correct: true, feedback: 'Right. The counter goes on counting past PV, and Q stays TRUE while CV is at or above PV.' }
  - { text: 'Q is TRUE and CV is 3', feedback: 'A CTU does not stop at its preset. CV keeps rising with each edge.' }
  - { text: 'Q is FALSE and CV is 0', feedback: 'Nothing reset the counter: R stayed FALSE.' }
```

## What you will do in the practice

The starting program writes FALSE to CountReached and has no counter. You will declare a counter of your own and make CountReached turn on at the third rising edge of PulseInput, at {{t:50}} ms, and turn off when Reset is pressed at {{t:70}} ms. Then press {{ui:learn.check}}.
