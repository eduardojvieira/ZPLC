PROGRAM SortCycle
VAR_INPUT
    Start  AT %IX0.0 : BOOL;   (* Start1.pressed *)
    Stable AT %IX0.1 : BOOL;   (* Scale1.stable *)
    Code   AT %IW1   : INT;    (* Eye1.code: 0 to 9 *)
    Weight AT %ID1   : REAL;   (* Scale1.weight: raw 0..2000 for 0..20 kg *)
    Height AT %ID2   : REAL;   (* Array1.height: raw 0..60 for 0..0.6 m *)
END_VAR
VAR_OUTPUT
    BeltRun  AT %QX0.0 : BOOL;   (* Belt1.run *)
    SideRun  AT %QX0.1 : BOOL;   (* Side1.run *)
    BladeOut AT %QX0.2 : BOOL;   (* Blade1.extend *)
    Divert   AT %QX0.3 : BOOL;   (* Arm1.divert *)
    CSeen    AT %QW1   : INT;    (* the code the program decided on *)
    WSeen    AT %QD1   : REAL;   (* the raw weight it decided on *)
    HSeen    AT %QD2   : REAL;   (* the raw height it decided on *)
END_VAR
VAR
    Running : BOOL := FALSE;
    Open    : INT := 0;   (* scans the blade stays retracted *)
    Lock    : INT := 0;   (* scans until the next decision: the arm must be clear of the last workpiece *)
    ArmHold : INT := 0;   (* scans the arm stays across the belt *)
END_VAR

IF Start THEN
    Running := TRUE;
END_IF;
BeltRun := Running;
SideRun := Running;

(* the blade holds a workpiece at the scale; once the scale is stable the program latches what it read, puts the arm across the belt
   for 4.5 s if the code is 2, and lets the workpiece go for one second; the next one waits until the arm is clear *)
IF Open > 0 THEN
    Open := Open - 1;
END_IF;
IF Lock > 0 THEN
    Lock := Lock - 1;
END_IF;
IF Running THEN
    BladeOut := (Open = 0);
    IF Open = 0 AND Lock = 0 AND Stable AND Code <> 0 THEN
        CSeen := Code;
        WSeen := Weight;
        HSeen := Height;
        IF Code = 2 THEN
            Divert := TRUE;
            ArmHold := 450;
        END_IF;
        Open := 100;
        Lock := 450;
        BladeOut := FALSE;
    END_IF;
END_IF;

IF ArmHold > 0 THEN
    ArmHold := ArmHold - 1;
    IF ArmHold = 0 THEN
        Divert := FALSE;
    END_IF;
END_IF;

END_PROGRAM
