## A counter is a block with a memory

A counter adds one each time something arrives: a part at a photocell, a turn of a table, a press of a push button. A part that stays in front of a photocell keeps its input TRUE for many scans and is still one part, so a counter counts **rising edges**, the scans in which its input changes from FALSE to TRUE.

The **CTU**, the up counter, is a function block that does this. In a Function Block Diagram it is a block like AND or NOT, with one difference: it remembers. An AND answers only from the values on its inputs now; a CTU keeps its count and the value of its input from the scan before, from one scan to the next. That memory belongs to an **instance**, so the block carries a name of its own above it, such as `Turns`, and its outputs are read as `Turns.Q` and `Turns.CV`.

## The ports of a CTU

A CTU block has three input ports on its left and two output ports on its right.

- **CU**, count up, a BOOL: each rising edge adds one.
- **R**, reset, a BOOL: while it is TRUE, the count is zero.
- **PV**, the preset value, an INT: the number to count to. It usually comes from a constant block.
- **Q**, a BOOL: TRUE while the count is at or above PV.
- **CV**, an INT: the count so far.

Each connection carries the value of one output port to one input port. An input port with no connection stays FALSE: a CTU with nothing on CU never counts, and one with nothing on R never clears. The count does not stop at PV, and Q stays TRUE until R clears the count.

## Worked example

A stretch wrapper wraps a pallet in film while a turntable spins it. A flag on the table passes a sensor, `TurnFlag`, once per turn, and stays in front of it for a moment each time. A pallet is wrapped after six turns: the lamp `WrapDone` lights, and the operator presses the push button `NewPallet` for the next pallet, which clears the count. A display shows the turns so far, `TurnsSoFar`.

The diagram has one CTU named `Turns`, a constant block with the value `6`, and these connections:

| From              | To               | What it carries                        |
| ----------------- | ---------------- | -------------------------------------- |
| `TurnFlag`, OUT   | `Turns`, CU      | TRUE while the flag is at the sensor   |
| `NewPallet`, OUT  | `Turns`, R       | TRUE while the push button is held     |
| constant `6`, OUT | `Turns`, PV      | the number of turns of a pallet        |
| `Turns`, Q        | `WrapDone`, IN   | TRUE from the sixth turn until a reset |
| `Turns`, CV       | `TurnsSoFar`, IN | the number of turns counted so far     |

Read it from left to right: the sensor and the push button feed the counter, the constant sets its preset, and the counter's two outputs drive the lamp and the display. Each pass of the flag counts once, however long the flag stays at the sensor.

```timing
span: 8000
signals:
  - { name: TurnFlag, edges: [300, 700, 1300, 1700, 2300, 2700, 3300, 3700, 4300, 4700, 5300, 5700] }
  - { name: WrapDone, edges: [5300, 6800] }
  - { name: NewPallet, edges: [6800, 7300] }
marks:
  - { from: 5300, to: 6800, label: 'CV = 6' }
caption: The sixth pass of the flag lights WrapDone; NewPallet clears the count
```

## Common mistakes

- Swapping CU and R. Each pass of the flag then clears the count, and the push button counts instead.
- Leaving R without a connection. The count never returns to zero, and the lamp stays lit after the push button is pressed.
- Expecting Q to fall when the count passes PV. Q stays TRUE until a reset.
- Connecting CV, an INT, where a BOOL is expected. Q is the BOOL that says "the preset is reached"; CV is the number.

## Check yourself

```quiz
question: In a diagram, a CTU has its preset and its Q connected, a photocell connected to CU, and nothing connected to R. The preset is reached and the operator presses Reset. What does Q do?
options:
  - { text: 'It stays TRUE', correct: true, feedback: 'Yes. Reset is not connected to the counter, so R stays FALSE and nothing clears the count.' }
  - { text: 'It turns FALSE', feedback: 'Only a TRUE on R clears the count, and no connection carries Reset to R.' }
  - { text: 'It turns FALSE at the next part', feedback: 'A new part adds one to the count; it never clears it.' }
```

```quiz
question: A part stays in front of the photocell on CU for 20 scans. By how much does CV rise?
options:
  - { text: 'By one', correct: true, feedback: 'Right. The CTU adds one on the rising edge of CU, however long CU stays TRUE.' }
  - { text: 'By 20', feedback: 'That would be a count of scans. A CTU counts only the change from FALSE to TRUE.' }
  - { text: 'By zero until the part leaves', feedback: 'The count rises at the rising edge, when the part arrives, not when it leaves.' }
```

## What you will do in the practice

The starting diagram has the counter Count, the constant 3 on its PV and its Q connected to BatchFull, but nothing reaches CU or R, so Count never counts. You will make BatchFull light at the third part, at {{t:60}} ms, and go out when Reset is pressed at {{t:80}} ms, then press {{ui:learn.check}}.
