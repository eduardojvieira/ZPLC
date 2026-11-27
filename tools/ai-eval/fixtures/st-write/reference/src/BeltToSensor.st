PROGRAM BeltToSensor
VAR_INPUT
    Start  AT %I0.0 : BOOL;
    EyeFar AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    Run  AT %Q0.0 : BOOL;
    Emit AT %Q0.1 : BOOL;
END_VAR
VAR
    Running : BOOL;
END_VAR

IF Start THEN
    Running := TRUE;
END_IF;
IF EyeFar THEN
    Running := FALSE;
END_IF;

Run := Running;
Emit := Start;

END_PROGRAM
