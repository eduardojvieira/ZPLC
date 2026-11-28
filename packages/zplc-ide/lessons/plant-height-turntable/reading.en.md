## The machine

This station sorts boxes by height, and it is the first machine of its scene in the course. Boxes of three heights come one at a time on an infeed belt. A light array beside the belt measures each box as it passes, and a stop blade holds the box back in front of a turntable. The turntable turns the box towards one of three outfeed belts, straight on, to the right or to the left, and each belt ends in a bin of its own class: short, medium or tall. Real lines split one stream of goods into several in the same way, by a property that a sensor can measure.

![The height-sorting scene seen from above at an angle. An infeed belt runs from the left to a square turntable in the middle, with the light array on a post beside it near the left end of the belt. Three belts leave the turntable, one straight on to the right, one towards the viewer and one away from the viewer, and each ends in a bin. Cyan corner marks at the left end of the infeed belt show where the emitter puts a box. Each part has a label with its name, its kind and the variables wired to it.](images/machine.en.png)

The tables say what each part is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part | Kind | What it is in a real plant |
| --- | --- | --- |
| `Infeed` | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines. |
| `Source1` | Item emitter | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `LightArray1` | Light array | A light curtain: a column of beams across the line that measures how tall an object is. |
| `Stop1` | Stop blade | A plate that rises across the belt to hold items back until they are let through. |
| `EyeStop` | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it. |
| `Table1` | Turntable | A rotating platform that turns an item towards one of several lines. |
| `EyeTable` | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it. |
| `OutCentre` | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines. |
| `OutRight` | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines. |
| `OutLeft` | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines. |
| `BinShort` | Item remover | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator. |
| `BinMedium` | Item remover | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator. |
| `BinTall` | Item remover | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator. |
| `StartButton` | Push button | A button on the operator panel that is pressed only while a finger holds it. |
| `Beacon` | Stack light | A tower of coloured lamps that shows from afar what the machine is doing. |

| Variable | Signal | Direction & type | Meaning |
| --- | --- | --- | --- |
| `RunIn` | `Infeed.run` | PLC output · BOOL | TRUE runs the belt forward. |
| — | `Source1` | — | Not wired to the PLC. |
| `ArrayBusy` | `LightArray1.detect` | PLC input · BOOL | TRUE while any beam is broken. |
| `HeightCm` | `LightArray1.height` | PLC input · REAL, 0 to 60 = 0 to 0.6 m | The height of the top of the item in the curtain; 0 when no beam is broken. |
| `Hold` | `Stop1.extend` | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `AtBlade` | `EyeStop.detect` | PLC input · BOOL | TRUE while an object is in the beam. |
| `AtCentre` | `Table1.atCentre` | PLC input · BOOL | TRUE when the platform faces the centre line. |
| `AtLeft` | `Table1.atLeft` | PLC input · BOOL | TRUE when the platform faces the left line. |
| `AtRight` | `Table1.atRight` | PLC input · BOOL | TRUE when the platform faces the right line. |
| `RunTable` | `Table1.run` | PLC output · BOOL | TRUE runs the platform's surface forward. |
| `ToLeft` | `Table1.toLeft` | PLC output · BOOL | TRUE turns the platform to the left line; with neither command it returns to the centre. |
| `ToRight` | `Table1.toRight` | PLC output · BOOL | TRUE turns the platform to the right line; with neither command it returns to the centre. |
| `OnTable` | `EyeTable.detect` | PLC input · BOOL | TRUE while an object is in the beam. |
| `RunCentre` | `OutCentre.run` | PLC output · BOOL | TRUE runs the belt forward. |
| `RunRight` | `OutRight.run` | PLC output · BOOL | TRUE runs the belt forward. |
| `RunLeft` | `OutLeft.run` | PLC output · BOOL | TRUE runs the belt forward. |
| — | `BinShort` | — | Not wired to the PLC. |
| — | `BinMedium` | — | Not wired to the PLC. |
| — | `BinTall` | — | Not wired to the PLC. |
| `Start` | `StartButton.pressed` | PLC input · BOOL | TRUE while the button is held down. |
| `Busy` | `Beacon.amber` | PLC output · BOOL | TRUE lights the amber lamp. |
| `Done` | `Beacon.green` | PLC output · BOOL | TRUE lights the green lamp. |

A PLC output drives a part of the machine; a PLC input is what a part reports. The emitter and the three bins are not wired: your program never sees a box except through the sensors, and only the scenario counts the boxes that reach each bin. The scenario releases seven boxes, one every 8.5 seconds: one of 20 cm, five of 30 cm and one of 40 cm.

## One reading is not a height

The light array reports the height of the top of whatever stands in it, and 0 when nothing does. So `HeightCm` is 0 before a box, the height of the box while it is in the array, and 0 again after it. A box is in the array for 0.8 seconds, which is about 80 scans. On a real array, a box that is rough or tilted gives a reading that moves while it passes, so the program keeps the highest value it saw. That value is the **peak**.

The peak is also the only thing the program can use later. The box leaves the array and the reading falls back to 0, but the box is not at the turntable yet: in a run of the lesson's solution a box leaves the array at 10.3 seconds and is across the turntable at 13.8 seconds. The answer has to be kept in a variable of the program until the box needs it.

```timing
span: 8000
signals:
  - { name: Busy, edges: [1000, 3000] }
  - { name: TooHigh, edges: [3000, 8000] }
caption: A pallet crosses the curtain, and the answer exists from the moment it has left
```

## Worked example

A goods-in dock moves pallets on a roller track through a light curtain. `Busy` is TRUE while a pallet is in the curtain and `Height` is the height of the top of the pallet in centimetres. The high-bay lane takes pallets up to 180 cm, so a pallet that is taller must be sent to the manual lane. `TooHigh` must say so as soon as the pallet has left the curtain, and keep saying it until the next pallet has left:

```st
PROGRAM DockGate
VAR_INPUT Busy : BOOL; Height : REAL; END_VAR
VAR_OUTPUT TooHigh : BOOL; END_VAR
VAR
    Top   : REAL;
    Enter : R_TRIG;
    Leave : F_TRIG;
END_VAR
Enter(CLK := Busy);
Leave(CLK := Busy);
IF Enter.Q THEN Top := 0.0; END_IF;
IF Busy AND Height > Top THEN Top := Height; END_IF;
IF Leave.Q THEN TooHigh := Top > 180.0; END_IF;
END_PROGRAM
```

Read it from the top. `Enter.Q` is TRUE for one scan when a pallet comes into the curtain, and it clears `Top` so that the last pallet does not count for this one. The second IF keeps the highest `Height` while `Busy` is TRUE. `Leave.Q` is TRUE for one scan when the pallet has gone, and that is the moment when `Top` is final, so the program compares it with the limit there and not earlier. After that `TooHigh` holds the answer, although `Height` is 0 again.

This machine has one pallet at a time and one yes or no. The station of the practice has three classes of box, and a turntable that must be turned for the box; how many classes the program tells apart and what the turntable does for each is for you to decide from what must happen to the box.

## Common mistakes

- Reading `HeightCm` when the box waits at the blade. The array is empty by then and reads 0. In a run of the lesson's solution with this change, all seven boxes went to the short bin and six of them were misrouted.
- Never clearing the peak. A 40 cm box leaves the peak at 40, so the boxes after it look as tall. In a run with this change, the four boxes after the tall one went to the tall bin and were misrouted.
- Taking a reading of 0 for a short box. 0 means that there is no box in the array.
- Deciding while the box is still in the array. The peak is final only when the array has become empty again.

## Check yourself

```quiz
question: Why can the program not simply read HeightCm when the box waits at the blade?
options:
  - { text: 'Because the array is empty by then and reads 0', correct: true, feedback: 'Yes. The reading exists only while the box is in the array, so the answer must be kept from then on.' }
  - { text: 'Because HeightCm changes only while the turntable turns', feedback: 'HeightCm comes from the light array and has nothing to do with the table.' }
  - { text: 'Because an input can be read only once per box', feedback: 'An input is read on every scan. It is the value that has gone: the array reads 0 when no box is in it.' }
```

```quiz
question: In the dock gate, a 190 cm pallet leaves the curtain and then a 120 cm pallet crosses. The clearing of Top on Enter.Q is removed. What is Top when the 120 cm pallet has left?
options:
  - { text: '190', correct: true, feedback: 'Right. Height never goes above 190, so the second IF keeps the old value and TooHigh is TRUE for a pallet that fits.' }
  - { text: '120', feedback: 'That is the height of the pallet, but Top changes only when Height is above it, and 190 is higher.' }
  - { text: '0', feedback: 'Top is set to 0 only by the clearing that was removed. Height reading 0 after the pallet does not clear it.' }
```

## What you will do in the practice

The starting program declares the inputs and outputs of the station and drives nothing. You will write the program of the station: a press of the start button, which the scenario gives at {{t:200}} ms, starts the line, and the seven boxes must leave on the belt of their class, short on the centre belt, medium to the right and tall to the left, with no box dropped. The green lamp must be lit at the end, at {{t:77000}} ms. Then press {{ui:learn.check}}.
