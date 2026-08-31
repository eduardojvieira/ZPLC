PROGRAM TankLevel

VAR_INPUT
    AutoEnable AT %I0.0 : BOOL;
    LevelLow AT %I0.1 : BOOL;
    LevelHigh AT %I0.2 : BOOL;
    PumpFault AT %I0.3 : BOOL;
    EStop AT %I0.4 : BOOL;
    Reset AT %I0.5 : BOOL;
END_VAR

VAR
    PumpLatched : BOOL := FALSE;
    FaultLatched : BOOL := FALSE;
    ResetArmed : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    Pump AT %Q0.0 : BOOL;
    Alarm AT %Q0.1 : BOOL;
END_VAR

IF EStop OR PumpFault THEN
    PumpLatched := FALSE;
    FaultLatched := TRUE;
    ResetArmed := FALSE;
ELSIF FaultLatched THEN
    PumpLatched := FALSE;
    IF NOT Reset THEN
        ResetArmed := TRUE;
    ELSIF ResetArmed THEN
        FaultLatched := FALSE;
        ResetArmed := FALSE;
    END_IF;
ELSIF NOT AutoEnable OR LevelHigh THEN
    PumpLatched := FALSE;
ELSIF LevelLow THEN
    PumpLatched := TRUE;
END_IF;

Pump := PumpLatched AND AutoEnable AND NOT LevelHigh AND NOT EStop AND NOT PumpFault AND NOT FaultLatched;
Alarm := FaultLatched OR EStop OR PumpFault;

END_PROGRAM
