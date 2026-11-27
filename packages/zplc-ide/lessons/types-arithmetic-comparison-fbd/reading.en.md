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

The control panel of a packing line shows three things, each built from one block of this page on its own.

- **The belt speed.** A selector switch `FastMode` chooses between two speeds. A SEL block takes `FastMode` on G, the INT constant 300 on IN0 and the INT constant 600 on IN1, and its output writes `BeltSpeed`: 300 while the switch is off, 600 while it is on.
- **The parts of the shift.** The line counts good parts in `Good` and rejected parts in `Rejected`. An ADD block takes `Good` on IN1 and `Rejected` on IN2, and its output writes `Parts`, so the display always shows the sum.
- **A log pulse.** Each press of the push button `Mark` must write one line in the shift log, however long the button is held. An R_TRIG block named `MarkEdge` takes `Mark` on CLK, and its Q writes `LogLine`, TRUE on one scan for each press.

Two GE blocks turn the numbers into lamps: `BeltSpeed` against 500 gives `FastLamp`, and `Parts` against 1000 gives `ShiftDone`.

```timing
span: 5000
signals:
  - { name: FastMode, edges: [1000, 3000] }
  - { name: FastLamp, edges: [1000, 3000] }
  - { name: Mark, edges: [1500, 2500] }
  - { name: LogLine, edges: [1500, 1510] }
marks:
  - { from: 1000, to: 3000, label: 'BeltSpeed 600' }
caption: SEL chooses the speed; R_TRIG gives one short pulse for a long press of Mark
```

Each block here works alone: none of them feeds another. The practice needs several of them together, so that a press changes a number once; which blocks it needs, and how they are wired into the SEL that already clears Total, is for you to work out.

## Common mistakes

- Expecting a level to change a number once. A button held for several scans is TRUE on every one of them, so whatever its level drives acts on every scan.
- Swapping IN0 and IN1 of a SEL. IN0 is the value while G is FALSE.
- Writing one variable from two output blocks. A variable takes one output block; the second one would overwrite the first.
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
question: An R_TRIG has a push button on CLK, and the button is held for three scans. On how many scans is its Q TRUE?
options:
  - { text: '1', correct: true, feedback: 'Right. Q is TRUE only on the scan in which CLK goes from FALSE to TRUE.' }
  - { text: '3', feedback: 'That is the level of the button. The R_TRIG gives the change, which happens once.' }
  - { text: '0', feedback: 'The button does rise once, so Q is TRUE on that one scan.' }
```

## What you will do in the practice

The starting diagram reads the INT Total, clears it with a SEL block while Reset is TRUE, and already compares it for Low, Exact and High, but nothing adds to Total. You will make each press of Step add 5 to Total once, however long the press lasts. The scenario presses Step three times, the first press lasting two scans, and presses Reset at {{t:80}} ms. Then press {{ui:learn.check}}.
