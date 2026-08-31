PROGRAM ScanSnapshot

VAR_INPUT
    Button AT %I0.0 : BOOL;
END_VAR

VAR
    Previous : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    Current AT %Q0.0 : BOOL;
    Delayed AT %Q0.1 : BOOL;
    RisingPulse AT %Q0.2 : BOOL;
END_VAR

Current := Button;
Delayed := Previous;
RisingPulse := Current AND NOT Delayed;
Previous := Button;

END_PROGRAM
