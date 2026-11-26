## From a signal to a number

A level sensor, a thermometer or a pressure transmitter does not give the program litres, degrees or bars. It gives an electrical signal, a current or a voltage, and the analog input of the controller turns that signal into a whole number of **raw counts**: for example 0 for the lowest signal and 1000 for the highest. The program sees only the counts.

**Scaling** turns raw counts into **engineering units**, the units a person reads and a limit is written in. When both ranges start at zero, the rule is one line: the value is the raw count times the top of the units, divided by the top of the counts.

| Raw counts | Fraction of the range | Percent |
|---|---|---|
| 0 | none | 0 |
| 250 | a quarter | 25 |
| 1000 | all | 100 |

When the units start elsewhere, for example a thermometer from −50 to 250 °C, subtract the low end of the counts first, scale by the width of each range and add the low end of the units at the end.

## Order, rounding and range with whole numbers

The scaling of this lesson uses only whole numbers, INT or DINT. Whole numbers are exact and fast, but three things decide whether the result is right.

**The order.** Division of whole numbers drops the remainder, so divide last. Dividing first throws the information away before the multiplication can use it.

| Raw | `(Raw / 1000) * 100` | `(Raw * 100) / 1000` |
|---|---|---|
| 450 | 0 | 45 |
| 999 | 0 | 99 |
| 1000 | 100 | 100 |

**The rounding.** Even in the right order the division cuts, it does not round: 999 counts give 99, not 99.9. For values that are never negative, add half the divisor before you divide to round to the nearest: `(Raw * 100 + 500) / 1000` gives 100 for 999 counts.

**The range of the product.** The largest number in the computation is the product before the division, not the raw count and not the result. Here it is 1000 × 100 = 100000, far above 32767, the largest INT. Choose the type for that product: declare the variables DINT and the product fits.

## Worked example

An oven has a thermometer whose input gives 0 counts at −50 °C and 4000 counts at 250 °C. A lamp `Ready` must light from 180 °C, when the oven may be loaded, and a lamp `OverTemp` from 240 °C.

The units are 300 °C wide and the counts 4000 wide, and the low end of the units is −50. The product reaches 4000 × 300 = 1200000, so every variable of the computation is a DINT. Adding 2000, half of 4000, rounds to the nearest degree; the division comes last, and −50 is added after it, so the rounding only ever sees positive numbers.

```st
PROGRAM Oven
VAR_INPUT Raw : DINT; END_VAR
VAR_OUTPUT Ready : BOOL; OverTemp : BOOL; END_VAR
VAR Temp : DINT; END_VAR
Temp := (Raw * 300 + 2000) / 4000 - 50;
Ready := Temp >= 180;
OverTemp := Temp >= 240;
END_PROGRAM
```

| Raw | Exact value | Temp |
|---|---|---|
| 0 | −50 °C | −50 |
| 1013 | 25.975 °C | 26 |
| 2000 | 100 °C | 100 |
| 4000 | 250 °C | 250 |

Without the 2000, 1013 counts would give 25 °C. The two lamps compare the scaled value, in degrees, with limits written in degrees, so a person can check them against the oven's dial.

```timing
span: 5000
signals:
  - { name: Heater, edges: [200, 3400] }
  - { name: Ready, edges: [1800, 4600] }
  - { name: OverTemp, edges: [3000, 3800] }
marks:
  - { from: 1800, to: 3000, label: 'Temp 180..239' }
  - { from: 3000, to: 3800, label: 'Temp >= 240' }
caption: The oven heats and cools; each lamp is a comparison of the temperature in degrees
```

## Common mistakes

- Dividing before multiplying. The result stays 0 until the input reaches full scale.
- Expecting the division to round. `/` cuts the remainder; add half the divisor first when you need the nearest value.
- Choosing the type from the raw count. An INT holds 1000, but `Raw * 100` reaches 100000, which does not fit in 16 bits.
- Comparing raw counts with a limit in units. `Raw >= 80` is not 80 percent; scale first, then compare.
- Trusting a value outside the range. A broken wire or a short circuit gives counts below 0 or above full scale; keep the result inside its range with LIMIT, or raise a fault.
- Dividing by a span that can be zero. When the counts' range comes from a setting, test it first: a division by zero stops the program.

## Check yourself

```quiz
question: Raw is 450 counts of a range from 0 to 1000. The program has Percent := (Raw / 1000) * 100; with DINT variables. What is Percent?
options:
  - { text: '0', correct: true, feedback: 'Yes. 450 / 1000 is 0 with whole numbers, and 0 times 100 is still 0.' }
  - { text: '45', feedback: 'That is what (Raw * 100) / 1000 gives. Dividing first loses the 450 before it is multiplied.' }
  - { text: '4', feedback: 'There is no remainder left to make 4: the division gives 0 at once.' }
```

```quiz
question: A thermometer gives 0 to 4000 counts and the program computes Raw * 250 before it divides by 4000. Which type do the variables of the computation need?
options:
  - { text: 'DINT', correct: true, feedback: 'Right. The product reaches 1000000, far above 32767, and a DINT holds it.' }
  - { text: 'INT, because the result is at most 250', feedback: 'The result fits, but the product is formed first, and it does not fit in an INT.' }
  - { text: 'INT, because the count is at most 4000', feedback: 'The count fits, but the product of 4000 and 250 does not.' }
```

## What you will do in the practice

The scenario sets only BOOL inputs, so the starting program makes its own raw count: Raw grows by 100 on each scan while Enable is TRUE, up to 1000, and goes back to 0 when Enable is FALSE. It then scales Raw to Percent, from 0 to 100, but it divides before it multiplies, so Percent stays at 0 until full scale. You will make Percent the right percentage, so that Warn turns ON at 50 percent and Alarm at 80 percent. Enable rises at {{t:10}} ms and falls at {{t:110}} ms. Then press {{ui:learn.check}}.
