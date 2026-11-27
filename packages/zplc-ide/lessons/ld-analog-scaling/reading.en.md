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

In Ladder these are two boxes in one rung: `MUL` and then `DIV`. A third box, `LIMIT`, keeps a value between a minimum and a maximum, so a sensor that reports something strange never pushes the program out of range.

## Two traps of integer arithmetic

**The order matters.** A whole-number division throws away the decimals: 7 divided by 2 is 3. Look at what happens with a half-full tank, 2048 counts. Multiply first: 2048 times 2000 is 4 096 000, and divided by 4095 it gives 1000. Divide first: 2048 divided by 4095 is 0 with the decimals thrown away, and 0 times 2000 is 0. The level reads zero until the input is at full scale. Multiply first, divide last.

**The size of the variable matters.** An `INT` is 16 bits and holds numbers from -32768 to 32767. The product 4095 times 2000 is 8 190 000, which does not fit. The box does not warn you: the number **wraps around** and gives a wrong result without any error. A `DINT` is 32 bits and holds numbers beyond two billion, so it is the right type for the intermediate product. A `REAL` would also work: it holds decimals, and the numbers in the boxes are then written as `2000.0` and `4095.0`.

> [!WARNING]
> Overflow gives no error. Before you pick a type, work out the biggest value that the intermediate product can take, with the sensor at full scale. If it does not fit, the type is wrong.

## Worked example

Scaling also runs the other way, from engineering units to counts. A dosing pump runs at any speed from 0 to 3000 rpm, and its drive takes the speed as an analog command from 0 to 4095 counts. The operator sets the speed in rpm, and the program must turn that setpoint into counts for the drive: `Command = Rpm * 4095 / 3000`. Now the span of the counts multiplies and the span of the speed divides. `MUL` still comes first, into a DINT: at full speed the product is 12 285 000.

```ld-figure
src: reading/pump-command.ld.json
rung: 5
caption: Revolutions per minute to counts, in two boxes
```

This lab has buttons for the setpoint: each press of SpeedUp adds 500 rpm and each press of SpeedDown takes 500 away, and LIMIT keeps the setpoint between 0 and 3000. Press SpeedUp once, then five more times, watching the two lamps, and then press SpeedDown once.

```ld-try
src: reading/pump-command.ld.json
inputs:
  - { name: SpeedUp, kind: push }
  - { name: SpeedDown, kind: push }
outputs: [DriveOn, FullCommand]
caption: DriveOn needs a command above zero; FullCommand needs 4095 counts
```

After one press the setpoint is 500 rpm: 500 times 4095 is 2 047 500, divided by 3000 it gives 682 counts, and `DriveOn` turns on. After six presses the setpoint is 3000 rpm, the command is 4095 and `FullCommand` turns on. One press of SpeedDown takes the setpoint to 2500 rpm and the command to 3412 counts, and `FullCommand` goes out. The thresholds of the lamps are written in counts here, because the drive is what reads them.

## Common mistakes

- Comparing counts with a limit written in percent. Scale first, then compare.
- Dividing before multiplying, which throws away the part of the value that is smaller than the divisor.
- Using an `INT` for the product. It wraps, and the program keeps running with a wrong level.
- Taking the number of counts for their span. A 12-bit input has 4096 different counts, from 0 to 4095, and its span is the distance from the lowest to the highest.

> [!WARNING]
> A level alarm in the program is information. A high level cut-off that protects people or equipment is wired in hardware, and an emergency stop never depends on the PLC program.

## Check yourself

```quiz
question: On the pump of the worked example, the setpoint is 1000 rpm. Which order gives the command of 1365 counts for the 0..3000 rpm range, using whole numbers and a DINT?
options:
  - { text: 'Rpm * 4095 / 3000', correct: true, feedback: 'Right. 1000 times 4095 is 4 095 000, and divided by 3000 it is 1365 with the decimals dropped.' }
  - { text: 'Rpm / 3000 * 4095', feedback: 'Rpm divided by 3000 is 0 as a whole number, and 0 times 4095 is still 0.' }
  - { text: 'Rpm * 3000 / 4095', feedback: 'This has the spans the wrong way around: it gives 732, which is not the command for 1000 rpm on a 0..3000 pump.' }
```

```quiz
question: Why is the intermediate variable a DINT and not an INT?
options:
  - { text: 'The product of the counts and the span does not fit in 16 bits', correct: true, feedback: 'Right. An INT would wrap around with no error and the level would be wrong.' }
  - { text: 'A DINT is faster', feedback: 'Speed is not the reason. The product has to fit in the variable.' }
  - { text: 'An INT cannot hold negative numbers', feedback: 'An INT holds negative numbers. The problem is its size.' }
```

## What you will do in the practice

In the practice, the program has no sensor either: some blocks at the top stand in for a potentiometer, adding 410 counts on each scan while `Enable` is on, and a `LIMIT` box keeps the count at 4095. The rung that turns counts into percent is missing. You will add it, so that the level reads in percent and `Warn` turns on at {{t:50}} ms and `HighLevel` at {{t:80}} ms. Then press {{ui:learn.check}}.
