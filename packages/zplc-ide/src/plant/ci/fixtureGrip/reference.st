PROGRAM GripCycle
VAR_INPUT
    Start AT %IX0.0 : BOOL;   (* Start1.pressed *)
    Held  AT %IX0.1 : BOOL;   (* Pick1.gripped *)
    XPos  AT %ID1   : REAL;   (* Pick1.xPos: raw centimetres, 0..120 for 0..1.2 m *)
    YPos  AT %ID2   : REAL;   (* Pick1.yPos: raw centimetres, 0..100 for 0..1 m *)
END_VAR
VAR_OUTPUT
    Grip  AT %QX0.0 : BOOL;   (* Pick1.grip: vacuum on *)
    XSet  AT %QD1   : REAL;   (* Pick1.xSet, centimetres *)
    YSet  AT %QD2   : REAL;   (* Pick1.ySet, centimetres *)
    XSeen AT %QD3   : REAL;   (* the X position the program reads, for the forcing test *)
END_VAR
VAR
    Step : INT := 0;
    Wait : INT := 0;
END_VAR

XSeen := XPos;
IF Wait > 0 THEN
    Wait := Wait - 1;
END_IF;

(* start, lift clear, over the box (x 40), down on it, grip, lift, over the pallet (x 100), down, release, lift *)
IF Step = 0 THEN
    IF Start THEN
        YSet := 50.0;
        Step := 1;
    END_IF;
ELSIF Step = 1 THEN
    IF YPos >= 49.8 THEN
        XSet := 40.0;
        Step := 2;
    END_IF;
ELSIF Step = 2 THEN
    IF XPos >= 39.8 AND XPos <= 40.2 THEN
        YSet := 30.0;
        Step := 3;
    END_IF;
ELSIF Step = 3 THEN
    IF YPos <= 30.2 THEN
        Grip := TRUE;
        Wait := 30;
        Step := 4;
    END_IF;
ELSIF Step = 4 THEN
    IF Held AND Wait = 0 THEN
        YSet := 75.0;
        Step := 5;
    END_IF;
ELSIF Step = 5 THEN
    IF YPos >= 74.8 THEN
        XSet := 100.0;
        Step := 6;
    END_IF;
ELSIF Step = 6 THEN
    IF XPos >= 99.8 THEN
        YSet := 46.0;
        Step := 7;
    END_IF;
ELSIF Step = 7 THEN
    IF YPos <= 46.2 THEN
        Grip := FALSE;
        Wait := 30;
        Step := 8;
    END_IF;
ELSIF Step = 8 THEN
    IF Wait = 0 THEN
        YSet := 80.0;
        Step := 9;
    END_IF;
END_IF;

END_PROGRAM
