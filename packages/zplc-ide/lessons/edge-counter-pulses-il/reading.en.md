## Counting in Instruction List

A counter adds one each time something arrives: a part at a sensor, a stroke of a pump, a press of a push button. An input that stays TRUE for many scans is still one arrival, so a counter does not count the scans in which its input is TRUE. It counts **rising edges**, the scans in which the input changes from FALSE to TRUE.

The **CTU**, the up counter, is a function block that does this for you. It keeps the value of its input from the scan before and adds one only on a rising edge. Its inputs and outputs are the same in every language:

- **CU**, count up, a BOOL: each rising edge adds one.
- **R**, reset, a BOOL: while it is TRUE, the count is zero.
- **PV**, the preset value, an INT: the number to count to.
- **Q**, a BOOL: TRUE while the count is at or above PV.
- **CV**, an INT: the count so far.

The count does not stop at PV, and Q stays TRUE until R clears the count.

## CAL runs a block, LD reads it

In Instruction List each line is one instruction that works on the current result: LD loads a value into it, ST stores it in a variable. A function block does not fit on one such line, so IL has an instruction of its own for it. **CAL** calls an instance with its inputs, named with `:=` as in Structured Text:

```il
        CAL   Strokes(CU := PumpStroke, R := NextDose, PV := 5)
```

The instance is declared in `VAR` like any other variable, as `Strokes : CTU;`. After the CAL, its outputs are ordinary operands: `LD Strokes.Q` loads Q into the current result, and an ST stores it in an output. The lines run from top to bottom, so the order matters: a line above the CAL reads what the counter answered on the scan before.

## Worked example

A dosing pump gives one stroke each time a cam closes the switch `PumpStroke`; the switch stays closed for a part of each stroke. A dose is five strokes. After the fifth, the lamp `DoseDone` lights, and the operator starts the next dose with the push button `NextDose`, which clears the count.

```il
PROGRAM Dosing
VAR_INPUT
    PumpStroke : BOOL;
    NextDose : BOOL;
END_VAR
VAR_OUTPUT
    DoseDone : BOOL;
END_VAR
VAR
    Strokes : CTU;
END_VAR

        CAL   Strokes(CU := PumpStroke, R := NextDose, PV := 5)
        LD    Strokes.Q
        ST    DoseDone
END_PROGRAM
```

The CAL runs the counter with the newest value of the switch, so each closing adds one, however long it lasts. The LD reads Q in the same scan, and the ST writes it to the lamp.

```timing
span: 6000
signals:
  - { name: PumpStroke, edges: [300, 700, 1100, 1500, 1900, 2300, 2700, 3100, 3500, 3900] }
  - { name: DoseDone, edges: [3500, 4800] }
  - { name: NextDose, edges: [4800, 5200] }
marks:
  - { from: 3500, to: 4800, label: 'CV = 5' }
caption: Five closings of the switch light DoseDone; NextDose clears the count
```

## Common mistakes

- Declaring the counter and never calling it. Without a CAL the instance never runs, so Q stays FALSE.
- Putting `LD Strokes.Q` above the CAL. The output then comes from the previous scan, one scan late.
- Leaving R out of the CAL. The counter never sees the reset, and the count never returns to zero.
- Expecting Q to fall when the count passes PV. Q stays TRUE until a reset.

## Check yourself

```quiz
question: A program declares a CTU named Count, then has LD Count.Q and ST Lamp, and no CAL. What does Lamp do when pulses arrive?
options:
  - { text: 'It stays FALSE', correct: true, feedback: 'Yes. Without a CAL the counter never runs, so its Q keeps its first value, FALSE.' }
  - { text: 'It turns TRUE at the preset', feedback: 'The counter would need to run to count. Only a CAL runs it.' }
  - { text: 'It follows the pulses', feedback: 'Lamp reads Count.Q, not the pulses, and Count.Q never changes.' }
```

```quiz
question: In a program, the line LD Count.Q comes before CAL Count(...). The count reaches PV in this scan. When does the output that is stored from Q turn TRUE?
options:
  - { text: 'In the next scan', correct: true, feedback: 'Right. LD read Q before the CAL updated it, so the new Q is seen one scan later.' }
  - { text: 'In this scan', feedback: 'The LD ran before the CAL, so it read the Q of the previous scan.' }
  - { text: 'Never', feedback: 'Q is read on every scan; it is only one scan late.' }
```

## What you will do in the practice

The starting program declares a counter, Count, but never calls it, and stores FALSE in CountReached. You will make CountReached turn on at the third rising edge of PulseInput, at {{t:50}} ms, and turn off when Reset is pressed at {{t:70}} ms. Then press {{ui:learn.check}}.
