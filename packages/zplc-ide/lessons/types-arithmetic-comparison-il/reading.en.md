## Numbers in the current result

Instruction List works one line at a time on a single value, the **current result**. `LD` loads a value into it and `ST` stores it in a variable. The current result can hold a BOOL, as in a line of logic, or a number, such as an INT from −32768 to 32767, and the instructions of this lesson work on that number.

| Instruction                        | What it does to the current result                     | Leaves                           |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------- |
| `ADD n`, `SUB n`, `MUL n`, `DIV n` | adds, subtracts, multiplies or divides by n            | a number of the same type        |
| `LT n`, `EQ n`, `GT n`, `GE n`     | asks: less, equal, more, more or equal than n?         | a BOOL                           |
| `JMPC label`, `JMPCN label`        | jumps to `label:` when it is TRUE, or when it is FALSE | the program goes on at the label |

So `LD Count`, `ADD 3`, `ST Count` read a number, add to it and store it back, and `LD Count`, `LT 10`, `ST Few` turn the number into a yes or a no. Every line runs on every scan, from top to bottom. To change a number only on some scans, compute the condition first and jump over the arithmetic when the condition is FALSE: the jump skips those lines on that scan only.

## Worked example

A small hall has 50 seats. A turnstile at the entrance gives `Pass` while a visitor walks through, for several scans. The program counts the free seats down in the INT `Seats`, which starts at 50, and a lamp `HallFull` lights when no seat is left. A visitor who passes when the hall is already full must not take the count below zero.

Two conditions guard the subtraction, and each one jumps over it. The first, `LE 0`, jumps with JMPC when there are no seats left. The second is the rising edge, `Pass` now and not on the previous scan, and it jumps with JMPCN when there is no new pass.

```il
        LD    Seats
        LE    0
        JMPC  done
        LD    Pass
        ANDN  PassWas
        JMPCN done
        LD    Seats
        SUB   1
        ST    Seats
done:
        LD    Pass
        ST    PassWas
        LD    Seats
        EQ    0
        ST    HallFull
```

Follow the last visitors on the diagram. With 2 seats left, a long pass takes one seat once: on its first scan both jumps are skipped and Seats falls by one, and on the following scans `PassWas` is TRUE and JMPCN jumps. The next visitor takes the last seat and `HallFull` lights. One more visitor passes: `LE 0` is TRUE, JMPC jumps, and Seats stays at 0.

```timing
span: 4000
signals:
  - { name: Pass, edges: [500, 1500, 2000, 2200, 3000, 3200] }
  - { name: HallFull, edges: [2000, 4000] }
marks:
  - { from: 0, to: 500, label: 'Seats 2' }
  - { from: 500, to: 2000, label: 'Seats 1' }
  - { from: 2000, to: 4000, label: 'Seats 0' }
caption: Each pass takes one seat once; with the hall full a pass changes nothing
```

The lines after the label run on every scan, so `PassWas` and `HallFull` are always up to date. This hall never empties; the practice has a reset of its own, and how its lines sit among the others is for you to decide.

## Common mistakes

- Leaving out `ANDN PassWas`. The condition is then TRUE on every scan of the pass, and a slow visitor counts many times.
- Storing the old value too early. If `PassWas` is stored above the condition, the condition sees the new value and is never TRUE.
- Swapping `JMPC` and `JMPCN`. `JMPCN` jumps when the condition is FALSE, which is what skips the addition.
- Using `GE` where the task asks for `EQ`: GE stays TRUE above the limit too.
- Forgetting the colon of the label, or giving two labels the same name.

## Check yourself

```quiz
question: The lines are LD Total, GT 10, ST High, and Total is 10. What is stored in High?
options:
  - { text: 'FALSE', correct: true, feedback: 'Yes. 10 is not more than 10, so GT leaves FALSE in the current result.' }
  - { text: 'TRUE', feedback: 'That would be GE, which is also TRUE at the limit.' }
  - { text: '10', feedback: 'A comparison replaces the number with a BOOL; ST then stores that BOOL.' }
```

```quiz
question: A program has LD Run, JMPCN wait, LD Ticks, ADD 2, ST Ticks, wait:, with no edge condition. Run is TRUE for three scans. How much does Ticks grow?
options:
  - { text: '6', correct: true, feedback: 'Right. The jump happens only while Run is FALSE, so the addition runs on each of the three scans.' }
  - { text: '2', feedback: 'That needs ANDN on the value of Run from the previous scan, so that the condition is TRUE on one scan only.' }
  - { text: '0', feedback: 'JMPCN jumps when the condition is FALSE; while Run is TRUE it does not jump.' }
```

## What you will do in the practice

The starting program writes the three comparisons for Low, Exact and High, and stores Step in StepWas on its first lines, before any condition could read the value of the previous scan. Nothing ever changes Total. You will make Total grow by 5 on each press of Step, however long the press lasts, and go back to 0 while Reset is TRUE. The scenario presses Step three times, the first press lasting two scans, and presses Reset at {{t:80}} ms. Then press {{ui:learn.check}}.
