## The machine

When two packing lines feed a single downstream belt, the junction can carry only one box at a time. Each feeder has a stop blade to hold its boxes back and an optical sensor that reports a waiting box; a third sensor past the junction watches the shared merge zone.

![The merge-two-lines scene seen from the front. Three belt conveyors form a T-junction: FeedA runs from the left into the junction, FeedB enters from the foreground into the side of the junction, and Outfeed continues to the right. Four cyan corner marks mark EmitterA at the left end of FeedA with StartButton behind it, and EmitterB at the near end of FeedB. Near the junction sit EyeA with BladeA on FeedA and EyeB with BladeB on FeedB. Along Outfeed stand EyeZone, DoneLight behind the belt, and Remover1 at the far right end. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has thirteen parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FeedA`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `FeedB`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Outfeed`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `EmitterA`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EmitterB`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `BladeA`      | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `BladeB`      | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `EyeA`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeB`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeZone`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Remover1`    | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `DoneLight`   | Indicator light        | A pilot lamp on the operator panel that shows one state.                                                      |

| Variable | Signal                | Direction & type  | Meaning                                                 |
| -------- | --------------------- | ----------------- | ------------------------------------------------------- |
| `RunA`   | `FeedA.run`           | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunB`   | `FeedB.run`           | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunOut` | `Outfeed.run`         | PLC output · BOOL | TRUE runs the belt forward.                             |
| `EmitA`  | `EmitterA.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `EmitB`  | `EmitterB.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `HoldA`  | `BladeA.extend`       | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `HoldB`  | `BladeB.extend`       | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `WaitA`  | `EyeA.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `WaitB`  | `EyeB.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `Zone`   | `EyeZone.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| —        | `Remover1`            | —                 | Not wired to the PLC.                                   |
| `Start`  | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                     |
| `Done`   | `DoneLight.lit`       | PLC output · BOOL | TRUE switches the lamp on.                              |

`Remover1` is not wired to the PLC: it clears every box that reaches the end of `Outfeed` on its own. Your Ladder diagram reads four inputs and drives eight outputs.

## Priority and interlocks in Ladder

In Ladder diagram, rungs are solved from top to bottom on every scan, and a coil written on one rung is seen at once by the rungs below it. That gives you priority arbitration without any special block:

- **Put the higher-priority grant rung first.** Its series contacts check the request, normally closed contacts on both grant bits, and a normally closed contact on the shared zone sensor, driving a **set coil** (`S`).
- **Put the lower-priority grant rung right below it.** It uses the same normally closed contacts on both grant bits. When both requests arrive on the same scan, rung 1 sets the first grant bit, so its normally closed contact on rung 2 is already open and the second grant cannot set.
- **Clear both grant bits with reset coils (`R`)** only when the granted item has finished crossing the shared zone, and cross-interlock the output coils with normally closed contacts.

## Worked example

Two truck lanes share a single-lane weighbridge. `NorthReq` and `SouthReq` are TRUE while a truck waits at the north or south entry gate, `BridgeBusy` is TRUE while a truck stands on the bridge, and `WeighDone` is a button pressed by the scale operator once the truck has cleared. Northbound trucks win when both lanes wait, and only one green light (`GreenNorth` or `GreenSouth`) may ever light.

```ld-figure
src: reading/weighbridge.ld.json
caption: Rungs 1 and 2 set the grant latches in priority order; rungs 3 and 4 reset them on WeighDone; rungs 5 and 6 interlock the two green lights
```

Rung 1 tests `NorthReq` in series with normally closed contacts on `AllowNorth`, `AllowSouth` and `BridgeBusy`, setting `AllowNorth`. Rung 2 tests `SouthReq` with the same normally closed contacts. Because rung 1 runs first, `AllowNorth` is already TRUE when rung 2 is solved, so `AllowSouth` stays FALSE whenever both lanes request together.

```ld-try
src: reading/weighbridge.ld.json
inputs:
  - { name: NorthReq, kind: switch }
  - { name: SouthReq, kind: switch }
  - { name: BridgeBusy, kind: switch }
  - { name: WeighDone, kind: push }
outputs: [GreenNorth, GreenSouth]
timing: [NorthReq, SouthReq, GreenNorth, GreenSouth]
caption: Switch both NorthReq and SouthReq on, then press WeighDone to hand the bridge to South
```

Press Run and switch on both `NorthReq` and `SouthReq`: `GreenNorth` lights while `GreenSouth` stays off. Switch `NorthReq` off and see that `GreenNorth` holds its latch. Press `WeighDone` once: `AllowNorth` resets at once, and `GreenSouth` lights when you release it, because rung 4 clears `AllowSouth` on every scan while `WeighDone` is held.

Here the scale operator gives `WeighDone` to end a grant, and the outputs are active-high green lights. In the practice station there is no `WeighDone` input — `Zone` is FALSE both before the box arrives and after it leaves — the stop blades hold when `HoldA` or `HoldB` is TRUE, and your diagram must also load three boxes on each feeder and count all six boxes out.

## Common mistakes

- Omitting the normally closed contact of the higher-priority grant on the second grant rung. Both set coils fire on the same scan when both lines wait, opening both blades together.
- Using a normal coil for a grant. Next to the reset coils it does not compile; without them, the grant's own normally closed contact switches it off on the next scan, the blade flickers and no box gets through.
- Clearing a grant as soon as `Zone` is FALSE. `Zone` is already FALSE when the grant is given, so the grant ends on the same scan, the blade never opens and the boxes wait behind it.

> [!NOTE]
> A Ladder interlock keeps the simulated sequence from opening both blades together; it is not a safety function for a real machine.

## Check yourself

```quiz
question: In the weighbridge Ladder diagram, NorthReq and SouthReq are both TRUE while BridgeBusy is FALSE. Why does rung 2 not set AllowSouth?
options:
  - { text: 'Because rung 1 sets AllowNorth first in the same scan, opening the normally closed AllowNorth contact on rung 2', correct: true, feedback: 'Yes. Rung order plus the normally closed contact on AllowNorth enforces North priority.' }
  - { text: 'Because Ladder runs only one rung per scan', feedback: 'Ladder solves every rung from top to bottom on every scan; rung 2 runs, but its AllowNorth contact does not conduct.' }
  - { text: 'Because a set coil blocks all reset coils below it', feedback: 'A set coil changes only its own variable; it blocks rung 2 because rung 2 has a normally closed contact on that variable.' }
```

```quiz
question: What happens if you replace the set coils on AllowNorth and AllowSouth with normal coils?
options:
  - { text: 'The grant turns off as soon as the entry sensor goes FALSE or the next scan checks the normally closed self-contact', correct: false, feedback: 'Only without rungs 3 and 4: then the coil''s own normally closed contact switches it off on the next scan, so GreenNorth flickers on every scan.' }
  - { text: 'Both green lights stay on permanently', feedback: 'Normal coils drop whenever their rung stops conducting, so the grant cannot stay latched.' }
  - { text: 'The program refuses to compile', correct: true, feedback: 'Right. Rungs 3 and 4 still reset AllowNorth and AllowSouth, and ZPLC refuses a normal coil and a reset coil on one variable.' }
```

## What you will do in the practice

The starting diagram in `src/MergeLines.ld.json` declares all local variables, counters, inputs and outputs with no rungs. The scenario presses the start button at {{t:200}} ms and checks that all six boxes — three from each feeder — leave the outfeed with no collisions and with `Done` on at {{t:25000}} ms. Draw the feeder loading, priority grant latches and blade interlock rungs, save the file and press {{ui:learn.check}}.
