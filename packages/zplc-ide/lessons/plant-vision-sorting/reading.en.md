## The machine

This station sorts items by the code each one carries, and it is the first machine of its scene in the course. Items come one at a time on an infeed belt. A camera with its own software reads the code of each item as it passes through its field of view. Further down the belt, a swinging arm either lets the item ride straight on to the first product bin, or steers it onto a side belt that ends in a second bin. Real lines route parcels, bottles and parts in the same way, from a code that is printed on them.

![The vision-sorting scene seen from the front and above. An infeed belt runs from the left to the right. Cyan corner marks at its left end show where the emitter puts an item, and the start button stands behind it. A camera on an arm over the belt looks at a red dashed rectangle on the belt, which marks its field of view. Further along, a diverter arm lies along the far side of the belt, and a shorter side belt runs beside the infeed belt towards the right. Each belt ends at a bin, and the stack light stands behind the first bin. Each part has a label with its name, its kind and the variables wired to it.](images/machine.en.png)

The tables say what each part is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind          | What it is in a real plant                                                                                    |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `SideBelt`    | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter  | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Vision1`     | Vision sensor | A camera with its own software that reads a code printed on the item.                                         |
| `Arm1`        | Diverter arm  | A swinging arm over the belt that steers items off to a side line.                                            |
| `Product1`    | Item remover  | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `Product2`    | Item remover  | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button   | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `Beacon`      | Stack light   | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable  | Signal                | Direction & type             | Meaning                                                            |
| --------- | --------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `RunIn`   | `Infeed.run`          | PLC output · BOOL            | TRUE runs the belt forward.                                        |
| `RunSide` | `SideBelt.run`        | PLC output · BOOL            | TRUE runs the belt forward.                                        |
| —         | `Source1`             | —                            | Not wired to the PLC.                                              |
| `Seen`    | `Vision1.detect`      | PLC input · BOOL             | TRUE while an item is in the field of view.                        |
| `Code`    | `Vision1.code`        | PLC input · INT, 0 to 9 code | The code read from the item; 0 when there is none.                 |
| `Divert`  | `Arm1.divert`         | PLC output · BOOL            | TRUE swings the arm across the belt; FALSE brings it back to rest. |
| —         | `Product1`            | —                            | Not wired to the PLC.                                              |
| —         | `Product2`            | —                            | Not wired to the PLC.                                              |
| `Start`   | `StartButton.pressed` | PLC input · BOOL             | TRUE while the button is held down.                                |
| `Busy`    | `Beacon.amber`        | PLC output · BOOL            | TRUE lights the amber lamp.                                        |
| `Done`    | `Beacon.green`        | PLC output · BOOL            | TRUE lights the green lamp.                                        |

A PLC output drives a part of the machine; a PLC input is what a part reports. The emitter and the two bins are not wired: your program never sees an item except through the vision sensor, and only the scenario counts the items that reach each bin. The scenario releases twelve items, one every 5 seconds, eight with code 1 and four with code 2. Both belts run at 0.5 metres per second. Code 1 items belong in the first bin, `Product1`, and code 2 items in the second, `Product2`. The arm takes about 0.4 seconds to swing across and the same to come back.

## The code is there only for a moment

An item is in the field of view of the vision sensor for 1.0 second, about 100 scans. During that time `Seen` is TRUE and `Code` holds 1 or 2. Before and after, `Seen` is FALSE and `Code` is 0, which means that there is no item. The program reads the code of an item from the input in that second, and never again.

The arm is not at the sensor but further down the belt. When the item reaches the arm, `Code` is 0 again. So the program has to **remember** what it read, and act on it later, when the item has travelled from the sensor to the arm. How long that takes is the distance divided by the speed of the belt, and it belongs to the machine: a longer belt or a slower one needs a longer wait.

```timing
span: 12000
signals:
  - { name: InView, edges: [1000, 2000] }
  - { name: Due, edges: [1000, 7000] }
  - { name: Push, edges: [7000, 8000] }
caption: A parcel is read in the first second, the push is owed for the whole trip, and the pusher moves when the parcel arrives
```

## Worked example

On a parcel line, a reader sits 1.5 m before a pusher and the belt runs at 0.25 m/s. A parcel with code 3 must be pushed off the belt into a roll cage; every other parcel goes on. `InView` is TRUE while a parcel is in front of the reader, and `ParcelCode` holds its code. The pusher must go out when the parcel arrives, 1.5 ÷ 0.25 = 6 seconds after it was read, and stay out for 1 second:

```st
PROGRAM ParcelPusher
VAR_INPUT InView : BOOL; ParcelCode : INT; END_VAR
VAR_OUTPUT Push : BOOL; END_VAR
VAR
    Due    : BOOL;
    Travel : TON;
    Stroke : TON;
END_VAR
IF InView AND ParcelCode = 3 THEN Due := TRUE; END_IF;
Travel(IN := Due, PT := T#6s);
IF Travel.Q THEN Push := TRUE; Due := FALSE; END_IF;
Stroke(IN := Push, PT := T#1s);
IF Stroke.Q THEN Push := FALSE; END_IF;
END_PROGRAM
```

Read it from the top. The first IF sets `Due` when a parcel with code 3 is in view: a push is owed. `Travel` counts while `Due` is TRUE, and after 6 seconds the second IF puts the pusher out and clears `Due`, which makes `Travel` start again from zero for the next parcel. `Stroke` counts while the pusher is out, and after 1 second the last IF brings it back.

This line handles one parcel at a time: a second parcel read while the first is still travelling would not get a push of its own, because `Due` is already TRUE. The numbers 6 and 1 are the numbers of this line. The station of the practice has an arm instead of a pusher, belts at another speed and its own distances; what it needs, and when, is for you to decide from what must happen to the item.

## Common mistakes

- Counting scans as items. The code stays on the input for the whole second, so a program that reacts to every scan in which it is non-zero sees about a hundred items for each real one.
- Copying the numbers of another machine. With the 6 seconds and the 1 second of the example, in a run of this station all four code 2 items rode straight on to `Product1` and were misrouted.
- Never bringing the output back. In a run of the lesson's solution with the arm never released, all twelve items went to `Product2` and eight of them were misrouted.
- Taking a code of 0 for an item. 0 means that nothing is in the field of view.

## Check yourself

```quiz
question: A reader sits 1.5 m before a pusher and the belt runs at 0.25 m/s. How long after it has been read does a parcel reach the pusher?
options:
  - { text: '6 seconds', correct: true, feedback: 'Yes. The time is the distance divided by the speed: 1.5 ÷ 0.25 = 6.' }
  - { text: '0.375 seconds', feedback: 'That is the distance multiplied by the speed. The belt covers 0.25 m each second, so 1.5 m takes longer than one second.' }
  - { text: '1.75 seconds', feedback: 'That adds the two numbers, and a distance and a speed cannot be added. Divide the distance by the speed.' }
```

```quiz
question: In the parcel line, what does Due remember?
options:
  - { text: 'That a parcel with code 3 has been read and its push is still owed', correct: true, feedback: 'Right. The code is on the input for a moment only, so Due keeps the decision until the parcel arrives.' }
  - { text: 'That the pusher is out', feedback: 'That is what Push says. Due is cleared at the moment Push is set.' }
  - { text: 'That a parcel is in front of the reader', feedback: 'That is what InView says. Due stays TRUE long after the parcel has left the reader.' }
```

## What you will do in the practice

The starting program declares the inputs and outputs of the station and drives nothing. You will write the program of the station: a press of the start button, which the scenario gives at {{t:200}} ms, runs both belts, every code 1 item must end in `Product1` and every code 2 item in `Product2`, and the green lamp must be lit at the end, at {{t:78000}} ms. Then press {{ui:learn.check}}.
