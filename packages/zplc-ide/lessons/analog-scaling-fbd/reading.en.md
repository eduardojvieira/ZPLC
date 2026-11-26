## Scaling with blocks

An analog input gives the program **raw counts**, a whole number such as 0 to 4095, and a limit is written in **engineering units**, such as percent or bar. Scaling turns one into the other: multiply the counts by the top of the units, then divide by the top of the counts. In a Function Block Diagram each step of that rule is a block, and the wire from one block to the next carries the number.

| Block | Inputs | Output |
|---|---|---|
| MUL | IN1, IN2 | the product IN1 × IN2 |
| DIV | IN1, IN2 | IN1 ÷ IN2, the remainder dropped |
| LIMIT | MN, IN, MX | IN, kept between MN and MX |
| GE, LT | IN1, IN2 | a BOOL: is IN1 more or equal, or less, than IN2? |

The same three rules hold as in Structured Text. Put the DIV after the MUL, because a whole-number division drops the remainder. Choose DINT wires and constants, because the product, 4095 × 100 here, is far above 32767, the largest INT. And compare the scaled value with the limit, never the raw counts.

## Worked example

A compressed-air tank has a pressure transmitter that gives 0 counts at 0 bar and 4095 counts at 10 bar. A lamp `LowAir` must light while the pressure is below 6.0 bar.

A whole number cannot hold 6.0, but it can hold 60 tenths of a bar. So the diagram scales to tenths, from 0 to 100, and the limit becomes 60:

- a MUL block with `Raw` on IN1 and the DINT constant 100 on IN2;
- a DIV block with MUL.OUT on IN1 and the DINT constant 4095 on IN2;
- a LIMIT block with 0 on MN, DIV.OUT on IN and 100 on MX, whose output writes `Pressure`;
- an LT block with `Pressure` on IN1 and the constant 60 on IN2, whose output writes `LowAir`.

At 2457 counts the MUL gives 245700, the DIV gives 60 and the lamp goes out. The LIMIT keeps a broken transmitter, which may report more than 4095 counts, from showing more than 10 bar.

```timing
span: 5000
signals:
  - { name: Compressor, edges: [500, 3000] }
  - { name: LowAir, edges: [0, 1800, 3800] }
marks:
  - { from: 1800, to: 3800, label: 'Pressure >= 60' }
caption: The lamp follows the scaled pressure, in tenths of a bar, not the raw counts
```

## Common mistakes

- Placing the DIV before the MUL. The result stays 0 until full scale.
- Using INT constants or wires. The product of 4095 and 100 does not fit in an INT.
- Wiring the raw counts to the comparison. 75 counts are not 75 percent.
- Leaving the LIMIT out, or putting it before the DIV, where it clamps the product instead of the scaled value.
- Swapping IN1 and IN2 of the DIV, which divides 4095 by the product.

## Check yourself

```quiz
question: A diagram wires Raw to MUL with 100, then to LIMIT 0..100, and only then to DIV by 4095. Raw is 410. What reaches the comparison?
options:
  - { text: '0', correct: true, feedback: 'Yes. MUL gives 41000, LIMIT clamps it to 100, and 100 divided by 4095 is 0 with whole numbers.' }
  - { text: '10', feedback: 'That is what MUL, DIV and LIMIT give in that order. The LIMIT before the DIV clamps the product.' }
  - { text: '100', feedback: 'That is the output of the LIMIT; the DIV after it still divides by 4095.' }
```

```quiz
question: Why does a scaled value of 6.0 bar become the constant 60 in the worked example?
options:
  - { text: 'Because the diagram scales to tenths of a bar, and a whole number holds 60 but not 6.0', correct: true, feedback: 'Right. Scaling to a smaller unit keeps a decimal place with whole numbers.' }
  - { text: 'Because 60 is the raw count at 6.0 bar', feedback: 'The raw count at 6.0 bar is about 2457; the comparison uses the scaled value.' }
  - { text: 'Because LIMIT multiplies by 10', feedback: 'LIMIT only keeps a value inside MN and MX; it does not change it otherwise.' }
```

## What you will do in the practice

The scenario sets only BOOL inputs, so the blocks at the top of the starting diagram make their own raw count: Raw grows by 410 counts on each scan while Enable is TRUE, up to 4095. The blocks below multiply Raw by 100 and limit the result to 0..100 before they compare Level with 75, but nothing divides by 4095, so HighLevel lights at once. You will make Level the level in percent, so that HighLevel turns ON only when Level reaches 75. Enable rises at {{t:10}} ms and falls at {{t:110}} ms. Then press {{ui:learn.check}}.
