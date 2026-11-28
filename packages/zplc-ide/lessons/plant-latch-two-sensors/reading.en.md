## The machine

This station moves one crate from the start of a belt to its far end using only two optical sensors. Unlike the first station, there is no push button and no emitter: the crate is already on the belt in front of `EyeA`, and the belt must carry it across the empty stretch until `EyeB` sees it and stops it.

![The latch-between-two-sensors scene seen from the front. A belt conveyor on legs runs from left to right. A cardboard crate sits at the left end of the belt in front of a diffuse optical sensor labeled EyeA on a post behind the belt. Further to the right, a second diffuse optical sensor labeled EyeB stands behind the belt looking across it. Each wired part has a label with its name, its kind and its signal; the crate is labeled as not wired.](images/machine.en.png)

The station has four parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part    | Kind                   | What it is in a real plant                                                                        |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `Belt1` | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.  |
| `Crate` | Box                    | A carton or a tote: the goods the line handles.                                                   |
| `EyeA`  | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it. |
| `EyeB`  | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it. |

| Variable | Signal        | Direction & type  | Meaning                              |
| -------- | ------------- | ----------------- | ------------------------------------ |
| `Run`    | `Belt1.run`   | PLC output · BOOL | TRUE runs the belt forward.          |
| —        | `Crate`       | —                 | Not wired to the PLC.                |
| `EyeA`   | `EyeA.detect` | PLC input · BOOL  | TRUE while an object is in the beam. |
| `EyeB`   | `EyeB.detect` | PLC input · BOOL  | TRUE while an object is in the beam. |

The crate itself is not wired to the PLC. Your program sees only `EyeA` and `EyeB` and drives `Run`: it knows where the crate is only at the two points where a sensor beam crosses the belt.

## Holding an output across the gap

At the start, the crate sits in `EyeA`'s beam, so `EyeA` is TRUE. As soon as the belt moves the crate a short distance forward, the crate leaves `EyeA`'s beam and `EyeA` turns FALSE. For several seconds neither sensor sees the crate. If the belt simply copied `EyeA`, it would stop as soon as the crate cleared the first sensor.

To cross the gap, the program needs a **latch** (set and reset): one condition turns the state ON, a second condition turns it OFF, and between the two events nothing overwrites the state. Because PLC variables keep their value from one scan cycle to the next until a statement writes a new value, the belt keeps running across the dark gap until `EyeB` turns TRUE.

```timing
span: 8000
signals:
  - { name: EyeA, edges: [0, 600] }
  - { name: Run, edges: [0, 4800] }
  - { name: EyeB, edges: [4800, 8000] }
caption: EyeA goes dark as soon as the crate leaves it; Run stays latched until EyeB sees the crate
```

When a set condition and a reset condition can both be TRUE in the same scan, you must choose which one wins:

- **Reset-dominant** means the stop condition wins when both are TRUE.
- **Set-dominant** means the start condition wins when both are TRUE.

That choice comes from what the machine must do if both sensors ever read TRUE together, not from the programming language.

## Worked example

A drainage pit under a wash bay has a sump pump driven by `Pump` and two float switches. `HighFloat` is TRUE when the water reaches the top mark and the pump must start. `LowFloat` is TRUE while the water is still above the bottom mark, so it turns FALSE when the pit is empty and the pump must stop. If both floats ever disagree during a surge (`HighFloat` is TRUE while `LowFloat` reads FALSE), running the pump is safer than letting the pit overflow, so this machine uses a **set-dominant** latch (`SR`):

```st
PROGRAM SumpPump
VAR_INPUT HighFloat : BOOL; LowFloat : BOOL; END_VAR
VAR_OUTPUT Pump : BOOL; END_VAR
VAR PumpLatch : SR; END_VAR
PumpLatch(S1 := HighFloat, R := NOT LowFloat);
Pump := PumpLatch.Q1;
END_PROGRAM
```

Read it from the top. When the water rises to the top mark, `HighFloat` becomes TRUE and sets `PumpLatch`. As the pump drains the pit, the water drops below the top mark so `HighFloat` turns FALSE, but `PumpLatch.Q1` stays TRUE because `LowFloat` is still TRUE (`R` is FALSE). Once the pit empties, `LowFloat` turns FALSE, `R` becomes TRUE, and `PumpLatch` resets, stopping the pump. Because `SR` is set-dominant (`S1` has priority), if `HighFloat` is TRUE at the same time `R` is TRUE, `Pump` stays TRUE.

Two things differ in the belt station of the practice: the polarity of the stop sensor (whether it is TRUE or FALSE when the crate arrives) and which condition must win if both sensors are TRUE at once. Those decisions are yours to make for the belt.

## Common mistakes

- Copying sensor A straight to the belt output. The crate moves only until it leaves `EyeA`'s beam, then stops halfway down the belt.
- Setting the output on `EyeA` and never resetting it on `EyeB`. The crate travels past `EyeB` and falls off the end of the belt.
- Choosing set priority when stop must win. If both sensors are ever TRUE together, the belt keeps running instead of stopping at `EyeB`.
- Inverting the stop sensor by habit. `EyeB` turns TRUE when the crate enters its beam, unlike a low-level switch that opens when a tank empties.

> [!NOTE]
> A `BOOL` variable declared in `VAR` or `VAR_OUTPUT` keeps its value from one scan cycle to the next until a statement writes a new value to it. An `IF` without an `ELSE` only writes when its condition is TRUE, so it naturally holds its previous value on every other scan.

## Check yourself

```quiz
question: Why does the crate stop halfway if the belt output simply copies EyeA?
options:
  - { text: 'Because EyeA turns FALSE as soon as the crate moves out of its beam, long before EyeB sees it', correct: true, feedback: 'Yes. EyeA only sees the crate at the start of the belt, so the program must hold the belt ON across the gap.' }
  - { text: 'Because EyeA is an output and cannot drive the belt', feedback: 'EyeA is a PLC input. Copying it is valid ST, but it goes FALSE as soon as the crate moves away.' }
  - { text: 'Because the belt stops automatically after one scan cycle', feedback: 'The belt runs for as long as Run is TRUE; it stops only because copying EyeA writes FALSE once the crate leaves the beam.' }
```

```quiz
question: In the sump pump worked example, HighFloat is TRUE and LowFloat is FALSE in the same scan. What is Pump at the end of the scan?
options:
  - { text: 'TRUE', correct: true, feedback: 'Right. SR is set-dominant, so S1 (HighFloat) wins over R (NOT LowFloat) when both are TRUE.' }
  - { text: 'FALSE', feedback: 'R is TRUE because LowFloat is FALSE, but SR gives priority to S1, so PumpLatch.Q1 stays TRUE.' }
  - { text: 'It alternates every scan', feedback: 'Both inputs are evaluated in the same way on every scan, so the output stays steady.' }
```

## What you will do in the practice

The starting program declares the inputs `EyeA` and `EyeB` and the output `Run`, with an empty body. You will latch the belt ON when `EyeA` sees the crate and reset it when `EyeB` sees the crate, with reset taking priority, so the crate reaches `EyeB` within {{t:8000}} ms and the belt is stopped at {{t:8000}} ms. Then press {{ui:learn.check}}.
