## The machine

This station moves one crate from the left end of a belt to the right end without an operator button. The crate starts already resting in front of sensor `EyeA`. Once the belt moves, the crate leaves `EyeA` behind and travels across the empty middle of the belt until it reaches sensor `EyeB`, where it must stop.

![The latch-two-sensors scene seen from the front. A belt conveyor on legs runs from left to right with a cardboard crate resting near its left end, directly in front of the EyeA sensor. Near the right end, a second optical sensor EyeB looks across the belt. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has four parts. The crate itself is not wired to the PLC: your program knows where it is only from the two sensors.

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

## Holding an output between two sensors

As soon as the belt moves the crate a few centimetres, the crate leaves the beam of `EyeA`, and `EyeA` goes FALSE. For most of the trip, **neither sensor sees the crate**. If a plain coil on `Run` were driven straight from `EyeA`, the belt would inch forward until the crate cleared the first beam and then stop in the middle of the belt.

In Ladder, you do not always need a separate memory variable for this. An output variable can hold its own state when you drive it with a **SET coil** `(S)` on one rung and a **RESET coil** `(R)` on another rung. Once the SET rung conducts, the output stays TRUE scan after scan even after the first sensor goes dark, until the RESET rung conducts and clears it.

```timing
span: 6000
signals:
  - { name: EyeA, edges: [0, 600] }
  - { name: EyeB, edges: [4600, 6000] }
  - { name: Run, edges: [0, 4600] }
caption: EyeA goes dark long before EyeB sees the crate, so Run must stay latched in between
```

Two choices depend on the machine:

- **Which contact type each sensor needs.** A sensor that turns TRUE at the event uses a normally open contact; one that turns FALSE at the event uses a normally closed contact.
- **Which rung comes last.** ZPLC solves rungs from top to bottom, so if both rungs conduct in the same scan, the rung drawn last decides the final value of the output.

## Worked example

A sump pump drains a pit between two float switches. `HighLevel` turns TRUE when water reaches the top of the pit and starts the pump. `LowLevel` is TRUE while water is still above the bottom and turns **FALSE** when the pit is empty, which must stop the pump. Because `LowLevel` is FALSE when empty, the stop rung uses a normally closed contact. Here, overflowing the pit is the worse failure, so the SET rung is drawn last: if `LowLevel` sticks FALSE while `HighLevel` is TRUE, the pump still runs.

```ld-figure
src: reading/sump-pump.ld.json
caption: Rung 1 resets Pump when LowLevel is FALSE; rung 2 sets Pump on HighLevel and comes last so high level wins
```

Read it from top to bottom. No local variable is declared: `Pump` itself is the latch. When water rises past `LowLevel` and reaches `HighLevel`, rung 2 sets `Pump`. As water drains, `HighLevel` turns FALSE, but `Pump` stays TRUE because neither rung resets it while `LowLevel` is still TRUE. When the pit empties, `LowLevel` turns FALSE, the normally closed contact in rung 1 conducts, and `Pump` resets.

```ld-try
src: reading/sump-pump.ld.json
inputs:
  - { name: HighLevel, kind: switch }
  - { name: LowLevel, kind: switch }
outputs: [Pump]
timing: [HighLevel, LowLevel, Pump]
caption: Turn LowLevel on, pulse HighLevel on and off, then turn LowLevel off; try HighLevel on with LowLevel off
```

Press Run. Switch `LowLevel` on, then switch `HighLevel` on and back off: `Pump` stays on between the two levels. Switch `LowLevel` off: `Pump` stops. Now switch `HighLevel` on while `LowLevel` is still off: `Pump` runs, because rung 2 comes last.

Your belt station uses two optical sensors that both turn TRUE when they see a crate, and its stop priority is for you to decide from what must happen if both sensors ever see a crate at once.

## Common mistakes

- Driving a plain `Run` coil from `EyeA`. The crate moves just clear of `EyeA` and stops halfway down the belt.
- Choosing the contact type by habit instead of reading the signal table. Check whether the sensor is TRUE or FALSE at the moment it must act.
- Drawing the SET and RESET rungs in the wrong order for the machine's priority. Always check what happens if both conditions are TRUE in the same scan.
- Driving the same output with both a plain coil and a SET or RESET coil. A latched output is written only by its SET and RESET rungs.

> [!NOTE]
> A latched output keeps its value only while the program runs. When the PLC restarts, outputs start at FALSE again.

## Check yourself

```quiz
question: 'Why does a plain coil from EyeA to Run fail to move the crate to EyeB?'
options:
  - { text: 'Because EyeA turns FALSE as soon as the crate leaves its beam, so a plain coil turns Run off before the crate reaches EyeB', correct: true, feedback: 'Yes. Neither sensor sees the crate across the middle of the belt, so Run must stay latched.' }
  - { text: 'Because EyeA cannot drive an output coil directly', feedback: 'A contact can drive a coil directly; the problem is that EyeA goes dark too soon.' }
  - { text: 'Because EyeB overrides EyeA while the crate is in the middle', feedback: 'EyeB is FALSE while the crate is in the middle of the belt.' }
```

```quiz
question: 'In the sump pump worked example, LowLevel is FALSE and HighLevel is TRUE in the same scan. What is Pump at the end of the scan?'
options:
  - { text: 'TRUE, because rung 2 sets Pump after rung 1 resets it', correct: true, feedback: 'Right. Rungs are solved from top to bottom, so the SET rung written last wins.' }
  - { text: 'FALSE, because the normally closed contact on LowLevel conducts', feedback: 'Rung 1 does reset Pump first, but rung 2 sets it again in the same scan.' }
  - { text: 'It keeps whatever value it had on the previous scan', feedback: 'Both rungs conduct in this scan, so Pump is written and keeps the last write.' }
```

## What you will do in the practice

The starting program declares the inputs EyeA and EyeB and the output Run, and has no rungs yet. A crate starts in front of EyeA; you will draw the rungs so the belt starts when EyeA sees the crate, keeps running after EyeA goes dark, and stops when EyeB sees the crate, with the stop winning if both sensors are active together. Then press {{ui:learn.check}}.
