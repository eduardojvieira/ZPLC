PROGRAM BeltTransfer
VAR_INPUT
    Start    AT %I0.0 : BOOL;
    Waiting  AT %I0.1 : BOOL;
    OutEye   AT %I0.2 : BOOL;
    XMin     AT %I0.3 : BOOL;
    XMax     AT %I0.4 : BOOL;
    YMin     AT %I0.5 : BOOL;
    YMax     AT %I0.6 : BOOL;
    Gripped  AT %I0.7 : BOOL;
END_VAR
VAR_OUTPUT
    RunIn    AT %Q0.0 : BOOL;
    RunOut   AT %Q0.1 : BOOL;
    Emit     AT %Q0.2 : BOOL;
    Hold     AT %Q0.3 : BOOL;
    XPlus    AT %Q0.4 : BOOL;
    XMinus   AT %Q0.5 : BOOL;
    YPlus    AT %Q0.6 : BOOL;
    YMinus   AT %Q0.7 : BOOL;
    Grip     AT %Q1.0 : BOOL;
    Busy     AT %Q1.1 : BOOL;
    Done     AT %Q1.2 : BOOL;
END_VAR
VAR
    Active    : BOOL;
    State     : INT;
    Emitted   : INT;
    Placed    : INT;
    Feed      : BOOL;
    Settle    : TON;
    Rest      : TON;
    OutRise   : R_TRIG;
    Delivered : CTU;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* the box must stand still at the blade before the clamp comes down; after the release
   it must lie still on the stopped outfeed belt before the belt runs again *)
Settle(IN := Waiting AND State = 2, PT := T#300ms);
Rest(IN := State = 8, PT := T#600ms);
OutRise(CLK := OutEye);
Delivered(CU := OutRise.Q, R := FALSE, PV := 4);

(* one state per move: 0 idle, 2 wait for a box, 3 lower, 4 close, 5 lift, 6 carry,
   7 lower, 8 open and settle, 9 lift, 10 return, 11 finished *)
CASE State OF
    0:
        IF Active THEN
            Feed := TRUE;
            Emitted := 1;
            State := 2;
        END_IF;
    2:
        IF Settle.Q AND YMax AND XMin THEN
            State := 3;
        END_IF;
    3:
        IF YMin THEN
            State := 4;
        END_IF;
    4:
        IF Gripped THEN
            State := 5;
        END_IF;
    5:
        IF YMax THEN
            (* the box has left the blade: bring the next one while this one is carried *)
            IF Emitted < 4 THEN
                Feed := TRUE;
                Emitted := Emitted + 1;
            END_IF;
            State := 6;
        END_IF;
    6:
        IF XMax THEN
            State := 7;
        END_IF;
    7:
        IF YMin THEN
            State := 8;
        END_IF;
    8:
        IF Rest.Q THEN
            Placed := Placed + 1;
            State := 9;
        END_IF;
    9:
        IF YMax THEN
            State := 10;
        END_IF;
    10:
        IF XMin THEN
            IF Placed < 4 THEN
                State := 2;
            ELSE
                State := 11;
            END_IF;
        END_IF;
END_CASE;

RunIn  := Active;
Hold   := Active;
(* the outfeed belt stands still while a box is carried over it, put down and settling *)
RunOut := Active AND NOT (State = 6 OR State = 7 OR State = 8);
Emit   := Feed;
Feed   := FALSE;
Grip   := State >= 4 AND State <= 7;
YPlus  := (State = 2 OR State = 5 OR State = 9) AND NOT YMax;
YMinus := (State = 3 OR State = 7) AND NOT YMin;
XPlus  := State = 6 AND NOT XMax;
XMinus := (State = 2 OR State = 10) AND NOT XMin;
Done   := Delivered.Q;
Busy   := Active AND NOT Delivered.Q;

END_PROGRAM
