## The machine

This station runs a fixed batch of three boxes along a belt conveyor. On the left, an emitter places boxes on the belt beside a start button and an entrance sensor `EyeIn`. On the right, an exit sensor `EyeOut` watches boxes leave the belt into a remover chute, and an indicator light `DoneLight` shows when the batch is done.

![The counted-queue scene seen from the front. A belt conveyor on legs runs from left to right. Near the left end, cyan corner marks show the emitter zone, with StartButton behind the belt and the optical sensor EyeIn further right. Near the right end stand the optical sensor EyeOut, the indicator lamp DoneLight, and a boxed remover chute at the far end. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has seven parts. `Remover1` takes away any box that reaches the right end and is not wired to the PLC; your program tracks the batch through the two optical sensors.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EyeIn`       | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeOut`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Remover1`    | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `DoneLight`   | Indicator light        | A pilot lamp on the operator panel that shows one state.                                                      |

| Variable | Signal                | Direction & type  | Meaning                                           |
| -------- | --------------------- | ----------------- | ------------------------------------------------- |
| `Run`    | `Belt1.run`           | PLC output · BOOL | TRUE runs the belt forward.                       |
| `Emit`   | `Emitter1.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line. |
| `EyeIn`  | `EyeIn.detect`        | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `EyeOut` | `EyeOut.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.              |
| —        | `Remover1`            | —                 | Not wired to the PLC.                             |
| `Start`  | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.               |
| `Done`   | `DoneLight.lit`       | PLC output · BOOL | TRUE switches the lamp on.                        |

## Counting a batch in Ladder

A `CTU` (count-up) function block adds 1 to its internal count `CV` on every **rising edge** of its `CU` input, and sets its output `Q` to TRUE once `CV` reaches the preset `PV`. Because it looks only at rising edges, a box that stays in front of a sensor for dozens of scans is still counted once.

In Ladder, you place a `CTU` block in a rung with the sensor contact feeding `CU`, set `R` and `PV`, and bind `Q` to a local `BOOL` variable. Later rungs can then read that `BOOL` with a normally open contact (`| |`) to turn something on when the count is reached, or with a normally closed contact (`|/|`) to stop an action once the count is reached.

```timing
span: 6000
signals:
  - { name: CapSensor, edges: [400, 900, 1600, 2100, 2800, 3300, 4000, 4500] }
  - { name: BatchFull, edges: [4000, 6000] }
  - { name: Conveyor, edges: [200, 4000] }
  - { name: BatchDone, edges: [4000, 6000] }
caption: Each item adds one on its rising edge; at the preset, BatchFull stops the conveyor and lights BatchDone
```

When items travel down a belt, **loading** and **unloading** happen at different times. Stopping the belt as soon as the third item passes the entrance sensor leaves that item stranded on the belt. And releasing a second item onto the belt before the previous one has moved clear makes them ride on touching, so the sensors see them as one object and count them once.

## Worked example

A bottle-capping station runs a batch of four bottles fed by an upstream line, so this station has no emitter of its own. Pressing `CycleStart` latches `BatchRun`. A single `CTU` block (`Bottles`, preset `4`) counts each bottle at `CapSensor` and writes its `Q` output to `BatchFull`. While `BatchRun` is TRUE and `BatchFull` is FALSE, `Conveyor` runs; once four bottles have passed, `BatchFull` turns TRUE, `Conveyor` stops, and `BatchDone` lights until `ResetBatch` clears both `BatchRun` and the counter.

```ld-figure
src: reading/bottle-batch.ld.json
caption: CycleStart latches BatchRun, Bottles counts four caps into BatchFull, and BatchFull stops Conveyor and lights BatchDone
```

Read it from top to bottom. Rung 1 and rung 2 latch and clear `BatchRun`. Rung 3 feeds `CapSensor` into `Bottles.CU`, wires `ResetBatch` to `R`, sets `PV` to `4`, and binds `Q` to `BatchFull`. Rung 4 puts `BatchRun` in series with a normally closed contact on `BatchFull`, so the conveyor stops the instant the fourth bottle is counted. Rung 5 copies `BatchFull` to `BatchDone`.

```ld-try
src: reading/bottle-batch.ld.json
inputs:
  - { name: CycleStart, kind: push }
  - { name: CapSensor, kind: push }
  - { name: ResetBatch, kind: push }
outputs: [Conveyor, BatchDone]
timing: [CycleStart, CapSensor, Conveyor, BatchDone]
caption: Press CycleStart, pulse CapSensor four times, then press ResetBatch
```

Press Run, then press `CycleStart`: `Conveyor` turns on. Pulse `CapSensor` four times: on the fourth rising edge, `Conveyor` turns off and `BatchDone` turns on. Press `ResetBatch` to clear both the count and the batch memory.

This capping station counts at one sensor and never has to emit items itself. In the practice, your station has both an entrance sensor and an exit sensor, and it must release three boxes one by one without collisions.

## Common mistakes

- Using one counter for both loading and unloading. If the belt stops when the third box enters, the last two boxes stay on the belt and never reach the remover.
- Releasing a new box while the previous box is still in the emitter zone. The boxes ride on touching, and the sensors count them as one.
- Forgetting that `Emit` acts on a **rising edge**. Keeping `Emit` stuck TRUE releases only the first box; it must drop back to FALSE before the next rising edge.
- Forgetting to bind `Q` of a `CTU` block to a local variable, or using a normally open contact where a normally closed contact is needed to stop an action when the count is reached.

> [!NOTE]
> A `CTU` counts rising edges of `CU` even if the belt is stopped, as long as the sensor toggles. Keep `R` FALSE while a batch is in progress so the count is not cleared mid-batch.

## Check yourself

```quiz
question: 'A box stays in front of EyeIn for 40 scans while EyeIn feeds the CU input of a CTU block. By how much does CV increase?'
options:
  - { text: 'By 1, because CTU counts rising edges of CU', correct: true, feedback: 'Right. Only the transition from FALSE to TRUE adds 1.' }
  - { text: 'By 40, once on every scan while EyeIn is TRUE', feedback: 'A CTU does not count scans; it counts rising edges.' }
  - { text: 'By 0, unless a rising-edge contact is placed before CU', feedback: 'CTU detects rising edges internally, so a plain contact on CU is enough.' }
```

```quiz
question: 'In the bottle-capping worked example, BatchRun is TRUE and four bottles have passed CapSensor so BatchFull is TRUE. What are Conveyor and BatchDone?'
options:
  - { text: 'Conveyor is FALSE and BatchDone is TRUE', correct: true, feedback: 'Yes. The normally closed contact on BatchFull opens rung 4 to stop Conveyor, while rung 5 lights BatchDone.' }
  - { text: 'Both Conveyor and BatchDone are TRUE', feedback: 'Rung 4 has a normally closed contact on BatchFull, so Conveyor turns off when BatchFull is TRUE.' }
  - { text: 'Both Conveyor and BatchDone are FALSE', feedback: 'Rung 5 has a normally open contact on BatchFull, so BatchDone lights when BatchFull is TRUE.' }
```

## What you will do in the practice

The starting program declares the inputs Start, EyeIn and EyeOut, the outputs Run, Emit and Done, and local variables including two CTU counters, with no rungs yet. A press of Start at {{t:200}} ms must start a batch of three boxes: load three boxes onto the belt one by one without collisions, carry them along the belt, and light Done and stop the belt as soon as the third box reaches EyeOut. Then press {{ui:learn.check}}.
