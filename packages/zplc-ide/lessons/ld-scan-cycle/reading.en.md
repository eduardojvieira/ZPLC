## A PLC never stops looking

A person who runs a machine can look at it, think, act, and look again. A PLC does the same thing, but without pause and very fast. It repeats one loop forever, from the moment it is switched on, and each pass of the loop is called a **scan**, or a **scan cycle**. On a real PLC one scan often takes a few milliseconds. In ZPLC simulation, the lessons use a fixed task of `T#10ms`, so every scan lasts exactly the same time and the result is the same every time you run it.

Understanding the scan is the most important idea in this module. Almost every surprise a beginner meets, "why did my lamp come on late?" or "why did my output ignore me?", is explained by it.

## The three steps of a scan

![Three boxes in a row, read inputs, solve the rungs and write outputs, with an arrow that returns from the last box to the first.](images/scan-cycle.svg)

1. **Read the inputs.** At the start of the scan the PLC takes a snapshot of every input: which buttons are pressed, which sensors see something. For the rest of that scan, the program sees this snapshot, even if a button changes a moment later. A camera photo is a good picture: it freezes the scene.
2. **Solve the rungs.** The program runs from the first rung at the top to the last rung at the bottom, in that order. Each rung reads variables and writes the variables that its coil names.
3. **Write the outputs.** When the last rung is solved, the PLC copies the results to the real outputs: lamps, motors, valves.

Then the loop starts again with a new snapshot.

## Why the order of the rungs matters

The rungs are solved one after another, and a rung sees whatever the rungs above it have already calculated in the same scan. A rung below sees fresh values. A rung above sees the values from the end of the previous scan, because the rung that will change them has not been solved yet.

## The last rung has the last word

Rung order also decides who wins when two rungs write the same output. Here a SET rung is above a RESET rung. Press Run, then hold SetButton alone, then ResetButton alone, then both together.

```ld-try
src: reading/last-rung-wins.ld.json
inputs:
  - { name: SetButton, kind: push }
  - { name: ResetButton, kind: push }
outputs: [Lamp]
caption: Press SetButton, then ResetButton, then both together
```

When you press only SetButton, the lamp turns on and stays on, because a SET coil keeps its value. Pressing ResetButton turns it off. When both are pressed in the same scan, the SET rung is solved first and turns the lamp on, and then the RESET rung is solved and turns it off again. The rung lower in the program has the last word, so the lamp ends OFF. If you swapped the two rungs, the lamp would end ON.

## Worked example

A capping station must lower its capping head, Capper, when a bottle is under it. The program passes the bottle sensor BottleHere through two **memory bits**, BottleSeen and CapReady: variables that are not connected to a real input or output, which the program uses to remember a result. In a real program each step of such a chain would add a condition; here they only copy, so that the timing is easy to follow. The three rungs are drawn in the worst order: every rung reads a variable that a rung below it writes.

```ld-figure
src: reading/capper-chain.ld.json
caption: Each rung reads a memory bit that a rung below it writes
```

Follow one scan in which a bottle arrives. Rung 1 reads CapReady, which is still FALSE from the previous scan, so the capper stays up. Rung 2 reads BottleSeen, also still FALSE. Only rung 3 sees the bottle and sets BottleSeen. In the next scan rung 2 reads the new BottleSeen and sets CapReady, and only in the scan after that does rung 1 lower the capper. Each rung that reads a value written further down adds one scan.

```timing
span: 80
signals:
  - { name: BottleHere, edges: [10, 40] }
  - { name: BottleSeen, edges: [10, 40] }
  - { name: CapReady, edges: [20, 50] }
  - { name: Capper, edges: [30, 60] }
marks:
  - { from: 10, to: 30, label: 'T#20ms' }
caption: Two rungs read upwards, so Capper follows BottleHere two scans late
```

The diagram is a **timing diagram**. Time runs to the right, and each line goes up when the signal turns ON and down when it turns OFF. Compare BottleHere and Capper: the capper goes down two scans after the bottle arrives, and up again two scans after it leaves.

One scan is short, and a lag of one scan is often harmless. It becomes a real problem when many rungs depend on each other in a chain, like this one, or when a fast event, like a pulse, is missed because it came and went between two readings. The practice has a chain of its own, shorter than this one; which rung has to move, and where, is for you to find.

## Common mistakes

- Expecting the program to react in the middle of a scan. The inputs are a snapshot, so a button pressed and released between two snapshots may not be seen at all.
- Putting a rung that uses a value above the rung that calculates it. The program works, but one scan late.
- Writing the same output with a plain coil in two rungs. ZPLC refuses this with an error, because it is almost always a mistake. Use SET and RESET coils, or combine the conditions in one rung.

> [!WARNING]
> The scan time of a real PLC depends on the program and the model, and a machine that must react within a given time needs that time measured on the real controller. The simulation proves the order of the rungs, not the speed of any board. An emergency stop is wired in hardware and never depends on the order of rungs in a program.

## Check yourself

```quiz
question: A PLC solves rung 1 and then rung 2 in the same scan. Rung 2 changes a variable that rung 1 reads. When does rung 1 see the new value?
options:
  - { text: 'In the next scan', correct: true, feedback: 'Yes. Rung 1 was already solved in this scan, so it only sees the new value one scan later.' }
  - { text: 'In the same scan, immediately', feedback: 'Rung 1 is solved before rung 2, so it cannot see what rung 2 calculates afterwards.' }
  - { text: 'Never', feedback: 'The program repeats forever, so rung 1 reads the new value in the next scan.' }
```

```quiz
question: What is the order of the three steps of a scan?
options:
  - { text: 'Read inputs, solve the rungs, write outputs', correct: true, feedback: 'Yes. The loop then starts again.' }
  - { text: 'Solve the rungs, read inputs, write outputs', feedback: 'The rungs need the inputs first, so reading comes first.' }
  - { text: 'Write outputs, read inputs, solve the rungs', feedback: 'The outputs are written last, with the results of the rungs.' }
```

## What you will do in the practice

The starting program has two rungs that each do the right thing, but in the wrong order: one copies StartButton into the memory bit ButtonSeen, the other shows ButtonSeen on Lamp, and the lamp lights one scan late. You will make the lamp change in the same scan as the button, without changing any contact or coil, then press {{ui:learn.check}}.
