PROGRAM TankLamp
VAR_INPUT AboveLow AT %I0.0 : BOOL; AboveHigh AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT LampLow AT %QX0.0 : BOOL; LampOk AT %QX0.1 : BOOL; LampHigh AT %QX0.2 : BOOL; END_VAR
IF NOT AboveLow THEN
    LampLow := TRUE;
    LampOk := FALSE;
    LampHigh := FALSE;
ELSIF NOT AboveHigh THEN
    LampLow := FALSE;
    LampOk := TRUE;
    LampHigh := FALSE;
ELSE
    LampLow := FALSE;
    LampOk := FALSE;
    LampHigh := TRUE;
END_IF;
END_PROGRAM
