## What this is for

Most of what a machine senses is not yes or no. How full is the tank? How hot is the oven? How far is the valve open? These are **analog** quantities: they change smoothly between a minimum and a maximum. A float switch can only say "full" or "not full". A level sensor says how full, all the time.

A PLC does not understand liters or degrees. It understands numbers. This page follows one signal from the sensor to a lamp, and explains the two traps on the way: the units, and the arithmetic.

## From a knob to a number

The simplest analog sensor is a **potentiometer**, the knob on a volume control. Turning it changes a voltage smoothly, from zero at one end to the full supply voltage at the other. An industrial level sensor works the same way, except that it often reports its measurement as a **current** between 4 mA and 20 mA instead of a voltage. Industry likes that range for a good reason: a broken wire gives 0 mA, which no healthy sensor ever reports, so the PLC can tell "empty" from "cable cut".

The PLC cannot work with a current. An **analog input module** converts it into an integer with an analog-to-digital converter. The integer is called the **raw value**, and its unit is **counts**. A common converter is 12 bits, which has 4096 possible values, so the counts run from 0 to 4095. In ZPLC an analog input is a word, such as `%IW0`, as you saw in the lesson about variables and types.

Counts are not liters. 2048 counts mean "half way" on the input, but what is half way? Half of a 2000 mm tank is 1000 mm. To get there the program must do arithmetic. That is **scaling**: the program converts counts into **engineering units** such as millimeters, percent or degrees.

## Scaling with boxes

For a straight line from zero, the formula is the raw value times the span of the units, divided by the span of the counts:

`Level = Raw * 2000 / 4095`

In Ladder these are two boxes in one rung: `MUL` and then `DIV`. The next figure scales a tank of 2000 mm. A third box, `LIMIT`, keeps a value between a minimum and a maximum, so a sensor that reports something strange never pushes the program out of range.

```ld-figure
src: reading/tank-gauge.ld.json
rung: 5
caption: Counts to millimeters, in two boxes
```

## Try it

This lab has no sensor, so a knob stands in for it: each press of TurnUp adds 512 counts and each press of TurnDown takes 512 away. Press TurnUp seven times, watching the two lamps, and then press TurnDown once.

```ld-try
src: reading/tank-gauge.ld.json
inputs:
  - { name: TurnUp, kind: push }
  - { name: TurnDown, kind: push }
outputs: [Warn, High]
caption: Warn needs 1000 mm; High needs more than 1500 mm
```

After four presses the level is 1000 mm and `Warn` turns on. After six presses it is exactly 1500 mm, and `High` stays off because its comparison is `GT`. The seventh press gives 1750 mm and `High` turns on. This is a level alarm driven by a comparison box, with the threshold written in engineering units and not in counts.

## Two traps of integer arithmetic

**The order matters.** A whole-number division throws away the decimals: 7 divided by 2 is 3. Look at what happens with a half-full tank, 2048 counts. Multiply first: 2048 times 2000 is 4 096 000, and divided by 4095 it gives 1000. Divide first: 2048 divided by 4095 is 0 with the decimals thrown away, and 0 times 2000 is 0. The level reads zero until the input is at full scale. Multiply first, divide last.

**The size of the variable matters.** An `INT` is 16 bits and holds numbers from -32768 to 32767. The product 4095 times 2000 is 8 190 000, which does not fit. The box does not warn you: the number **wraps around** and gives a wrong result without any error. A `DINT` is 32 bits and holds numbers beyond two billion, so it is the right type for the intermediate product. A `REAL` would also work: it holds decimals, and the numbers in the boxes are then written as `2000.0` and `4095.0`.

> [!WARNING]
> Overflow gives no error. Before you pick a type, work out the biggest value that the intermediate product can take, with the sensor at full scale. If it does not fit, the type is wrong.

## Common mistakes

- Comparing counts with a limit written in percent. Scale first, then compare.
- Dividing before multiplying, which throws away the part of the value that is smaller than the divisor.
- Using an `INT` for the product. It wraps, and the program keeps running with a wrong level.
- Forgetting that the division is by the span of the counts, 4095, and not by 4096.

> [!WARNING]
> A level alarm in the program is information. A high level cut-off that protects people or equipment is wired in hardware, and an emergency stop never depends on the PLC program. ZPLC makes no safety claim about any lesson.

## Check yourself

```quiz
question: Raw is 3000 counts. Which order gives the percentage 73 for a 0..100 range, using whole numbers and a DINT?
options:
  - { text: 'Raw * 100 / 4095', correct: true, feedback: Right. 300000 divided by 4095 is 73 with the decimals dropped. }
  - { text: 'Raw / 4095 * 100', feedback: Raw divided by 4095 is 0 as a whole number, and 0 times 100 is still 0. }
  - { text: 'Raw / 100 * 4095', feedback: This has the span the wrong way around and does not give a percentage. }
```

```quiz
question: Why is the intermediate variable a DINT and not an INT?
options:
  - { text: 'The product of the counts and the span does not fit in 16 bits', correct: true, feedback: Right. An INT would wrap around with no error and the level would be wrong. }
  - { text: 'A DINT is faster', feedback: Speed is not the reason. The product has to fit in the variable. }
  - { text: 'An INT cannot hold negative numbers', feedback: An INT holds negative numbers. The problem is its size. }
```

## What you will do in the practice

In the practice, the program has no sensor either: some blocks at the top stand in for a potentiometer, adding 410 counts on each scan while `Enable` is on, and a `LIMIT` box keeps the count at 4095. The rung that turns counts into percent is missing. You will add `MUL` and `DIV` in the right order, so that `Warn` turns on at {{t:50}} ms and `HighLevel` at {{t:80}} ms.
