## Scaling with blocks

An analog input gives the program **raw counts**, a whole number such as 0 to 2000, and a limit is written in **engineering units**, such as percent or bar. Scaling turns one into the other: multiply the counts by the top of the units, then divide by the top of the counts. In a Function Block Diagram each step of that rule is a block, and the connection from one block to the next carries the number.

| Block  | Inputs     | Output                                           |
| ------ | ---------- | ------------------------------------------------ |
| MUL    | IN1, IN2   | the product IN1 × IN2                            |
| DIV    | IN1, IN2   | IN1 ÷ IN2, the remainder dropped                 |
| LIMIT  | MN, IN, MX | IN, kept between MN and MX                       |
| GE, LT | IN1, IN2   | a BOOL: is IN1 more or equal, or less, than IN2? |

Three rules decide whether the result is right. Put the DIV after the MUL, because a whole-number division drops the remainder. Choose DINT connections and constants, because the product, 1600 × 100 in the example below, is far above 32767, the largest INT. And compare the scaled value with the limit, never the raw counts.

## Worked example

A compressed-air tank has a pressure transmitter with a live zero: it gives 400 counts at 0 bar and 2000 counts at 10 bar, so that a broken wire, which gives 0 counts, can be told from an empty tank. A lamp `LowAir` must light while the pressure is below 6.0 bar.

A whole number cannot hold 6.0, but it can hold 60 tenths of a bar. So the diagram scales to tenths, from 0 to 100, and the limit becomes 60. The counts start at 400, so the diagram takes the live zero away first, and the span of the counts is 2000 − 400 = 1600:

- a SUB block with `Raw` on IN1 and the DINT constant 400 on IN2;
- a MUL block with SUB.OUT on IN1 and the DINT constant 100 on IN2;
- a DIV block with MUL.OUT on IN1 and the DINT constant 1600 on IN2, whose output writes `Pressure`;
- an LT block with `Pressure` on IN1 and the constant 60 on IN2, whose output writes `LowAir`.

At 1360 counts the SUB gives 960, the MUL gives 96000, the DIV gives 60 and the lamp goes out. Without the SUB, the same 1360 counts would read as 85 tenths, and the lamp would go out far too early.

```timing
span: 5000
signals:
  - { name: Compressor, edges: [500, 3000] }
  - { name: LowAir, edges: [0, 1800, 3800] }
marks:
  - { from: 1800, to: 3800, label: 'Pressure >= 60' }
caption: The lamp follows the scaled pressure, in tenths of a bar, not the raw counts
```

The practice has no live zero, but it has a LIMIT block of its own; where the missing block goes among the blocks that are already there is for you to work out.

## Common mistakes

- Placing the DIV before the MUL. The result stays 0 until full scale.
- Using INT constants or connections. The product of 1600 and 100 does not fit in an INT.
- Connecting the raw counts to the comparison. 75 counts are not 75 percent.
- Forgetting that a transmitter can fail. Counts outside the range of the transmitter mean a broken wire or a short circuit, not a real value.
- Swapping IN1 and IN2 of the DIV, which divides the top of the counts by the product.

## Check yourself

```quiz
question: In the worked example Raw is 1200 counts. What reaches the comparison?
options:
  - { text: '50', correct: true, feedback: 'Yes. SUB gives 800, MUL gives 80000, and 80000 divided by 1600 is 50 tenths of a bar.' }
  - { text: '75', feedback: 'That is 1200 times 100 divided by 1600: the live zero of 400 counts was not taken away first.' }
  - { text: '0', feedback: 'That is what a DIV before the MUL gives: 800 divided by 1600 is 0 with whole numbers.' }
```

```quiz
question: Why does a scaled value of 6.0 bar become the constant 60 in the worked example?
options:
  - { text: 'Because the diagram scales to tenths of a bar, and a whole number holds 60 but not 6.0', correct: true, feedback: 'Right. Scaling to a smaller unit keeps a decimal place with whole numbers.' }
  - { text: 'Because 60 is the raw count at 6.0 bar', feedback: 'The raw count at 6.0 bar is 1200; the comparison uses the scaled value.' }
  - { text: 'Because LIMIT multiplies by 10', feedback: 'LIMIT only keeps a value inside MN and MX; it does not change it otherwise.' }
```

## What you will do in the practice

The scenario sets only BOOL inputs, so the blocks at the top of the starting diagram make their own raw count: Raw grows by 410 counts on each scan while Enable is TRUE, up to 4095. The blocks below multiply Raw by 100 and limit the result to 0..100 before they compare Level with 75, but HighLevel lights at once. You will make Level the level in percent, so that HighLevel turns ON only when Level reaches 75. Enable rises at {{t:10}} ms and falls at {{t:110}} ms. Then press {{ui:learn.check}}.
