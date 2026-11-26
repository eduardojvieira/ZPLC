## Numbers in the current result

Instruction List works one line at a time on a single value, the **current result**. `LD` loads a value into it and `ST` stores it in a variable. Until now the current result was a BOOL; it can just as well hold a number, such as an INT from −32768 to 32767, and the instructions of this lesson work on that number.

| Instruction | What it does to the current result | Leaves |
|---|---|---|
| `ADD n`, `SUB n`, `MUL n`, `DIV n` | adds, subtracts, multiplies or divides by n | a number of the same type |
| `LT n`, `EQ n`, `GT n`, `GE n` | asks: less, equal, more, more or equal than n? | a BOOL |
| `JMPC label`, `JMPCN label` | jumps to `label:` when it is TRUE, or when it is FALSE | the program goes on at the label |

So `LD Count`, `ADD 3`, `ST Count` read a number, add to it and store it back, and `LD Count`, `LT 10`, `ST Few` turn the number into a yes or a no. Every line runs on every scan, from top to bottom. To change a number only on some scans, compute the condition first and jump over the arithmetic when the condition is FALSE: the jump skips those lines on that scan only.

## Worked example

A turnstile at the entrance of a hall gives `Pass` while a visitor walks through, for several scans. The program counts the visitors in the INT `Visitors`, and a lamp `Crowded` lights from the fiftieth visitor on.

The rising edge, `Pass` now and not on the previous scan, is the condition. When it is FALSE the program jumps over the three lines that add one.

```il
        LD    Pass
        ANDN  PassWas
        JMPCN counted
        LD    Visitors
        ADD   1
        ST    Visitors
counted:
        LD    Pass
        ST    PassWas
        LD    Visitors
        GE    50
        ST    Crowded
```

Follow one visitor on the diagram. On the first scan of `Pass` the condition is TRUE, the jump does not happen and Visitors grows by one. On the following scans `PassWas` is already TRUE, the condition is FALSE and the jump skips the addition. The lines after the label run on every scan, so `PassWas` and `Crowded` are always up to date.

```timing
span: 4000
signals:
  - { name: Pass, edges: [500, 1500, 2500, 2700] }
  - { name: PassWas, edges: [600, 1600, 2600, 2800] }
  - { name: Crowded, edges: [2500, 4000] }
marks:
  - { from: 0, to: 500, label: 'Visitors 48' }
  - { from: 500, to: 2500, label: 'Visitors 49' }
  - { from: 2500, to: 4000, label: 'Visitors 50' }
caption: A long pass and a short one each add one visitor; the fiftieth lights the lamp
```

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

The starting program already stores Step in StepWas and writes the three comparisons for Low, Exact and High, but nothing ever changes Total. You will make Total grow by 5 on each press of Step, however long the press lasts, and go back to 0 while Reset is TRUE. The scenario presses Step three times, the first press lasting two scans, and presses Reset at {{t:80}} ms. Then press {{ui:learn.check}}.
