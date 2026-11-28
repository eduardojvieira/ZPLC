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

`Remover1` is not wired to the PLC: it clears every box that reaches the end of `Outfeed` on its own. Your program reads four inputs and drives eight outputs.

## Priority, grants and interlocks

When two lines ask for the same resource at the same time, driving each actuator straight from its own sensor causes a collision: both blades open together and two boxes meet in the junction. A merge needs three rules working together.

- **A grant memory per requester.** Instead of reacting directly to a waiting sensor, the program latches a grant bit for the winning line. While a grant is active, no new grant may be issued — even if the other line starts waiting.
- **A clear priority rule.** When no grant is active and the shared zone is free, an `IF ... ELSIF` decides who goes first. Because `IF` is checked before `ELSIF`, the first branch wins whenever both requests are TRUE in the same scan.
- **An interlock at the outputs.** The outputs are written so that the two opposing actions can never be enabled together. Even if a bug tried to set both grants, the output expression refuses to open both sides at once.

Finally, a grant must end only after the granted item has finished using the shared zone — never the instant the waiting sensor clears, because the item is still crossing the junction then.

## Worked example

Two truck lanes share a single-lane weighbridge. `NorthReq` and `SouthReq` are TRUE while a truck waits at the north or south entry gate, `BridgeBusy` is TRUE while a truck stands on the bridge, and `WeighDone` is a pulse from the scale operator once the truck has driven off the far side. Northbound trucks have priority when both lanes wait, and only one green light (`GreenNorth` or `GreenSouth`) may ever be lit.

```st
PROGRAM Weighbridge
VAR_INPUT
    NorthReq   : BOOL;
    SouthReq   : BOOL;
    BridgeBusy : BOOL;
    WeighDone  : BOOL;
END_VAR
VAR_OUTPUT
    GreenNorth : BOOL;
    GreenSouth : BOOL;
END_VAR
VAR
    AllowNorth : BOOL;
    AllowSouth : BOOL;
END_VAR

IF NOT AllowNorth AND NOT AllowSouth AND NOT BridgeBusy THEN
    IF NorthReq THEN
        AllowNorth := TRUE;
    ELSIF SouthReq THEN
        AllowSouth := TRUE;
    END_IF;
END_IF;

IF WeighDone THEN
    AllowNorth := FALSE;
    AllowSouth := FALSE;
END_IF;

GreenNorth := AllowNorth AND NOT AllowSouth;
GreenSouth := AllowSouth AND NOT AllowNorth;
END_PROGRAM
```

```timing
span: 8000
signals:
  - { name: NorthReq, edges: [500, 1500] }
  - { name: SouthReq, edges: [500, 5000] }
  - { name: AllowNorth, edges: [500, 3500] }
  - { name: AllowSouth, edges: [3700, 7000] }
  - { name: BridgeBusy, edges: [1200, 3200, 4600, 6600] }
  - { name: WeighDone, edges: [3500, 3700, 7000, 7200] }
caption: Both lanes request at once; North wins first, and South waits until WeighDone ends North's grant
```

Trace the arbitration. Both `NorthReq` and `SouthReq` turn TRUE together while the bridge is free. The outer `IF` allows one new grant, and the inner `IF NorthReq` runs before `ELSIF SouthReq`, so `AllowNorth` latches TRUE while `AllowSouth` stays FALSE. While the north truck crosses, `AllowNorth` blocks the outer `IF`, so `SouthReq` waits. While `WeighDone` is TRUE it clears both grants on every scan; on the first scan after it returns to FALSE, with `BridgeBusy` FALSE, `AllowSouth` latches.

Notice what this weighbridge gives you for free that the merge station does not. Here an operator sends `WeighDone` once the truck is gone, and the outputs are active-high green lights. In the practice station there is no `WeighDone` input — the zone sensor is FALSE both before the box reaches it and after it leaves — the blades hold when their output is TRUE rather than FALSE, and the program must also load three boxes on each feeder and count all six boxes out.

## Common mistakes

- Checking `WaitA` and `WaitB` in two separate `IF` statements instead of one `IF ... ELSIF`. When both sensors are TRUE on the same scan, both grants latch together and two boxes collide.
- Clearing a grant as soon as `Zone` is FALSE. `Zone` is already FALSE when the grant is given, so the grant ends on the same scan, the blade never opens and the boxes wait behind it.
- Forgetting that a blade holds while its output is TRUE. A blade written FALSE while the line runs and nothing is granted lets the boxes roll straight into the merge.
- Holding Emit TRUE. The emitter releases one box per rising edge, so a held output puts one box on the feeder; each further box needs the output to go FALSE and TRUE again.

> [!NOTE]
> An interlock in PLC code protects the sequence against logical collisions in simulation, not people on a real floor. Physical guarding and emergency stops belong in dedicated hardware.

## Check yourself

```quiz
question: In the weighbridge example, both NorthReq and SouthReq turn TRUE on the same scan while BridgeBusy is FALSE. Why does AllowSouth stay FALSE?
options:
  - { text: 'Because NorthReq is tested first in IF ... ELSIF, so the ELSIF branch does not run on that scan, and on the next scan AllowNorth blocks new grants', correct: true, feedback: 'Yes. The IF ... ELSIF order gives North priority, and the active AllowNorth latch keeps the outer IF closed until WeighDone.' }
  - { text: 'Because SouthReq is ignored whenever NorthReq has ever been TRUE', feedback: 'SouthReq is not ignored permanently; it is granted as soon as AllowNorth clears and BridgeBusy is FALSE.' }
  - { text: 'Because BridgeBusy turns TRUE on the same scan as NorthReq', feedback: 'The truck takes time to reach the bridge; what blocks South on the next scan is AllowNorth being TRUE.' }
```

```quiz
question: Why does the weighbridge wait for WeighDone before clearing AllowNorth instead of clearing it when NorthReq turns FALSE?
options:
  - { text: 'Because the truck leaving the entry gate is still crossing the shared bridge, so granting South immediately would cause a collision', correct: true, feedback: 'Right. Leaving the waiting sensor only means the item started moving; the grant must hold until the shared zone is clear.' }
  - { text: 'Because NorthReq stays TRUE until the truck leaves the bridge', feedback: 'NorthReq is at the entry gate and turns FALSE as soon as the truck pulls forward onto the bridge.' }
  - { text: 'Because AllowNorth cannot be cleared by an IF statement', feedback: 'Any BOOL variable in VAR can be cleared by an IF statement; the choice is which event proves the shared zone is clear.' }
```

## What you will do in the practice

The starting program in `src/MergeLines.st` declares the four inputs and eight outputs and drives nothing. The scenario presses the start button at {{t:200}} ms and checks that all six boxes — three from each feeder — leave the outfeed with no collisions and with `Done` on at {{t:25000}} ms. Write the feeder loading, priority arbitration and blade interlocks, save the file and press {{ui:learn.check}}.
