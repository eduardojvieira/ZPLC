(* Goal: sort seven boxes by height. A light array measures each box on the infeed belt and a stop blade holds it
   before the turntable. Send a short box straight on to the centre belt, a medium box right and a tall box left:
   run the box onto the turntable, stop it, turn the table (it turns only while its surface is stopped), run the box out
   and turn the table back to the centre. The green lamp lights when seven boxes are sorted. Write the program below. *)
PROGRAM HeightSort
VAR_INPUT
    Start     AT %I0.0 : BOOL;   (* StartButton.pressed *)
    ArrayBusy AT %I0.1 : BOOL;   (* LightArray1.detect: a box is in the light array *)
    AtBlade   AT %I0.2 : BOOL;   (* EyeStop.detect: a box waits at the blade *)
    OnTable   AT %I0.3 : BOOL;   (* EyeTable.detect: a box is across the turntable *)
    AtCentre  AT %I0.4 : BOOL;   (* Table1.atCentre *)
    AtLeft    AT %I0.5 : BOOL;   (* Table1.atLeft *)
    AtRight   AT %I0.6 : BOOL;   (* Table1.atRight *)
    HeightCm  AT %ID1  : REAL;   (* LightArray1.height: 0 to 60 is 0 to 0.6 m, so 20, 30 or 40 for a box *)
END_VAR
VAR_OUTPUT
    RunIn     AT %Q0.0 : BOOL;   (* Infeed.run *)
    RunTable  AT %Q0.1 : BOOL;   (* Table1.run *)
    RunCentre AT %Q0.2 : BOOL;   (* OutCentre.run: short boxes *)
    RunRight  AT %Q0.3 : BOOL;   (* OutRight.run: medium boxes *)
    RunLeft   AT %Q0.4 : BOOL;   (* OutLeft.run: tall boxes *)
    Hold      AT %Q0.5 : BOOL;   (* Stop1.extend: the blade holds the box while TRUE *)
    ToLeft    AT %Q0.6 : BOOL;   (* Table1.toLeft *)
    ToRight   AT %Q0.7 : BOOL;   (* Table1.toRight *)
    Busy      AT %Q1.0 : BOOL;   (* Beacon.amber *)
    Done      AT %Q1.1 : BOOL;   (* Beacon.green: seven boxes are sorted *)
END_VAR
END_PROGRAM
