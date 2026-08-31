PROGRAM Conveyor

VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
    Reset AT %I0.2 : BOOL;
    PartAtClassifier AT %I0.3 : BOOL;
    MetalDetected AT %I0.4 : BOOL;
    PartAtDiverter AT %I0.5 : BOOL;
    JamDetected AT %I0.6 : BOOL;
END_VAR

VAR
    Requested : BOOL := FALSE;
    Faulted : BOOL := FALSE;
    MetalLatched : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    BeltCommand AT %Q0.0 : BOOL;
    DiverterCommand AT %Q0.1 : BOOL;
    FaultLamp AT %Q0.2 : BOOL;
END_VAR

IF JamDetected THEN
    Faulted := TRUE;
    Requested := FALSE;
ELSIF Stop THEN
    Requested := FALSE;
ELSIF Start AND NOT Faulted THEN
    Requested := TRUE;
END_IF;

IF Reset AND NOT JamDetected THEN
    Faulted := FALSE;
END_IF;

IF PartAtClassifier AND MetalDetected THEN
    MetalLatched := TRUE;
END_IF;

BeltCommand := Requested AND NOT Faulted;
DiverterCommand := BeltCommand AND PartAtDiverter AND MetalLatched;
FaultLamp := Faulted OR JamDetected;

IF PartAtDiverter OR Stop OR JamDetected OR Reset THEN
    MetalLatched := FALSE;
END_IF;

END_PROGRAM
