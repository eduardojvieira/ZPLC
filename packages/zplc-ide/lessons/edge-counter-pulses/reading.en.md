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

A tablet dispenser fills bottles. Each bottle gets five tablets, and each tablet drops past an eye, `TabletEye`, that stays TRUE for a moment while the tablet passes. When a new bottle is in place the machine presses `NewBottle`, and a display shows how many tablets the bottle still needs. The lamp `BottleDone` lights when the bottle has all five.

Here the natural count runs the other way, from five down to zero, and the standard library has a counter for that: the **CTD**, count down. Its inputs are **CD**, each rising edge of which takes one away, **LD**, which loads PV into the count while it is TRUE, and **PV**. Its outputs are **CV**, the count, and **Q**, which is TRUE while CV is at or below zero.

```st
PROGRAM Dispenser
VAR_INPUT TabletEye : BOOL; NewBottle : BOOL; END_VAR
VAR_OUTPUT BottleDone : BOOL; TabletsLeft : INT; END_VAR
VAR
  Doses : CTD;
END_VAR
Doses(CD := TabletEye, LD := NewBottle, PV := 5);
BottleDone := Doses.Q;
TabletsLeft := Doses.CV;
END_PROGRAM
```

Follow it on the diagram. Before the first bottle, CV is zero, so Q is already TRUE: a CTD says "done" until it is loaded. `NewBottle` loads five, and the lamp goes out. Each tablet makes `TabletEye` rise once, however long it takes to pass, and takes one away. On the fifth rising edge CV reaches zero and `BottleDone` lights again.

```timing
span: 6000
signals:
  - { name: NewBottle, edges: [200, 400] }
  - { name: TabletEye, edges: [1000, 1300, 2000, 2300, 3000, 3300, 4000, 4300, 5000, 5300] }
  - { name: BottleDone, edges: [0, 200, 5000] }
marks:
  - { from: 200, to: 5000, label: 'CV 5 → 0' }
caption: NewBottle loads five; five tablets bring the count to zero and light BottleDone
```

The practice counts the other way: from nothing up to a number, with a reset that brings the count back to nothing. Which counter that needs, and which of its inputs each signal goes to, is for you to choose.

## Common mistakes

- Counting with an IF, as in `IF TabletEye THEN Count := Count + 1; END_IF`. That adds one on every scan in which the input is TRUE, hundreds for one tablet. Count rising edges with a counter block.
- Calling the counter inside an IF. When the instance is not called it does not see CU, so an edge that comes and goes meanwhile is lost. Call it on every scan.
- Giving the count no way back to its start, or a way that is always open. The count then never starts again, or never moves at all.
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
