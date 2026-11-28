## Logic drawn as blocks

A machine decides most things with yes-or-no answers: may the motor run, is the door shut, must the lamp light. Each answer is a BOOL, TRUE or FALSE, and **Boolean logic** builds answers from other answers with four operators: AND, OR, XOR and NOT.

A **Function Block Diagram**, FBD for short, draws that logic instead of writing it. Each operator is a **block**, and **wires** carry values from one block to the next. The signals flow from left to right: the inputs of the program on the left, the outputs on the right, the logic in between.

## Blocks, ports and wires

A diagram has three kinds of block:

- A **variable block** brings an input of the program into the diagram. Its port `OUT` carries the value of that input.
- A **logic block** works out one operator. Its inputs are on its left and its result leaves through its port `OUT`.
- An **output block** writes the value that reaches its port `IN` to an output of the program.

| Block | Inputs     | `OUT` is TRUE when         |
| ----- | ---------- | -------------------------- |
| `AND` | `IN1, IN2` | both inputs are TRUE       |
| `OR`  | `IN1, IN2` | at least one input is TRUE |
| `XOR` | `IN1, IN2` | exactly one input is TRUE  |
| `NOT` | `IN`       | its input is FALSE         |

A wire always runs from an output port to an input port. An input port takes exactly one wire, but an output port can feed as many wires as you need, so one input of the program can reach several blocks. On every scan each block works out its result from the values wired to it, and each output block writes what reaches it.

An AND block has two inputs, so a condition of three parts takes two AND blocks: the first joins two signals, and its `OUT` goes into the second together with the third signal.

```timing
span: 5000
signals:
  - { name: A, edges: [500, 4000] }
  - { name: B, edges: [1000, 3500] }
  - { name: C, edges: [0, 2000, 2500] }
  - { name: AND1.OUT, edges: [1000, 3500] }
  - { name: AND2.OUT, edges: [1000, 2000, 2500, 3500] }
caption: AND1 joins A and B; AND2 joins AND1.OUT and C, so it is TRUE only while all three are
```

## Worked example

A sorting conveyor carries boxes past a flap that pushes tall boxes into a side lane. The flap `Flap` swings out while the height eye `TallBox` sees a tall box and the lane switch `LaneFull` says the lane is not full. The flap's position switch `FlapIsOut` should agree with the command while the belt runs (`BeltRunning`), and a fault lamp `FlapFault` lights when it does not.

The flap needs two conditions, one of them turned around, and the fault lamp needs a difference that only counts while the belt runs:

1. A NOT block takes `LaneFull`.
2. An AND block takes `TallBox` and the NOT block, and its `OUT` goes to the output block `Flap`.
3. An XOR block takes the same `OUT` of the AND block and `FlapIsOut`.
4. A second AND block takes the XOR block and `BeltRunning`, and its `OUT` goes to the output block `FlapFault`.

The `OUT` of the first AND block feeds two places, the output block `Flap` and the XOR: one output port, two wires. So the XOR compares the command the diagram works out in this scan with the switch that reports where the flap really is. Follow a stuck flap through it: a tall box arrives, the AND block gives TRUE and the flap is commanded out, but `FlapIsOut` stays FALSE. The XOR block sees one TRUE and one FALSE, and with the belt running the second AND block lights the fault lamp.

A real diverter gives the flap a short time to move before it lights the fault lamp; that needs a timer, which this page leaves out.

## Common mistakes

- Using an OR block where every condition is needed. The output then turns on with only one of them.
- Trying to bring two wires into one input port. An input has one source; add another AND block instead.
- Placing the NOT block after an AND block when only one signal should be turned around. NOT after the AND turns around the whole condition.
- Using an OR block for "exactly one". OR is also TRUE when both inputs are TRUE; XOR is FALSE then.
- Leaving an output block wired to a constant, or not wired at all. Its output never follows the inputs.

> [!WARNING]
> A diagram decides when a machine may move. It does not make the machine safe: a two-hand control and a guard that protect people are devices of their own, wired so that they stop the machine whatever the program does.

## Check yourself

```quiz
question: An AND block has Ready on IN1, and on IN2 a NOT block whose input is Stop. Ready is TRUE and Stop is TRUE. What does the AND block give?
options:
  - { text: 'FALSE', correct: true, feedback: 'Yes. The NOT block turns Stop into FALSE, and AND needs both inputs TRUE.' }
  - { text: 'TRUE', feedback: 'Ready is TRUE, but IN2 receives the NOT of Stop, which is FALSE.' }
  - { text: 'It changes on every scan', feedback: 'The inputs do not change, so every block gives the same result on every scan.' }
```

```quiz
question: An output must be ON only when three inputs are all TRUE. How do you draw it with AND blocks of two inputs?
options:
  - { text: 'Two AND blocks: the OUT of the first goes into the second with the third input', correct: true, feedback: 'Right. The second block is TRUE only when the first one and the third input are, so all three are.' }
  - { text: 'One AND block with two wires on IN2', feedback: 'An input port takes one wire. The diagram cannot join two signals there.' }
  - { text: 'An OR block for two inputs, then an AND block with the third', feedback: 'The OR block is TRUE with one of its inputs alone, so the output would not need all three.' }
```

## What you will do in the practice

The machine of the practice is a press with a two-hand control: it may close only while the operator holds two push buttons, one for each hand, and only while its guard is closed. The starting diagram enables the press with an OR block and wires the two lamps to constants. You will change the diagram so that PressEnable is ON only with both hands and the guard closed, GuardLamp while the guard is open, and OneHandWarning while exactly one hand is on its button. The scenario changes the inputs every {{t:10}} ms. Then press {{ui:learn.check}}.
