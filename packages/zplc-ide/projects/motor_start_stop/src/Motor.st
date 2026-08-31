PROGRAM Motor

VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
    EStop AT %I0.2 : BOOL;
    Overload AT %I0.3 : BOOL;
END_VAR

VAR
    SealIn : BOOL := FALSE;
    StartArmed : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    Forward AT %Q0.0 : BOOL;
    Reverse AT %Q0.1 : BOOL;
END_VAR

IF Stop OR EStop OR Overload THEN
    SealIn := FALSE;
    StartArmed := FALSE;
ELSIF NOT Start THEN
    StartArmed := TRUE;
ELSIF StartArmed THEN
    SealIn := TRUE;
END_IF;

Forward := SealIn;
Reverse := FALSE;

END_PROGRAM
