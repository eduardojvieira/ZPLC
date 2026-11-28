## The machine

This station gathers workpieces in a crate. An empty crate comes in on a belt, a lift raises it to the height of a feeder, the workpieces are fed into it one at a time, and the full crate is lowered and sent out on a second belt. Real plants fill crates and trays like this before the next machine takes them away.

![The lift-stacking scene seen from the front. A belt conveyor runs from the left to the middle, where a lift stands in a frame; above the lift a feeder belt runs towards the back of the scene; a second belt leaves the lift to the right and ends at an open crate bin. The start button, three sensors, a stack light and the two item emitters are marked. Each part has a label with its name, its kind and its wired signal.](images/machine.en.png)

The station has twelve parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FloorIn`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `CrateSource` | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Lift1`       | Lift                   | A vertical conveyor that carries an item between floors or levels of a line.                                  |
| `Feeder`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `PartSource`  | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `FloorOut`    | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `CrateBin`    | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `CrateEye`    | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `CountEye`    | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `OutEye`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `StackLight1` | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable    | Signal                | Direction & type  | Meaning                                           |
| ----------- | --------------------- | ----------------- | ------------------------------------------------- |
| `RunIn`     | `FloorIn.run`         | PLC output · BOOL | TRUE runs the belt forward.                       |
| `EmitCrate` | `CrateSource.emit`    | PLC output · BOOL | Each rising edge releases one item onto the line. |
| `AtLevel1`  | `Lift1.atLevel1`      | PLC input · BOOL  | TRUE when the platform stands at level 1.         |
| `AtLevel2`  | `Lift1.atLevel2`      | PLC input · BOOL  | TRUE when the platform stands at level 2.         |
| `Up`        | `Lift1.up`            | PLC output · BOOL | TRUE moves the platform up.                       |
| `Down`      | `Lift1.down`          | PLC output · BOOL | TRUE moves the platform down.                     |
| `RunLift`   | `Lift1.run`           | PLC output · BOOL | TRUE runs the platform's belt forward.            |
| `RunFeeder` | `Feeder.run`          | PLC output · BOOL | TRUE runs the belt forward.                       |
| `EmitPart`  | `PartSource.emit`     | PLC output · BOOL | Each rising edge releases one item onto the line. |
| `RunOut`    | `FloorOut.run`        | PLC output · BOOL | TRUE runs the belt forward.                       |
| —           | `CrateBin`            | —                 | Not wired to the PLC.                             |
| `CrateEye`  | `CrateEye.detect`     | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `CountEye`  | `CountEye.detect`     | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `OutEye`    | `OutEye.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `Start`     | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.               |
| `Green`     | `StackLight1.green`   | PLC output · BOOL | TRUE lights the green lamp.                       |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only these variables: it never sees the crate or a workpiece, only what the sensors say about them.

Four facts about this scene come from a run of a finished program, in seconds from the start:

- The scene holds one crate and five workpieces: the crate source has one crate to give, and the workpiece source five.
- The scenario presses Start at {{t:200}} ms and releases it at {{t:400}} ms. The crate takes about 3.9 s to ride the in belt from its release to CrateEye.
- The platform of the lift takes about 1.5 s to go from level 1 to level 2. A workpiece takes about 3.2 s on the feeder from its release to CountEye, and stays in the beam of CountEye for about 0.4 s.
- The scene counts the workpieces that rest inside the crate and shows the number in its facts text, as "Crate 1 holds 3 items." The scenario names the same number `loaded:crate:0`.

The platform has a belt of its own. `Up` and `Down` move the platform; `RunLift` runs the belt on the platform, which moves whatever stands on it. In a test run that kept the platform's belt running while the platform moved, {{ui:learn.check}} failed and the crate never held a workpiece.

```timing
span: 12000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: CrateEye, edges: [4120, 4660] }
  - { name: AtLevel1, edges: [0, 4150] }
  - { name: AtLevel2, edges: [5640, 12000] }
  - { name: CountEye, edges: [8890, 9290] }
caption: The sensors of the station from the press to the first workpiece, in a run of a finished program
```

## One thing at a time

A station does its jobs in an order: the crate comes in, the lift rises, the workpieces are fed, the lift lowers, the crate goes out. A program that wrote every output from the sensors in one line would try to do them all at once. The program needs to know which job is going on now, and it moves to the next one only when the machine says the current one is finished.

The usual way is a number: a **step** variable of type INT, with one branch of an `IF` and `ELSIF` chain for each step. In each branch the program turns on the outputs that step needs, and it changes `Step` when the thing that ends the step has happened. The ending can be a sensor, a position or a count.

A count is a second variable that grows by one each time something happens. The sequence uses it to decide whether to repeat a step or to go on.

Every step must have something that ends it. Ask of each step of your machine: how does the program know that this job is over?

A sensor signal has a start and an end, and the program can act on either one. Which of the two is right depends on what the machine does between them. An **edge** detector gives TRUE for one scan when a signal changes, which is what lets a program count something once.

## Worked example

A bag filler drops four screws, one at a time, into a bag, and lights `Done` when the bag is full. The input `ScrewEye` is TRUE while a screw falls past an eye under the chute. Each rising edge of `Drop` releases one screw.

The jobs are: wait for a press of `Start`, drop a screw, wait for it to pass the eye, and finish when four have passed. Four jobs give four steps. A count, `Screws`, decides whether step 2 goes back to step 1 or on to step 3.

```st
PROGRAM BagFiller
VAR_INPUT Start : BOOL; ScrewEye : BOOL; END_VAR
VAR_OUTPUT Drop : BOOL; Done : BOOL; END_VAR
VAR
    Step : INT;   (* 0 wait, 1 drop a screw, 2 wait for it to pass the eye, 3 bag full *)
    Screws : INT;
    Seen : R_TRIG;
    Pressed : R_TRIG;
END_VAR
Seen(CLK := ScrewEye);
Pressed(CLK := Start);
Drop := FALSE;
IF Step = 0 THEN
    IF Pressed.Q THEN
        Screws := 0;
        Step := 1;
    END_IF;
ELSIF Step = 1 THEN
    Drop := TRUE;
    Step := 2;
ELSIF Step = 2 THEN
    IF Seen.Q THEN
        Screws := Screws + 1;
        IF Screws >= 4 THEN
            Step := 3;
        ELSE
            Step := 1;
        END_IF;
    END_IF;
ELSIF Step = 3 THEN
    IF Pressed.Q THEN
        Screws := 0;
        Step := 1;
    END_IF;
END_IF;
Done := Step = 3;
END_PROGRAM
```

Read it from the top. `Drop` is FALSE on every scan except the one in which step 1 turns it on, so each screw gets one rising edge. Step 2 waits for `Seen.Q`, which is TRUE for one scan when the eye turns on, and counts the screw once, however long it stays in the beam. After the fourth screw the program goes to step 3, which lights `Done` until the next press of `Start`, which begins the next bag.

This machine has no lift and no crate, and a screw is counted when it reaches the eye. The station of the practice has to bring in a crate, move a lift and feed five workpieces, and when each one counts is for you to decide from what the machine does.

## Common mistakes

- Writing every output from the sensors in one line, with no step. Nothing says what the station is doing now, and the lift can move while a workpiece is being fed.
- Counting while the eye is TRUE instead of on an edge. At a scan of 0.01 s a workpiece that stays in the beam for 0.4 s would be counted about forty times.
- Leaving a step with nothing that ends it. The station waits there for ever.
- Running the platform's belt while the platform moves. A test run that did it failed {{ui:learn.check}}.
- Not setting a count to zero when a new job starts. A variable keeps its value between scans, so a count carries over from one bag to the next.

> [!NOTE]
> The grade cannot see how many workpieces rest in the crate. It sees that at least one did and that the crate reached its bin. Read the count in the facts text yourself.

## Check yourself

```quiz
question: In the bag filler, a screw stays in the beam of ScrewEye for many scans. How many screws does Screws count for it?
options:
  - { text: 'One', correct: true, feedback: 'Yes. Seen.Q is TRUE for one scan only, when the eye turns on, so the screw is counted once.' }
  - { text: 'As many as the scans the eye was TRUE', feedback: 'That would be the result of counting while ScrewEye is TRUE. The edge detector gives one scan.' }
  - { text: 'None, because the count only changes in step 3', feedback: 'The count changes in step 2, on the scan in which Seen.Q is TRUE.' }
```

```quiz
question: In the bag filler the hopper is empty, so no screw ever reaches the eye. What happens after Step becomes 2?
options:
  - { text: 'Step stays at 2, because only the eye ends that step', correct: true, feedback: 'Right. Step 2 has one exit, Seen.Q, and nothing else moves Step on.' }
  - { text: 'Step goes back to 1 after one scan', feedback: 'Nothing in step 2 writes Step unless Seen.Q is TRUE.' }
  - { text: 'Done lights because the bag has nothing to wait for', feedback: 'Done follows step 3, and step 3 is reached only after four screws.' }
```

## What you will do in the practice

The starting program declares the six inputs and the nine outputs of the station and drives nothing. You will write the program of the station: after the press that the scenario gives at {{t:200}} ms, a crate comes in and rides the lift to the feeder, five workpieces are fed into it one at a time, the full crate goes down and leaves on the out belt, and `Green` lights when `OutEye` has seen it leave. Then press {{ui:learn.check}}.
