## What this is for

Picture a water tank in a small factory. A float sensor tells the PLC how full the tank is, and the PLC has to do three things with that number: light a lamp when the tank is nearly full, work out how full it is in percent, and keep the last value when nothing changes. In the earlier lessons your rungs only asked yes-or-no questions: is the button pressed, is the timer finished. A tank level is not yes or no. It is a **number**, and numbers need two new tools: boxes that **compare** and boxes that **calculate**.

In Ladder both kinds are drawn as a small box in the rung, next to your contacts and coils. This page explains how a box behaves, and one mistake that can stop the whole machine.

## A comparison is a condition

A **comparison box** takes two values and asks a question about them. `GT` asks "is the first greater than the second?". The others are `GE` (greater or equal), `EQ` (equal), `NE` (not equal), `LE` (less or equal) and `LT` (less than).

The values the box works on are its **operands**. An operand is a variable or a plain number such as `100`.

A comparison box behaves like a contact. It sits in series with the other elements of the rung, and power passes through it only if the power arriving from the left is on **and** the comparison is true. In the figure, the lamp `HighAlarm` is on while `Level` is greater than `100`. There is no button and no coil in between: the comparison is the condition.

```ld-figure
src: reading/tank-alarm.ld.json
caption: The GT box of rung 3 is a condition in series with the coil
```

## Try it

Each press of Fill adds 25 liters, and each press of Drain takes 25. Press Fill four times and watch the alarm lamp, then press it a fifth time, then press Drain once.

```ld-try
src: reading/tank-alarm.ld.json
inputs:
  - { name: Fill, kind: push }
  - { name: Drain, kind: push }
outputs: [HighAlarm]
caption: The fifth press of Fill passes 100 liters
```

After four presses the level is 100 liters and the alarm is still off, because `GT` means strictly greater. The fifth press gives 125, the first value above 100. With `GE` the alarm would already be on at 100. Choosing between `GT` and `GE` is the most common decision with comparison boxes.

## A calculation runs only while its rung has power

The **math boxes** are `ADD`, `SUB`, `MUL` (multiply), `DIV` (divide) and `MOD` (the remainder of a division). Each takes two operands and writes its result into an **output variable**. `MOVE` copies one value into a variable, and `LIMIT`, `MIN` and `MAX` choose a value from a range. In the figure above, the rung with `Fill` and `ADD(Filled, 25) -> Filled` reads: while this rung has power, put `Filled + 25` into `Filled`.

The important rule is this: **a math box runs only while the power reaching it is on.** When the rung has no power, the box does nothing, and its output variable **keeps the value it had**. That is why `Filled` does not go back to zero when you release Fill. The variable is memory, and no rung is writing to it.

Compare that with a coil, which is switched off whenever its rung has no power. A box output is not like that. If you need a value to go back to a starting number, a second rung has to write it, for example `MOVE(0)`.

A box also passes power on. When a math box has power in, it has power out, so you can chain several boxes in one rung and they all run in order from left to right. Two comparisons chained in series work as AND.

One rule goes with it: **one variable, one writer**. In ZPLC Ladder only one element may write a given variable, and a second box or coil on the same variable is an error reported at the second one. That is why the figure keeps two totals, `Filled` and `Drained`, and calculates `Level` from them in a box of its own, instead of one `Level` that two rungs try to change.

## The zero divisor

Now the dangerous box. Dividing by zero has no answer, and the ZPLC runtime does not guess one. When a `DIV` or `MOD` box receives a zero divisor, the virtual machine **faults**: the scan ends with an error and the program stops running. Ladder does not stop it, warn about it or skip it. The box itself detects nothing.

> [!WARNING]
> A divisor that can be zero must be guarded. Put a comparison in series, before the `DIV`: `NE(Bottles, 0)` conducts only when `Bottles` is not zero, so the `DIV` gets no power while the divisor is zero. Without it, one scan with a zero divisor stops the program.

This figure shows the guard in rung 5 of another program. A case of bottles has an average weight, which is the total weight divided by the number of bottles. When the case is empty, the number of bottles is zero, and the guard keeps the average from being computed.

```ld-figure
src: reading/case-average.ld.json
rung: 5
caption: NE in series keeps the DIV from receiving a zero divisor
```

```ld-try
src: reading/case-average.ld.json
inputs:
  - { name: AddLight, kind: push }
  - { name: AddHeavy, kind: push }
outputs: [Heavy, Empty]
caption: A light bottle weighs 280 g and a heavy one 360 g
```

In the lab, the lamp `Empty` is on until the first bottle. Add one light bottle: the average is 280 and `Heavy` stays off. Add a heavy one: 640 divided by 2 is 320, which is above 300, and `Heavy` turns on. The division gives a whole number: it drops the decimals, so 7 divided by 2 is 3.

## Common mistakes

- Writing one variable from two rungs. The build stops with an error at the second box: split the work into two variables and calculate the result in a third.
- Expecting a box output to turn off with its rung. It does not: it keeps its value until another rung writes it.
- Putting the guard after the `DIV`. The guard has to come first, from the left, because power flows from left to right.
- Using `GT` when the rule says "at least". Read the rule word by word and check the value that sits exactly on the limit.
- Using a type that does not fit. A box that writes text into a number does not compile, and the editor shows the error at the box.

> [!WARNING]
> A high level lamp on the screen is information, not protection. A float switch or an overflow stop that protects people or equipment is wired in hardware and never depends on the PLC program. ZPLC makes no safety claim about any lesson.

## Check yourself

```quiz
question: The rung Fill and ADD(Filled, 25) -> Filled has no power because Fill is released. What is Filled?
options:
  - { text: 'It keeps the value it had', correct: true, feedback: Right. A math box writes only while it has power, and a variable keeps its value between scans. }
  - { text: 'It goes back to 0', feedback: Only a coil is switched off without power. A variable written by a box stays as it was. }
  - { text: 'The program stops with an error', feedback: Nothing is wrong with an idle box. Only a division by zero faults the program. }
```

```quiz
question: Capacity can be 0 before the setup. How do you protect DIV(Scaled, Capacity)?
options:
  - { text: 'Put NE(Capacity, 0) in series, to the left of the DIV', correct: true, feedback: Right. The DIV gets power only when Capacity is not zero. }
  - { text: 'Put NE(Capacity, 0) after the DIV', feedback: By then the division has already happened and the program has faulted. }
  - { text: 'Do nothing: the DIV by zero gives 0', feedback: It does not. On the ZPLC runtime a division by zero faults the virtual machine. }
```

## What you will do in the practice

In the practice you get a tank monitor. Setup copies the capacity of 200 liters, Fill and Drain move the level in steps of 25, and the lamp `Configured` shows that the capacity is known. The percentage rung is missing. You will add three boxes in one rung, `NE`, `MUL` and `DIV`, so that `Percent` is the level multiplied by 100 and divided by the capacity, and the alarm rung that already exists lights `HighAlarm` at {{t:80}} ms.
