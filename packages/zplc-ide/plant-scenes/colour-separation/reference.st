PROGRAM ColourSeparation
VAR_INPUT
    Start     AT %I0.0 : BOOL;
    Waiting   AT %I0.1 : BOOL;
    IsRed     AT %I0.2 : BOOL;
    Extended  AT %I0.3 : BOOL;
    Retracted AT %I0.4 : BOOL;
END_VAR
VAR_OUTPUT
    RunIn     AT %Q0.0 : BOOL;
    RunOut    AT %Q0.1 : BOOL;
    RunSide   AT %Q0.2 : BOOL;
    Hold      AT %Q0.3 : BOOL;
    Push      AT %Q0.4 : BOOL;
    Busy      AT %Q0.5 : BOOL;
    Done      AT %Q0.6 : BOOL;
END_VAR
VAR
    Active  : BOOL;
    State   : INT;
    Red     : BOOL;
    Handled : INT;
    Settle  : TON;
    Clear   : TON;
END_VAR

IF Start THEN
    Active := TRUE;
END_IF;

(* the workpiece must lie still against the blade before its colour is read; after the
   release it must have left the blade before the blade holds again *)
Settle(IN := Waiting AND State = 0, PT := T#300ms);
Clear(IN := State = 3 AND NOT Waiting, PT := T#1500ms);

(* one state per step: 0 wait for a workpiece, 1 push it out, 2 pull the plate back,
   3 let a blue one go by *)
CASE State OF
    0:
        IF Active AND Settle.Q THEN
            Red := IsRed;
            IF Red THEN
                State := 1;
            ELSE
                State := 3;
            END_IF;
        END_IF;
    1:
        IF Extended THEN
            State := 2;
        END_IF;
    2:
        IF Retracted THEN
            Handled := Handled + 1;
            State := 0;
        END_IF;
    3:
        IF Clear.Q THEN
            Handled := Handled + 1;
            State := 0;
        END_IF;
END_CASE;

RunIn   := Active;
RunOut  := Active;
RunSide := Active;
(* the blade lets a blue workpiece go and holds everything else *)
Hold    := Active AND State <> 3;
Push    := State = 1;
Done    := Handled >= 8;
Busy    := Active AND NOT Done;

END_PROGRAM
