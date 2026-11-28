## The machine

This is a sorting station. Eight workpieces, some red and some blue, ride an infeed belt to a stop blade. A colour sensor says which colour the one at the blade has. A red one is pushed sideways onto a short belt that ends in the red bin; a blue one is let go and rides on along the outfeed belt to the blue bin. A real plant sorts parcels, bottles and parts in the same way: it reads one property of each item and sends the item where it belongs.

![The colour-separation scene seen from above and in front, with the heading "Colour separation". A long infeed belt runs from left to right under the stop sensor, the colour sensor and the pusher, which stand behind it. A second belt, the outfeed, continues to the right and ends at a bin. A short side belt leaves the infeed toward the viewer and ends at another bin. The start button stands at the left end of the infeed, the stack light by the right-hand bin. Each part has a label with its name, its kind and the variables wired to it.](images/machine.en.png)

The station has twelve parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Outfeed`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `SideBelt`    | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Stop1`       | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `EyeStop`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Colour1`     | Colour sensor          | An optical sensor taught one colour: it tells whether the object in front of it has that colour.              |
| `Pusher1`     | Pusher                 | A pneumatic cylinder with a plate that pushes an item sideways off the belt.                                  |
| `RedBin`      | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `BlueBin`     | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `Beacon`      | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable    | Signal                | Direction & type  | Meaning                                                         |
| ----------- | --------------------- | ----------------- | --------------------------------------------------------------- |
| `RunIn`     | `Infeed.run`          | PLC output · BOOL | TRUE runs the belt forward.                                     |
| `RunOut`    | `Outfeed.run`         | PLC output · BOOL | TRUE runs the belt forward.                                     |
| `RunSide`   | `SideBelt.run`        | PLC output · BOOL | TRUE runs the belt forward.                                     |
| —           | `Source1`             | —                 | Not wired to the PLC.                                           |
| `Hold`      | `Stop1.extend`        | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it.         |
| `Waiting`   | `EyeStop.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                            |
| `IsRed`     | `Colour1.match`       | PLC input · BOOL  | TRUE while the object in the beam has the taught colour.        |
| `Extended`  | `Pusher1.extended`    | PLC input · BOOL  | TRUE when the plate is fully out.                               |
| `Retracted` | `Pusher1.retracted`   | PLC input · BOOL  | TRUE when the plate is fully back.                              |
| `Push`      | `Pusher1.extend`      | PLC output · BOOL | TRUE drives the plate out across the belt; FALSE pulls it back. |
| —           | `RedBin`              | —                 | Not wired to the PLC.                                           |
| —           | `BlueBin`             | —                 | Not wired to the PLC.                                           |
| `Start`     | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                             |
| `Busy`      | `Beacon.amber`        | PLC output · BOOL | TRUE lights the amber lamp.                                     |
| `Done`      | `Beacon.green`        | PLC output · BOOL | TRUE lights the green lamp.                                     |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only the twelve variables, never the workpiece itself: it knows a workpiece only through `Waiting` and `IsRed`. The source and the two bins are not wired: the source releases a workpiece by itself, and a bin takes away what reaches it.

The numbers below come from a run of a program that sorts all eight workpieces on this machine. They are right to about one scan ({{t:10}} ms).

- A workpiece leaves the source every 4 s, and a belt moves only while its variable (`RunIn`, `RunOut` or `RunSide`) is TRUE. In the scenario the first workpiece reaches the colour sensor 7.5 s after the run starts, and the others follow every 4 s. In order of arrival they are blue, red, blue, blue, blue, red, blue, blue.
- The colour sensor sees a workpiece about 0.2 s before the stop sensor does. `IsRed` is TRUE only while a red workpiece is in front of the colour sensor; for a blue workpiece it stays FALSE.
- The blade needs about 0.4 s to go up or down after `Hold` changes. A workpiece that the blade lets go stays in the beam of the stop sensor for about 0.6 s after `Hold` goes FALSE.
- The plate is fully out about 1.45 s after `Push` goes TRUE, and fully back about 1.46 s after `Push` goes FALSE from there. A `Push` that lasts one scan does not move the plate. A pushed workpiece has left the beam of the stop sensor about 0.75 s after `Push` goes TRUE.

## Read once, when the part lies still

A sensor answers about what is in front of it now, and a program may act on the answer only when the thing is ready to be acted on. The stop sensor turns TRUE the moment a workpiece enters its beam, and then the workpiece is still moving. So the program first waits until the sensor has stayed TRUE for a short time, which means the workpiece has come to rest, and only then asks for its colour. A TON timer gives that wait.

Then the program decides once. The sensors do not keep the answer for you: `IsRed` is TRUE only while a red workpiece is in front of the colour sensor, and the workpiece will move on. What the program decides must be kept, and the usual place is a **step number**: an INT variable whose every value is one step of the job.

In Instruction List one step is one **block** of lines. The block starts with `LD Step` and `EQ n`, which leave TRUE in the current result when the program is in step n, adds the condition that leaves the step with `AND`, and then `JMPCN` jumps to a label at the end of the block when the result is FALSE. The lines between the `JMPCN` and its label run only when the step and its condition both hold; they write the next step number.

A push is a sequence of steps, not a pulse. The plate stays out for as long as the output is TRUE, and it needs time to get there. So the program drives the output until the input `Extended` says that the plate is out, then lets the output fall and waits for `Retracted`. The program does not count seconds for the plate; the plate reports where it is.

## Worked example

A parcel line has a label scanner at a fixed stop. A parcel is carried against the stop and stays there; `AtStop` is TRUE while it does. The scanner is valid only once the parcel lies still, which this station takes as `AtStop` having stayed TRUE for `T#400ms`. Then `BadLabel` says whether the label is wrong. A parcel with a bad label is kicked off the line: a plate goes out across the belt until `KickOut` is TRUE, then comes back until `KickHome` is TRUE. A parcel with a good label is taken by an operator, so the station only deals with the bad ones.

```il
PROGRAM LabelCheck
VAR_INPUT
    AtStop : BOOL;
    BadLabel : BOOL;
    KickOut : BOOL;
    KickHome : BOOL;
END_VAR
VAR_OUTPUT
    Kick : BOOL;
END_VAR
VAR
    Step : INT;
    Still : TON;
    Gate : BOOL;
END_VAR

        LD    Step
        EQ    0
        AND   AtStop
        ST    Gate
        CAL   Still(IN := Gate, PT := T#400ms)

        LD    Step
        EQ    0
        AND   Still.Q
        AND   BadLabel
        JMPCN not0
        LD    1
        ST    Step
not0:
        LD    Step
        EQ    1
        AND   KickOut
        JMPCN not1
        LD    2
        ST    Step
not1:
        LD    Step
        EQ    2
        AND   KickHome
        JMPCN not2
        LD    0
        ST    Step
not2:
        LD    Step
        EQ    1
        ST    Kick
END_PROGRAM
```

Read it from the top. `CAL` takes variables, so the condition of the timer is stored in `Gate` first: the TON counts while the program is in step 0 and a parcel is at the stop, and it is called on every scan. The first block is step 0: when `Still.Q` and `BadLabel` are both TRUE it stores 1 in `Step`. That is the decision, made once: no later block reads `BadLabel`. The block of step 1 stores 2 when `KickOut` is TRUE, and the block of step 2 stores 0 when `KickHome` is TRUE. The last lines write `Kick`: `LD Step`, `EQ 1` and `ST Kick` make it TRUE only in step 1, so the plate goes out, and falls when the program leaves step 1.

The blocks are in the order of the steps, and the lines run from top to bottom, so a block sees the `Step` that the blocks above it have just written. When the program enters step 1 at block 0, the block of step 1 runs in the same scan; it finds `KickOut` FALSE and does nothing, because the plate has not moved yet.

This station has one route and no count. The station of the practice has two routes, and what each route has to wait for is for you to decide from the numbers of the machine above.

## Common mistakes

- Driving the belts straight from `Start`. The button is held only from {{t:200}} to {{t:400}} ms, and a belt moves only while its variable is TRUE. In a run that did this none of the eight workpieces left the source.
- Asking `IsRed` again after the push has begun. A pushed workpiece has left the colour sensor about 0.75 s after `Push` goes TRUE, and `IsRed` is FALSE again by then.
- Switching `Push` on for one scan. The plate does not move: `Push` is a state of the output that the plate follows, not a pulse. Keep it TRUE until `Extended`.
- Raising the blade again before it has gone down. It needs about 0.4 s to go down; in a run that raised it again after 0.3 s, no workpiece reached a bin.
- Putting a condition in the call of a timer, as in `CAL Still(IN := Step = 0, ...)`. `CAL` takes a variable, so compute the condition with `LD` and `ST` into a BOOL first.

> [!NOTE]
> The scenario grades what reaches the bins and what the lamps show. It cannot see which colour your program read, only where each workpiece ended.

## Check yourself

```quiz
question: Why does the program wait until the stop sensor has been TRUE for a short time before it reads the colour?
options:
  - { text: 'Because the sensor turns TRUE as the workpiece enters the beam, while it is still moving', correct: true, feedback: 'Yes. The short wait lets the workpiece come to rest before the program acts on it.' }
  - { text: 'Because IsRed is FALSE until the stop sensor has been TRUE for a while', feedback: 'No. On this machine the colour sensor sees a workpiece about 0.2 s before the stop sensor does, so IsRed is already TRUE when the stop sensor turns on.' }
  - { text: 'Because a TON cannot start counting before the sensor has been TRUE for a while', feedback: 'A TON starts counting as soon as its input is TRUE. The wait is a choice of the design, to let the workpiece settle.' }
```

```quiz
question: In LabelCheck, Step is 1 and KickOut is FALSE. What does the last block of the program, LD Step, EQ 1, ST Kick, store in Kick?
options:
  - { text: 'TRUE', correct: true, feedback: 'Right. EQ 1 leaves TRUE in the current result while Step is 1, and ST stores it in Kick.' }
  - { text: 'FALSE', feedback: 'The result of EQ 1 is TRUE while Step is 1. KickOut only decides when the program leaves step 1.' }
  - { text: 'Nothing: the block is skipped', feedback: 'Only the blocks with a JMPCN are skipped. This one has none, so it runs on every scan.' }
```

```quiz
question: The plate takes about 1.45 s to reach Extended after Push goes TRUE. What should the program do during that time?
options:
  - { text: 'Keep Push TRUE until Extended is TRUE', correct: true, feedback: 'Yes. The plate follows the output, and Extended tells the program that the stroke is finished.' }
  - { text: 'Set Push TRUE for one scan and then FALSE', feedback: 'A Push that lasts one scan does not move the plate on this machine.' }
  - { text: 'Switch Push off after a fixed 1 s', feedback: 'At 1 s the plate is not yet out. The machine reports the end of the stroke with Extended, so the program does not need to count.' }
```

## What you will do in the practice

The starting project latches `Start` and runs the infeed belt, and does nothing else. You will write the program of the station: a press of the start button, which the scenario gives at {{t:200}} ms, runs the belts; every red workpiece ends in the red bin, every blue one in the blue bin, nothing is dropped, and the green lamp lights after the eighth. Then press {{ui:learn.check}}.
