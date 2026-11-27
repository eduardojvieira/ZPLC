## Numbers on connections

In a Function Block Diagram a number travels on a connection just as an ON or OFF does. The connection takes the type of the value it carries: a BOOL is a yes or a no, an INT is a whole number from −32768 to 32767. Four kinds of block do the work of this lesson.

| Block          | Inputs      | Output | What it gives                                             |
| -------------- | ----------- | ------ | --------------------------------------------------------- |
| ADD            | IN1, IN2    | OUT    | the sum IN1 + IN2                                         |
| SEL            | G, IN0, IN1 | OUT    | IN0 while G is FALSE, IN1 while G is TRUE                 |
| R_TRIG         | CLK         | Q      | TRUE for one scan when CLK rises                          |
| LT, EQ, GT, GE | IN1, IN2    | OUT    | a BOOL: is IN1 less, equal, more, more or equal than IN2? |

A variable can be read on the left of the diagram and written on the right. The diagram runs once per scan, so a value written at the right edge is what the left edge reads on the next scan. That is how a total grows: read it, add to it, write it back. An ADD block alone adds on every scan; a SEL block decides, on each scan, whether the new value or the old one goes back into the variable.

## Worked example

A buffer conveyor between two machines holds up to three trays. A sensor at its entry gives `EntryEye` while a tray comes in, and one at its exit gives `ExitEye` while a tray leaves; a tray can stay in front of either for several scans. The INT variable `Trays` holds the trays on the buffer, and a lamp `BufferFull` must light while there are three.

Each tray must change the number once, up at the entry and down at the exit, so the diagram builds the next value in two steps, each gated by a pulse:

- an R_TRIG named `InEdge` with `EntryEye` on CLK, and an R_TRIG named `OutEdge` with `ExitEye` on CLK;
- an ADD with `Trays` on IN1 and the INT constant 1 on IN2, and a SEL with `InEdge.Q` on G, `Trays` on IN0 and ADD.OUT on IN1;
- a SUB with the first SEL on IN1 and the INT constant 1 on IN2, and a second SEL with `OutEdge.Q` on G, the first SEL on IN0 and SUB.OUT on IN1, whose output writes `Trays`.

A GE block with `Trays` on IN1 and the constant 3 on IN2 gives `BufferFull`. On the diagram the third tray stays in front of the entry sensor longer and still counts once, and a tray that leaves takes the number back to two.

```timing
span: 5000
signals:
  - { name: EntryEye, edges: [400, 600, 1200, 1400, 2000, 2500] }
  - { name: ExitEye, edges: [3300, 3500] }
  - { name: BufferFull, edges: [2000, 3300] }
marks:
  - { from: 400, to: 1200, label: 'Trays 1' }
  - { from: 1200, to: 2000, label: 'Trays 2' }
  - { from: 2000, to: 3300, label: 'Trays 3' }
  - { from: 3300, to: 5000, label: 'Trays 2' }
caption: One count per tray at each end, and the comparison turns the number into the lamp
```

## Common mistakes

- Connecting the sensor straight to G of the SEL. G stays TRUE for every scan the tray is there, so the sum goes back on every scan.
- Swapping IN0 and IN1 of a SEL. IN0 is the value while G is FALSE.
- Connecting ADD.OUT straight to the variable. The total then grows on every scan.
- Giving the constant another type than the variable. Keep it INT when the total is an INT.
- Using GE where the task asks for EQ: GE stays TRUE above the limit too.

## Check yourself

```quiz
question: A SEL block has G FALSE, 7 on IN0 and 12 on IN1. What is its output?
options:
  - { text: '7', correct: true, feedback: 'Yes. SEL gives IN0 while G is FALSE.' }
  - { text: '12', feedback: 'That is IN1, which SEL gives only while G is TRUE.' }
  - { text: '19', feedback: 'SEL chooses one input, it does not add them.' }
```

```quiz
question: The input of a total is connected straight to G of the SEL, without the R_TRIG, and the ADD adds 5. A press lasts three scans. How much does the total grow?
options:
  - { text: '15', correct: true, feedback: 'Right. G is TRUE on three scans, so the sum is written back three times.' }
  - { text: '5', feedback: 'That needs the R_TRIG, whose Q is TRUE on one scan only.' }
  - { text: '0', feedback: 'While G is TRUE the SEL gives the sum, so the total does grow.' }
```

## What you will do in the practice

The starting diagram reads the INT Total, clears it with a SEL block while Reset is TRUE, and already compares it for Low, Exact and High, but nothing adds to Total. You will make each press of Step add 5 to Total once, however long the press lasts. The scenario presses Step three times, the first press lasting two scans, and presses Reset at {{t:80}} ms. Then press {{ui:learn.check}}.
