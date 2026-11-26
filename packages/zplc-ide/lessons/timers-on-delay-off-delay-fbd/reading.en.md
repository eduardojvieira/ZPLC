## Timers as blocks

A PLC program never waits: every scan it reads the inputs, works out the outputs and starts again. A **timer** gives a program time without stopping it. It is a function block with a clock inside, and on every scan it looks at its input and its clock and answers with an output.

There are two timers you will use in almost every program, and they are mirror images.

- **TON**, the **on-delay timer**, delays the rise. When IN turns on, the clock starts, and Q turns on only when IN has stayed on for the whole preset. If IN falls earlier, the clock goes back to zero. When IN falls, Q falls at once.
- **TOF**, the **off-delay timer**, delays the fall. When IN turns on, Q turns on at once. When IN falls, the clock starts, and Q stays on until the preset is over. If IN comes back first, Q never falls.

```timing
span: 5000
signals:
  - { name: IN, edges: [1000, 3000] }
  - { name: TON.Q, edges: [2000, 3000] }
  - { name: TOF.Q, edges: [1000, 4000] }
marks:
  - { from: 1000, to: 2000, label: PT }
  - { from: 3000, to: 4000, label: PT }
caption: The same input fed to a TON and to a TOF with the same preset
```

One question picks the timer: must the output wait before it turns on (TON), or stay on after its input is gone (TOF)?

## A timer block in a diagram

In a Function Block Diagram a timer is a block with an instance name above it, because its clock is a memory that belongs to that instance. It has two input ports on its left and two output ports on its right.

- **IN**, a BOOL: the signal the timer watches.
- **PT**, the preset, a TIME: how long the timer counts. It comes from a constant block of type TIME, written with `T#`, such as `T#300ms` or `T#2s`.
- **Q**, a BOOL: the answer of the timer.
- **ET**, a TIME: how far the clock has counted.

Each connection carries the value of one output port to one input port. The block runs on every scan, so its clock moves whatever the rest of the diagram is doing.

## Worked example

A sump pump empties a pit that fills with rain water. A float switch, `WaterHigh`, turns on when the water is high, but waves make it flicker. The pump must start only when `WaterHigh` has stayed on for `T#2s`, so that a wave does not start it, and keep running for `T#5s` after the switch turns off, to take the level well below the switch.

"Wait before turning on" is a TON, "stay on after" is a TOF. The Q of the first feeds the IN of the second. The diagram has a TON named `StartDelay`, a TOF named `RunOn`, two TIME constants and these connections:

| From                 | To               | What it carries                 |
| -------------------- | ---------------- | ------------------------------- |
| `WaterHigh`, OUT     | `StartDelay`, IN | TRUE while the float is up      |
| constant `T#2s`, OUT | `StartDelay`, PT | how long the float must stay up |
| `StartDelay`, Q      | `RunOn`, IN      | TRUE once the float stayed up   |
| constant `T#5s`, OUT | `RunOn`, PT      | how long the pump runs on       |
| `RunOn`, Q           | `Pump`, IN       | the command of the pump         |

The first flicker is too short: StartDelay starts counting, the switch falls before the preset is over, and nothing happens. The second time the water stays high, StartDelay.Q rises after the preset and the pump starts. When the switch falls, StartDelay.Q falls at once, and RunOn keeps the pump on for its own preset.

```timing
span: 13000
signals:
  - { name: WaterHigh, edges: [500, 1200, 2000, 7000] }
  - { name: StartDelay.Q, edges: [4000, 7000] }
  - { name: Pump, edges: [4000, 12000] }
marks:
  - { from: 2000, to: 4000, label: 'T#2s' }
  - { from: 7000, to: 12000, label: 'T#5s' }
caption: The wave never reaches the pump; the pump runs on after the float falls
```

## Common mistakes

- Choosing the wrong timer. A TOF on the float would start the pump at every wave and stretch it by its preset.
- Leaving PT without a connection. The preset is then zero, and the timer delays nothing.
- Putting an INT constant on PT. PT is a TIME: write it with `T#` and a unit.
- Writing the wrong unit: `T#300s` is five minutes, not a third of a second.
- Keeping the connection from the input straight to the output. Remove it: the Q of the timer must be the only thing that drives the output.

## Check yourself

```quiz
question: A lamp must stay on for T#10s after a door closes, so that a person can find the way out. The door switch is TRUE while the door is open. Which block drives the lamp from the door switch?
options:
  - { text: 'A TOF with T#10s on PT', correct: true, feedback: 'Yes. The lamp follows the switch at once and stays on for the preset after the switch falls.' }
  - { text: 'A TON with T#10s on PT', feedback: 'A TON would light the lamp only after the door had been open for ten seconds, and put it out as soon as the door closes.' }
  - { text: 'No timer, the door switch connected to the lamp', feedback: 'Then the lamp goes out as soon as the door closes.' }
```

```quiz
question: A TON has its IN connected, but nothing connected to PT. What does its Q do when IN turns on?
options:
  - { text: 'It turns on at once', correct: true, feedback: 'Right. An open PT keeps its default, a preset of zero, so the delay is over as soon as it starts.' }
  - { text: 'It never turns on', feedback: 'The clock reaches a preset of zero at once, so Q does turn on.' }
  - { text: 'It turns on after one second', feedback: 'A timer has no preset of its own; the only time it counts is the one on PT.' }
```

## What you will do in the practice

The starting diagram connects Button straight to Light and Sensor straight to Confirmed. You will make Light stay on after Button is released, and make Confirmed ignore the short Sensor blip that starts at {{t:100}} ms but believe Sensor when it stays on from {{t:500}} ms. Then press {{ui:learn.check}}.
