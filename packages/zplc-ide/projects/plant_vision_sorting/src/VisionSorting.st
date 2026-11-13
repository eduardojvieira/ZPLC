PROGRAM VisionSorting
VAR_INPUT
    Start AT %IX0.0 : BOOL;  (* StartButton.pressed *)
    Seen  AT %IX0.1 : BOOL;  (* Vision1.detect *)
    Code  AT %IW1   : INT;   (* Vision1.code: 1 or 2, 0 when none *)
END_VAR
VAR_OUTPUT
    RunIn   AT %QX0.0 : BOOL;  (* Infeed.run *)
    RunSide AT %QX0.1 : BOOL;  (* SideBelt.run *)
    Divert  AT %QX0.2 : BOOL;  (* Arm1.divert *)
    Busy    AT %QX0.3 : BOOL;  (* Beacon.amber *)
    Done    AT %QX0.4 : BOOL;  (* Beacon.green *)
END_VAR
VAR
    Active  : BOOL;
    Lock    : INT := 0;   (* scans until the next decision: the next item is not read while the last one is still in the field *)
    Wait    : INT := 0;   (* scans until the arm swings: the item ahead must have passed the arm's free end *)
    ArmHold : INT := 0;   (* scans the arm stays across the belt *)
    Handled : INT := 0;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;
RunIn := Active;
RunSide := Active;

IF Lock > 0 THEN
    Lock := Lock - 1;
END_IF;

(* The code is read while the item is in the field, about 2 s before the item reaches the arm. A code 2
   item gets the arm across 0.7 s after the reading: earlier, the swing would hit the previous item,
   which is still passing the free end of the arm, and later the arm would be late. The arm then stays
   across for 5.3 s, until the item has passed its free end (about 3 s after it reaches the arm), and
   is back before the next item arrives. The times hold with the belts 10% fast or slow. *)
IF Active AND Lock = 0 AND Code <> 0 THEN
    Handled := Handled + 1;
    Lock := 450;
    IF Code = 2 THEN
        Wait := 70;
    END_IF;
END_IF;

IF Wait > 0 THEN
    Wait := Wait - 1;
    IF Wait = 0 THEN
        Divert := TRUE;
        ArmHold := 530;
    END_IF;
END_IF;

IF ArmHold > 0 THEN
    ArmHold := ArmHold - 1;
    IF ArmHold = 0 THEN
        Divert := FALSE;
    END_IF;
END_IF;

Done := Handled >= 12;
Busy := Active AND NOT Done;

END_PROGRAM
