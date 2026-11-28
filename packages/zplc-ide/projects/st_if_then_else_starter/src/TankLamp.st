PROGRAM TankLamp
VAR_INPUT AboveLow AT %I0.0 : BOOL; AboveHigh AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT LampLow AT %QX0.0 : BOOL; LampOk AT %QX0.1 : BOOL; LampHigh AT %QX0.2 : BOOL; END_VAR
(* Exercise: exactly one of the three lamps is ON: LampLow while the level is below the low mark, LampHigh while it is above the high mark, LampOk between the two marks. *)
IF NOT AboveLow THEN
    LampLow := TRUE;
ELSIF NOT AboveHigh THEN
    LampOk := TRUE;
ELSIF AboveHigh THEN
    LampHigh := TRUE;
END_IF;
END_PROGRAM
