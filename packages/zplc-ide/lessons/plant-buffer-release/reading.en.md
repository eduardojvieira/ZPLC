## The machine

A buffer station sits between two machines that run at different speeds: it accumulates a batch of boxes on a holding belt, keeps them behind a stop blade, and lets one box leave onto the next belt each time the downstream side asks for one.

![The buffer-and-release scene seen from the front. Two belt conveyors sit in a line from left to right: Buffer1 on the left and Release1 on the right. At the far left of Buffer1, four cyan corner marks show Emitter1 with StartButton behind it. Along the line stand EyeFull, ReleaseButton, EyeBlade, the stop blade Blade1 between the two belts, and EyeRelease just past the blade. Further right behind Release1 stand FaultLight and DoneLight, and at the far right end sits Remover1. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has twelve parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part            | Kind                   | What it is in a real plant                                                                                    |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Buffer1`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Release1`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`      | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Blade1`        | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `EyeFull`       | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeBlade`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeRelease`    | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Remover1`      | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton`   | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `ReleaseButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `DoneLight`     | Indicator light        | A pilot lamp on the operator panel that shows one state.                                                      |
| `FaultLight`    | Indicator light        | A pilot lamp on the operator panel that shows one state.                                                      |

| Variable     | Signal                  | Direction & type  | Meaning                                                 |
| ------------ | ----------------------- | ----------------- | ------------------------------------------------------- |
| `RunBuffer`  | `Buffer1.run`           | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunRelease` | `Release1.run`          | PLC output · BOOL | TRUE runs the belt forward.                             |
| `Emit`       | `Emitter1.emit`         | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `Hold`       | `Blade1.extend`         | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `EyeFull`    | `EyeFull.detect`        | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `EyeBlade`   | `EyeBlade.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `EyeRelease` | `EyeRelease.detect`     | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| —            | `Remover1`              | —                 | Not wired to the PLC.                                   |
| `Start`      | `StartButton.pressed`   | PLC input · BOOL  | TRUE while the button is held down.                     |
| `ReleaseCmd` | `ReleaseButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                     |
| `Done`       | `DoneLight.lit`         | PLC output · BOOL | TRUE switches the lamp on.                              |
| `Fault`      | `FaultLight.lit`        | PLC output · BOOL | TRUE switches the lamp on.                              |

`Remover1` is not wired to the PLC: it clears every box that reaches the end of `Release1` on its own. Your chart sees only the five inputs and drives the six outputs.

## Counting and branching in a chart

A simple sequence runs straight from its first step to its last and returns to the top. A real station often has to repeat a pair of steps a fixed number of times before moving on to the next phase. In a sequential function chart, two tools handle that cleanly: a **pulse action** (`P1`) and **alternative transitions**.

An action with qualifier `N` runs on every scan while its step is active. That is right for driving outputs such as belts, blades and lamps, because each step states the full output pattern of its phase. It is wrong for counting: writing `Hits := Hits + 1;` inside an `N` action would add one on every scan, reaching a hundred in a single second on a {{t:10}} ms task.

An action with qualifier `P1` runs only once, on the first scan the step becomes active. Put the increment in a `P1` action, and each entry into the step adds exactly one to the local counter.

Once a step has done its work, the chart must decide whether to loop back or continue to the next phase. You draw **two transitions leaving the same step** — an alternative branch. Their conditions must exclude each other (or carry a clear priority order), so the chart always knows which branch to take: one branch fires when the batch is complete, and the other fires while more items remain.

## Worked example

A stamping press stamps a batch of three metal plates when `CycleStart` is pressed, pauses for one second between hits, and then opens `UnloadGate` until `PartOut` sees the finished stack leave. The inputs are `CycleStart`, `StampDown` and `PartOut`; the outputs are `Press` and `UnloadGate`; the local variable is `Hits : INT := 0`.

Four steps model the press:

- `IDLE` (initial): `N` action writes `Press := FALSE; UnloadGate := FALSE;`, and a `P1` action resets `Hits := 0;`.
- `STAMP`: `N` action writes `Press := TRUE; UnloadGate := FALSE;`, and a `P1` action writes `Hits := Hits + 1;`.
- `PAUSE`: `N` action writes `Press := FALSE; UnloadGate := FALSE;`.
- `UNLOAD`: `N` action writes `Press := FALSE; UnloadGate := TRUE;`.

The transitions connect them with one alternative branch out of `STAMP`:

- `IDLE` to `STAMP`: `CycleStart`.
- `STAMP` to `UNLOAD` (priority 1): `StampDown AND Hits >= 3`.
- `STAMP` to `PAUSE` (priority 2): `StampDown AND Hits < 3`.
- `PAUSE` to `STAMP`: `PAUSE.T >= T#1s`.
- `UNLOAD` to `IDLE`: `PartOut`.

```timing
span: 7000
signals:
  - { name: CycleStart, edges: [200, 400] }
  - { name: STAMP, edges: [200, 1000, 2000, 2800, 3800, 4600] }
  - { name: PAUSE, edges: [1000, 2000, 2800, 3800] }
  - { name: UNLOAD, edges: [4600, 6200] }
  - { name: Press, edges: [200, 1000, 2000, 2800, 3800, 4600] }
  - { name: UnloadGate, edges: [4600, 6200] }
marks:
  - { from: 1000, to: 2000, label: 'T#1s' }
  - { from: 2800, to: 3800, label: 'T#1s' }
caption: Three entries into STAMP increment Hits with P1; on the third hit the branch moves to UNLOAD
```

Follow one batch. When `CycleStart` turns TRUE, `STAMP` becomes active, its `P1` action sets `Hits` to `1`, and `Press` turns on. When `StampDown` turns TRUE, `Hits < 3` is TRUE so the chart moves to `PAUSE` for `T#1s`, then back to `STAMP` where `Hits` becomes `2`, and once more where `Hits` becomes `3`. On the third `StampDown`, `Hits >= 3` wins and the chart enters `UNLOAD`, opening `UnloadGate` until `PartOut` returns it to `IDLE`.

This press has only one counting loop and releases the whole batch at once. In the practice station you must design two phases — loading five boxes and releasing them one per button press — and decide how to keep the stop blade raised, how to tell when a single box has cleared the release sensor, and how to watch for a box that slips past while waiting.

## Common mistakes

- Incrementing a counter in an `N` action instead of a `P1` action. The counter climbs on every scan while the step is active, so in a step that waits, like STAMP, the batch condition fires on the first item.
- Leaving two outgoing transitions from one step with overlapping conditions and no clear priority. Both branches can become TRUE on the same scan and send the chart down the wrong path.
- Omitting an output from a step's `N` action. In SFC an output keeps its last value when the previous step ends, so a belt or blade stays in its old state until another action writes it.

> [!NOTE]
> A `P1` action runs once when its step becomes active. If the chart loops back into the same step later, the step becomes active again and the `P1` action runs one more time.

## Check yourself

```quiz
question: In the stamping press example, what happens if Hits := Hits + 1 is placed in an N action instead of a P1 action?
options:
  - { text: 'Hits increases on every scan while STAMP is active, so the press leaves for UNLOAD after the first hit', correct: true, feedback: 'Yes. An N action runs on every scan; only a P1 action runs once per entry into the step.' }
  - { text: 'Hits never changes because N actions cannot write local variables', feedback: 'An N action can write local variables; the problem is that it runs on every scan, not once.' }
  - { text: 'Hits increases only when the step ends', feedback: 'That is a P0 (exit) pulse, not an N action. An N action runs continuously while the step is active.' }
```

```quiz
question: Why do the two transitions leaving STAMP use Hits >= 3 and Hits < 3?
options:
  - { text: 'So the two conditions exclude each other and only one branch is TRUE when StampDown arrives', correct: true, feedback: 'Right. Mutually exclusive conditions make the choice between looping back and moving on unambiguous.' }
  - { text: 'Because SFC does not allow two transitions to share StampDown', feedback: 'Two transitions from the same step can test the same input; they need extra conditions to tell the branches apart.' }
  - { text: 'Because Hits can be both less than 3 and greater than 3 at the same time', feedback: 'An INT holds one value at a time; testing both sides ensures each branch covers its exact case.' }
```

## What you will do in the practice

The starting chart in `src/BufferRelease.sfc.json` has only `IDLE` and `LOAD`, so it never holds the boxes at the blade or releases them one at a time. The scenario presses the start button at {{t:200}} ms, waits for five boxes to accumulate behind the blade, then gives five presses of the release button starting at {{t:16000}} ms and checks `Done` at {{t:36000}} ms with `Fault` off throughout. Build the full chart, save it and press {{ui:learn.check}}.
