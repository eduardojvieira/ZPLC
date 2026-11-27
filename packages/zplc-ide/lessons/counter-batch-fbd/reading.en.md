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

A tablet dispenser fills bottles with five tablets each. Each tablet drops past an eye, `TabletEye`, that stays TRUE for a moment while it passes. When a new bottle is in place the machine presses `NewBottle`. The lamp `BottleDone` lights when the bottle has all five, and a display shows the tablets still missing, `TabletsLeft`.

This count runs down, from five to zero, so the diagram uses the down counter, the **CTD**. Its input ports are CD, whose rising edges each take one away, LD, which loads PV into the count while it is TRUE, and PV. Its output Q is TRUE while CV is at or below zero. The diagram has one CTD named `Doses`, a constant block with the value `5`, and these connections:

| From              | To                | What it carries                     |
| ----------------- | ----------------- | ----------------------------------- |
| `TabletEye`, OUT  | `Doses`, CD       | TRUE while a tablet passes the eye  |
| `NewBottle`, OUT  | `Doses`, LD       | TRUE while a new bottle is loaded   |
| constant `5`, OUT | `Doses`, PV       | the number of tablets of a bottle   |
| `Doses`, Q        | `BottleDone`, IN  | TRUE once the count is down to zero |
| `Doses`, CV       | `TabletsLeft`, IN | the number of tablets still missing |

Read it from left to right: the eye and the load signal feed the counter, the constant sets the number it starts from, and the counter's two outputs drive the lamp and the display. Before the first bottle CV is zero, so the lamp is already lit; `NewBottle` loads five and puts it out, and each tablet counts once, however long it takes to pass.

```timing
span: 6000
signals:
  - { name: NewBottle, edges: [200, 400] }
  - { name: TabletEye, edges: [1000, 1300, 2000, 2300, 3000, 3300, 4000, 4300, 5000, 5300] }
  - { name: BottleDone, edges: [0, 200, 5000] }
marks:
  - { from: 200, to: 5000, label: 'CV 5 → 0' }
caption: NewBottle loads five; five tablets bring the count to zero and light BottleDone
```

The counter of the practice is a CTU: it counts up from zero and has the ports CU and R instead of CD and LD. Which signal reaches which of them is for you to work out.

## Common mistakes

- Connecting a signal to the wrong port of the counter. The count then moves when it should be cleared, or the other way round: read the name of each port before you connect it.
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
