## From a signal to a number

A level sensor, a thermometer or a pressure transmitter does not give the program litres, degrees or bars. It gives an electrical signal, a current or a voltage, and the analog input of the controller turns that signal into a whole number of **raw counts**: for example 0 for the lowest signal and 4000 for the highest. The program sees only the counts.

**Scaling** turns raw counts into **engineering units**, the units a person reads and a limit is written in. When both ranges start at zero, the value is the same fraction of the units as the raw count is of the counts.

| Raw counts | Fraction of the range | Percent |
| ---------- | --------------------- | ------- |
| 0          | none                  | 0       |
| 1000       | a quarter             | 25      |
| 4000       | all                   | 100     |

When the units start elsewhere, for example a thermometer from −50 to 250 °C, subtract the low end of the counts first, scale by the width of each range and add the low end of the units at the end.

## Remainders, rounding and range with whole numbers

The scaling of this lesson uses only whole numbers, INT or DINT. Whole numbers are exact and fast, but three things decide whether the result is right.

**The remainder.** Division of whole numbers drops the remainder: `7 / 2` is 3, and `7 MOD 2` is the 1 that was dropped. Every division drops its own remainder, so where a computation divides decides how much it loses. Take two scales under one tray, read in `A` and `B` in grams, and the average weight of the two:

| A   | B   | `A / 2 + B / 2` | `(A + B) / 2` |
| --- | --- | --------------- | ------------- |
| 7   | 9   | 7               | 8             |
| 5   | 5   | 4               | 5             |
| 8   | 8   | 8               | 8             |

The first form divides twice and drops two remainders; the second adds first and divides once.

**The rounding.** A division cuts, it does not round: `(7 + 8) / 2` gives 7, not 7.5. For values that are never negative, add half the divisor before you divide to round to the nearest: `(7 + 8 + 1) / 2` gives 8.

**The range of an intermediate value.** The largest number of a computation can be a value it forms on its way, not the raw count and not the result. A count of 4000 times a width of 250 is 1000000, far above 32767, the largest INT. Choose the type for the largest value the computation forms: declare the variables DINT and it fits.

## Worked example

An oven has two thermometers, already scaled to tenths of a degree in `T1` and `T2`, because one alone may read high near the door. A lamp `Ready` must light when the average reaches 180.0 °C, when the oven may be loaded, and a lamp `OverTemp` when it reaches 240.0 °C.

The average is the sum divided by two, with half the divisor added to round to the nearest tenth. The sum of two temperatures of up to 3000 tenths is 6000, which an INT would hold, but the oven program uses DINT for every variable of its computations, so that a later change cannot overflow it.

```st
PROGRAM Oven
VAR_INPUT T1 : DINT; T2 : DINT; END_VAR
VAR_OUTPUT Ready : BOOL; OverTemp : BOOL; END_VAR
VAR Avg : DINT; END_VAR
Avg := (T1 + T2 + 1) / 2;
Ready := Avg >= 1800;
OverTemp := Avg >= 2400;
END_PROGRAM
```

| T1   | T2   | Exact average | Avg  |
| ---- | ---- | ------------- | ---- |
| 1799 | 1800 | 1799.5        | 1800 |
| 1790 | 1801 | 1795.5        | 1796 |
| 2400 | 2401 | 2400.5        | 2401 |

Without the 1, 1799 and 1800 would give 1799, and the oven would wait one tenth longer. The two lamps compare the average, in tenths of a degree, with limits written in tenths, so a person can check them against the oven's dial.

```timing
span: 5000
signals:
  - { name: Heater, edges: [200, 3400] }
  - { name: Ready, edges: [1800, 4600] }
  - { name: OverTemp, edges: [3000, 3800] }
marks:
  - { from: 1800, to: 3000, label: 'Avg 1800..2399' }
  - { from: 3000, to: 3800, label: 'Avg >= 2400' }
caption: The oven heats and cools; each lamp is a comparison of the average in tenths of a degree
```

The practice scales a raw count, not an average. How its line keeps the remainder it needs is for you to work out.

## Common mistakes

- Dividing each part before adding the parts. `7 / 2 + 9 / 2` is 7, not 8: each division drops its own remainder.
- Expecting the division to round. `/` cuts the remainder; add half the divisor first when you need the nearest value.
- Choosing the type from the raw count. An INT holds 4000, but a product of 4000 and 250 reaches 1000000, which does not fit in 16 bits.
- Comparing raw counts with a limit in units. 200 counts are not 200 revolutions per minute; scale first, then compare.
- Trusting a value outside the range. A broken wire or a short circuit gives counts below 0 or above full scale; keep the result inside its range with LIMIT, or raise a fault.
- Dividing by a span that can be zero. When the counts' range comes from a setting, test it first: a division by zero stops the program.

## Check yourself

```quiz
question: A is 7 and B is 9. The program has Avg := A / 2 + B / 2; with DINT variables. What is Avg?
options:
  - { text: '7', correct: true, feedback: 'Yes. 7 / 2 is 3 and 9 / 2 is 4 with whole numbers; each division drops its own remainder.' }
  - { text: '8', feedback: 'That is what (A + B) / 2 gives: it adds first and drops one remainder only.' }
  - { text: '7.5', feedback: 'Whole numbers have no half: each division drops its remainder.' }
```

```quiz
question: A flow meter gives 0 to 2000 counts for 0 to 600 litres per minute, and the computation forms the product of the count and 600 on its way to litres per minute. Which type do the variables of the computation need?
options:
  - { text: 'DINT', correct: true, feedback: 'Right. The product reaches 1200000, far above 32767, and a DINT holds it.' }
  - { text: 'INT, because the result is at most 600', feedback: 'The result fits, but the product is formed on the way, and it does not fit in an INT.' }
  - { text: 'INT, because the count is at most 2000', feedback: 'The count fits, but the product of 2000 and 600 does not.' }
```

## What you will do in the practice

The scenario sets only BOOL inputs, so the starting program makes its own raw count: Raw grows by 100 on each scan while Enable is TRUE, up to 1000, and goes back to 0 when Enable is FALSE. It then scales Raw to Percent, from 0 to 100, but Percent stays at 0 until full scale. You will make Percent the right percentage, so that Warn turns ON at 50 percent and Alarm at 80 percent. Enable rises at {{t:10}} ms and falls at {{t:110}} ms. Then press {{ui:learn.check}}.
