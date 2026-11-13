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
VAR
    Active    : BOOL;
    State     : INT;
    Peak      : REAL;            (* the highest reading while one box crosses the array, in cm *)
    Cls       : INT;             (* class of the box last measured: 0 short, 1 medium, 2 tall *)
    Route     : INT;             (* class of the box now on the turntable *)
    Sorted    : INT;
    ArrayRise : R_TRIG;
    ArrayFall : F_TRIG;
    Waiting   : TON;
    Settled   : TON;
    Arrived   : TON;
    Cleared   : TON;
    TableFree      : F_TRIG;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* measure: latch the top of the box while it crosses the array; classify it when it has passed.
   The edges sit halfway between the readings 20, 30 and 40 cm. *)
ArrayRise(CLK := ArrayBusy);
ArrayFall(CLK := ArrayBusy);
IF ArrayRise.Q THEN
    Peak := 0.0;
END_IF;
IF ArrayBusy AND HeightCm > Peak THEN
    Peak := HeightCm;
END_IF;
IF ArrayFall.Q THEN
    IF Peak > 35.0 THEN
        Cls := 2;
    ELSIF Peak > 25.0 THEN
        Cls := 1;
    ELSE
        Cls := 0;
    END_IF;
END_IF;

TableFree(CLK := OnTable);
Waiting(IN := State = 1 AND AtBlade AND AtCentre, PT := T#300ms);
Settled(IN := State = 3, PT := T#800ms);
Arrived(IN := State = 4 AND (AtCentre OR AtLeft OR AtRight), PT := T#200ms);
Cleared(IN := State = 6, PT := T#700ms);

(* one state per step: 0 idle, 1 wait for a box at the blade, 2 release it onto the turntable, 3 stop it there,
   4 turn, 5 send it out, 6 let it clear the turntable, 7 turn back to the centre *)
CASE State OF
    0:
        IF Active THEN
            State := 1;
        END_IF;
    1:
        IF Waiting.Q THEN
            Route := Cls;
            State := 2;
        END_IF;
    2:
        (* the box is across the turntable: the blade can rise behind it and the belts stop *)
        IF OnTable THEN
            State := 3;
        END_IF;
    3:
        IF Settled.Q THEN
            State := 4;
        END_IF;
    4:
        IF Arrived.Q THEN
            State := 5;
        END_IF;
    5:
        (* the box has left the turntable when the beam over it clears again *)
        IF TableFree.Q THEN
            State := 6;
        END_IF;
    6:
        IF Cleared.Q THEN
            State := 7;
        END_IF;
    7:
        IF AtCentre THEN
            Sorted := Sorted + 1;
            State := 1;
        END_IF;
END_CASE;

RunIn     := Active;
RunCentre := Active;
RunRight  := Active;
RunLeft   := Active;
Hold      := Active AND State <> 2;
RunTable  := State = 2 OR State = 5;
ToLeft    := Route = 2 AND State >= 4 AND State <= 6;
ToRight   := Route = 1 AND State >= 4 AND State <= 6;
Done      := Sorted >= 7;
Busy      := Active AND NOT Done;

END_PROGRAM
